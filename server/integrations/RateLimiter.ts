import IORedis from 'ioredis';

import { getRedisConnectionOptions } from '../queue/index';

export type RateLimitHeaderConfig = {
  limit?: string[];
  remaining?: string[];
  reset?: string[];
  retryAfter?: string[];
};

export type RateLimitConcurrencyRule = {
  maxConcurrent?: number;
  scope?: 'connection' | 'connector' | 'organization';
};

export type RateLimitRules = {
  requestsPerSecond?: number;
  requestsPerMinute?: number;
  burst?: number;
  concurrency?: RateLimitConcurrencyRule | null;
  rateHeaders?: RateLimitHeaderConfig | null;
};

export interface AcquireOptions {
  connectorId: string;
  connectionId?: string | null;
  organizationId?: string | null;
  tokens?: number;
  rules?: RateLimitRules | null;
}

export interface AcquireResult {
  waitMs: number;
  attempts: number;
  enforced: boolean;
  release?: () => void;
}

type TokenBucketConfig = {
  capacity: number;
  refillRatePerMs: number;
  ttlMs: number;
};

type LocalBucket = TokenBucketConfig & {
  tokens: number;
  lastRefill: number;
};

const TOKEN_BUCKET_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local capacity = tonumber(ARGV[2])
local refill_rate = tonumber(ARGV[3])
local tokens_requested = tonumber(ARGV[4])
local ttl = tonumber(ARGV[5])

local bucket = redis.call('HMGET', key, 'tokens', 'last_refill')
local tokens = bucket[1]
local last_refill = bucket[2]

if tokens then
  tokens = tonumber(tokens)
  last_refill = tonumber(last_refill)
  local elapsed = now - last_refill
  if elapsed > 0 then
    local refill = elapsed * refill_rate
    if refill > 0 then
      tokens = math.min(capacity, tokens + refill)
      last_refill = now
    end
  end
else
  tokens = capacity
  last_refill = now
end

local allowed = 0
local retry_ms = 0

if tokens >= tokens_requested then
  allowed = 1
  tokens = tokens - tokens_requested
else
  local deficit = tokens_requested - tokens
  if refill_rate > 0 then
    retry_ms = math.ceil(deficit / refill_rate)
  else
    retry_ms = 1000
  end
end

redis.call('HMSET', key, 'tokens', tokens, 'last_refill', last_refill)
redis.call('PEXPIRE', key, ttl)

return { allowed, retry_ms }
`;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function coalesceNumbers(...values: (number | undefined)[]): number | undefined {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return value;
    }
  }
  return undefined;
}

function normalizeId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9:_-]/g, '-');
}

export class RateLimiter {
  private redis: IORedis | null = null;
  private connecting: Promise<IORedis | null> | null = null;
  private scriptSha?: string;
  private readonly localBuckets = new Map<string, LocalBucket>();
  private readonly penalties = new Map<string, number>();
  private readonly concurrencyStates = new Map<
    string,
    { active: number; queue: Array<() => void> }
  >();
  private warnedFallback = false;

  public async acquire(options: AcquireOptions): Promise<AcquireResult> {
    const connectorId = normalizeId(options.connectorId || 'unknown');
    const connectionId = options.connectionId ? normalizeId(options.connectionId) : 'global';
    const organizationId = options.organizationId ? normalizeId(options.organizationId) : 'global';
    const key = `rate:${connectorId}:${connectionId}`;

    const tokens = Math.max(1, Math.ceil(options.tokens ?? 1));
    const bucketConfig = this.buildBucketConfig(options.rules);

    const penaltyWait = await this.enforcePenalty({ connectorId, connectionId, organizationId });
    const { waitMs: concurrencyWait, release: releaseConcurrency, waited: concurrencyWaited } =
      await this.acquireConcurrency(options, connectorId);

    const client = await this.getRedisClient();
    if (client) {
      try {
        const bucketResult = await this.acquireWithRedis(client, key, bucketConfig, tokens);
        return {
          waitMs: bucketResult.waitMs + penaltyWait + concurrencyWait,
          attempts: bucketResult.attempts + (concurrencyWaited ? 1 : 0),
          enforced: bucketResult.enforced || penaltyWait > 0 || concurrencyWaited,
          release: releaseConcurrency,
        };
      } catch (error: any) {
        console.warn('[RateLimiter] Redis acquisition failed, falling back to in-memory limiter:', error?.message || error);
        if (this.redis === client) {
          this.redis = null;
          this.connecting = null;
        }
      }
    }

    const localResult = await this.acquireLocally(key, bucketConfig, tokens);
    return {
      waitMs: localResult.waitMs + penaltyWait + concurrencyWait,
      attempts: localResult.attempts + (concurrencyWaited ? 1 : 0),
      enforced: localResult.enforced || penaltyWait > 0 || concurrencyWaited,
      release: releaseConcurrency,
    };
  }

  public schedulePenalty(options: {
    connectorId: string;
    connectionId?: string | null;
    organizationId?: string | null;
    waitMs: number;
    scope?: 'connection' | 'connector' | 'organization';
  }): void {
    const connectorId = normalizeId(options.connectorId || 'unknown');
    const connectionId = options.connectionId ? normalizeId(options.connectionId) : 'global';
    const organizationId = options.organizationId ? normalizeId(options.organizationId) : 'global';
    const scope = options.scope ?? 'connection';

    let key: string;
    switch (scope) {
      case 'organization':
        key = `penalty:${connectorId}:org:${organizationId}`;
        break;
      case 'connector':
        key = `penalty:${connectorId}`;
        break;
      case 'connection':
      default:
        key = `penalty:${connectorId}:${connectionId}`;
        break;
    }

    const waitMs = Math.max(0, Math.round(options.waitMs));
    if (waitMs <= 0) {
      this.penalties.delete(key);
      return;
    }

    const until = Date.now() + waitMs;
    const existing = this.penalties.get(key) ?? 0;
    this.penalties.set(key, Math.max(existing, until));
  }

  private buildBucketConfig(rules?: RateLimitRules | null): TokenBucketConfig {
    const defaultRps = 5;
    const requestsPerSecond = coalesceNumbers(
      rules?.requestsPerSecond,
      rules?.requestsPerMinute ? rules.requestsPerMinute / 60 : undefined,
      defaultRps
    ) ?? defaultRps;

    const boundedRps = Math.max(0.1, Math.min(requestsPerSecond, 1000));
    const refillRatePerMs = boundedRps / 1000;

    const burstCandidate = coalesceNumbers(rules?.burst, Math.ceil(boundedRps * 3));
    const capacity = Math.max(1, Math.round(burstCandidate ?? Math.ceil(boundedRps * 3)));

    const ttlMs = Math.max(60000, Math.ceil((capacity / refillRatePerMs) * 2));

    return { capacity, refillRatePerMs, ttlMs };
  }

  private async acquireWithRedis(
    client: IORedis,
    key: string,
    bucket: TokenBucketConfig,
    tokens: number
  ): Promise<AcquireResult> {
    let totalWaitMs = 0;
    let waits = 0;

    const sha = await this.ensureScript(client);

    while (true) {
      const now = Date.now();
      const response = await this.evalTokenBucket(client, sha, key, now, bucket, tokens);
      const allowed = Number(response?.[0]) === 1;
      const retryMs = Math.max(0, Math.round(Number(response?.[1]) || 0));

      if (allowed) {
        return { waitMs: totalWaitMs, attempts: waits, enforced: waits > 0 };
      }

      const waitMs = Math.max(50, retryMs || 0);
      waits += 1;
      totalWaitMs += waitMs;
      await sleep(waitMs);
    }
  }

  private async evalTokenBucket(
    client: IORedis,
    sha: string,
    key: string,
    now: number,
    bucket: TokenBucketConfig,
    tokens: number
  ): Promise<[number, number]> {
    try {
      const result = (await client.evalsha(
        sha,
        1,
        key,
        now,
        bucket.capacity,
        bucket.refillRatePerMs,
        tokens,
        bucket.ttlMs
      )) as [number, number];
      return result;
    } catch (error: any) {
      if (typeof error?.message === 'string' && error.message.includes('NOSCRIPT')) {
        this.scriptSha = undefined;
        const freshSha = await this.ensureScript(client);
        return this.evalTokenBucket(client, freshSha, key, now, bucket, tokens);
      }
      throw error;
    }
  }

  private async ensureScript(client: IORedis): Promise<string> {
    if (this.scriptSha) {
      return this.scriptSha;
    }

    this.scriptSha = await client.script('LOAD', TOKEN_BUCKET_SCRIPT);
    return this.scriptSha;
  }

  private async getRedisClient(): Promise<IORedis | null> {
    if (this.redis) {
      return this.redis;
    }
    if (this.connecting) {
      return this.connecting;
    }

    this.connecting = this.connectRedis();
    this.redis = await this.connecting;
    this.connecting = null;
    return this.redis;
  }

  private async connectRedis(): Promise<IORedis | null> {
    try {
      const options = getRedisConnectionOptions();
      const client = new IORedis({
        ...options,
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 2,
      } as any);

      client.on('error', (err) => {
        console.warn('[RateLimiter] Redis error:', err?.message || err);
      });

      client.on('end', () => {
        if (this.redis === client) {
          this.redis = null;
          this.connecting = null;
        }
      });

      await client.connect();
      console.log('[RateLimiter] Connected to Redis for distributed token buckets');
      return client;
    } catch (error: any) {
      if (!this.warnedFallback) {
        this.warnedFallback = true;
        console.warn(
          '[RateLimiter] Falling back to in-memory limiter because Redis connection failed:',
          error?.message || error
        );
      }
      return null;
    }
  }

  private async enforcePenalty(context: {
    connectorId: string;
    connectionId: string;
    organizationId: string;
  }): Promise<number> {
    const keys = [
      `penalty:${context.connectorId}:${context.connectionId}`,
      `penalty:${context.connectorId}:org:${context.organizationId}`,
      `penalty:${context.connectorId}`,
    ];

    let waited = 0;

    while (true) {
      const now = Date.now();
      let maxUntil = 0;

      for (const key of keys) {
        const until = this.penalties.get(key);
        if (!until) {
          continue;
        }
        if (until <= now) {
          this.penalties.delete(key);
          continue;
        }
        maxUntil = Math.max(maxUntil, until);
      }

      if (maxUntil === 0) {
        return waited;
      }

      const waitMs = Math.max(10, maxUntil - now);
      await sleep(waitMs);
      waited += waitMs;

      const refreshedNow = Date.now();
      for (const key of keys) {
        const until = this.penalties.get(key);
        if (until && until <= refreshedNow) {
          this.penalties.delete(key);
        }
      }
    }
  }

  private async acquireConcurrency(
    options: AcquireOptions,
    normalizedConnectorId: string
  ): Promise<{ waitMs: number; release?: () => void; waited: boolean }> {
    const rule = options.rules?.concurrency;
    const maxConcurrent = rule?.maxConcurrent ?? 0;
    if (!maxConcurrent || maxConcurrent <= 0) {
      return { waitMs: 0, release: undefined, waited: false };
    }

    const scope = rule?.scope ?? 'connection';
    const connectionId = options.connectionId ? normalizeId(options.connectionId) : 'global';
    const organizationId = options.organizationId ? normalizeId(options.organizationId) : 'global';

    let key: string;
    switch (scope) {
      case 'organization':
        key = `concurrency:${normalizedConnectorId}:org:${organizationId}`;
        break;
      case 'connector':
        key = `concurrency:${normalizedConnectorId}`;
        break;
      case 'connection':
      default:
        key = `concurrency:${normalizedConnectorId}:${connectionId}`;
        break;
    }

    const start = Date.now();
    const state = this.concurrencyStates.get(key) ?? { active: 0, queue: [] };
    this.concurrencyStates.set(key, state);

    return new Promise(resolve => {
      const tryAcquire = () => {
        if (state.active < maxConcurrent) {
          state.active += 1;

          const release = () => {
            if (!this.concurrencyStates.has(key)) {
              return;
            }

            state.active = Math.max(0, state.active - 1);
            const next = state.queue.shift();
            if (!next) {
              if (state.active === 0) {
                this.concurrencyStates.delete(key);
              }
              return;
            }
            next();
          };

          const waitMs = Math.max(0, Date.now() - start);
          resolve({ waitMs, release: this.once(release), waited: waitMs > 0 });
          return;
        }

        state.queue.push(tryAcquire);
      };

      tryAcquire();
    });
  }

  private once(fn: () => void): () => void {
    let called = false;
    return () => {
      if (called) {
        return;
      }
      called = true;
      fn();
    };
  }

  private acquireLocally(key: string, bucket: TokenBucketConfig, tokens: number): Promise<AcquireResult> {
    let local = this.localBuckets.get(key);
    if (!local) {
      local = {
        ...bucket,
        tokens: bucket.capacity,
        lastRefill: Date.now(),
      };
      this.localBuckets.set(key, local);
    }

    return this.consumeLocalBucket(local, bucket, tokens);
  }

  private async consumeLocalBucket(
    bucket: LocalBucket,
    config: TokenBucketConfig,
    tokens: number
  ): Promise<AcquireResult> {
    let totalWaitMs = 0;
    let waits = 0;

    while (true) {
      this.refillLocalBucket(bucket, config);
      if (bucket.tokens >= tokens) {
        bucket.tokens -= tokens;
        return { waitMs: totalWaitMs, attempts: waits, enforced: waits > 0 };
      }

      const deficit = tokens - bucket.tokens;
      const waitMs = config.refillRatePerMs > 0 ? Math.ceil(deficit / config.refillRatePerMs) : 1000;
      const boundedWait = Math.max(50, waitMs);
      waits += 1;
      totalWaitMs += boundedWait;
      await sleep(boundedWait);
    }
  }

  private refillLocalBucket(bucket: LocalBucket, config: TokenBucketConfig): void {
    const now = Date.now();
    const elapsed = now - bucket.lastRefill;
    if (elapsed <= 0) {
      return;
    }

    const refill = elapsed * config.refillRatePerMs;
    if (refill > 0) {
      bucket.tokens = Math.min(config.capacity, bucket.tokens + refill);
      bucket.lastRefill = now;
    }
  }
}

export const rateLimiter = new RateLimiter();
