import IORedis from 'ioredis';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

import {
  db,
  organizationExecutionCounters,
  organizationExecutionQuotaAudit,
} from '../database/schema.js';
import { getRedisConnectionOptions } from '../queue/index.js';
import { organizationService } from './OrganizationService.js';
import { getErrorMessage } from '../types/common.js';

export type ExecutionQuotaReason = 'concurrency' | 'throughput';

export class ExecutionQuotaExceededError extends Error {
  public readonly limit: number;
  public readonly current: number;
  public readonly reason: ExecutionQuotaReason;
  public readonly organizationId: string;
  public readonly windowCount?: number;
  public readonly windowStart?: Date;
  public readonly executionId?: string;

  constructor(params: {
    organizationId: string;
    reason: ExecutionQuotaReason;
    limit: number;
    current: number;
    windowCount?: number;
    windowStart?: Date;
    executionId?: string;
    message?: string;
  }) {
    const message =
      params.message ??
      (params.reason === 'concurrency'
        ? `Organization ${params.organizationId} has reached its concurrency limit (${params.limit})`
        : `Organization ${params.organizationId} has reached its throughput limit (${params.limit}/min)`);
    super(message);
    this.reason = params.reason;
    this.limit = params.limit;
    this.current = params.current;
    this.organizationId = params.organizationId;
    this.windowCount = params.windowCount;
    this.windowStart = params.windowStart;
    this.executionId = params.executionId;
  }
}

export interface ExecutionQuotaCounters {
  running: number;
  windowStartMs: number;
  windowCount: number;
}

type AdmissionDecision =
  | {
      allowed: true;
      state: ExecutionQuotaCounters;
    }
  | {
      allowed: false;
      reason: ExecutionQuotaReason;
      limit: number;
      current: number;
      state: ExecutionQuotaCounters;
    };

type RunningDecision =
  | {
      allowed: true;
      state: ExecutionQuotaCounters;
    }
  | {
      allowed: false;
      limit: number;
      current: number;
      state: ExecutionQuotaCounters;
    };

const WINDOW_MS = 60_000;
const REDIS_HASH_RUNNING = 'running';
const REDIS_HASH_WINDOW_START = 'window_start';
const REDIS_HASH_WINDOW_COUNT = 'window_count';
const REDIS_HASH_UPDATED = 'updated_at';

function nowMs(): number {
  return Date.now();
}

function cloneState(state: ExecutionQuotaCounters): ExecutionQuotaCounters {
  return { ...state };
}

export class ExecutionQuotaService {
  private redis: IORedis | null = null;
  private redisConnecting: Promise<IORedis | null> | null = null;
  private readonly memoryState = new Map<string, ExecutionQuotaCounters>();

  public async reserveAdmission(
    organizationId: string,
    limits: { maxConcurrentExecutions: number; maxExecutionsPerMinute: number }
  ): Promise<AdmissionDecision> {
    const state = await this.loadState(organizationId);
    const normalized = this.resetWindowIfExpired(state);

    if (normalized.running >= limits.maxConcurrentExecutions) {
      return {
        allowed: false,
        reason: 'concurrency',
        limit: limits.maxConcurrentExecutions,
        current: normalized.running,
        state: normalized,
      };
    }

    if (normalized.windowCount >= limits.maxExecutionsPerMinute) {
      return {
        allowed: false,
        reason: 'throughput',
        limit: limits.maxExecutionsPerMinute,
        current: normalized.windowCount,
        state: normalized,
      };
    }

    normalized.windowCount += 1;
    await this.persistState(organizationId, normalized);
    return { allowed: true, state: normalized };
  }

  public async releaseAdmission(organizationId: string): Promise<void> {
    const state = await this.loadState(organizationId);
    state.windowCount = Math.max(0, state.windowCount - 1);
    await this.persistState(organizationId, this.resetWindowIfExpired(state));
  }

  public async acquireRunningSlot(
    organizationId: string,
    limits: { maxConcurrentExecutions: number }
  ): Promise<RunningDecision> {
    const state = await this.loadState(organizationId);
    const normalized = this.resetWindowIfExpired(state);

    if (normalized.running >= limits.maxConcurrentExecutions) {
      return {
        allowed: false,
        limit: limits.maxConcurrentExecutions,
        current: normalized.running,
        state: normalized,
      };
    }

    normalized.running += 1;
    await this.persistState(organizationId, normalized);
    return { allowed: true, state: normalized };
  }

  public async releaseRunningSlot(organizationId: string): Promise<void> {
    const state = await this.loadState(organizationId);
    state.running = Math.max(0, state.running - 1);
    await this.persistState(organizationId, this.resetWindowIfExpired(state));
  }

  public async getState(organizationId: string): Promise<ExecutionQuotaCounters> {
    const state = await this.loadState(organizationId);
    const normalized = this.resetWindowIfExpired(state);
    if (normalized !== state) {
      await this.persistState(organizationId, normalized);
    }
    return cloneState(normalized);
  }

  public async recordQuotaEvent(params: {
    organizationId: string;
    reason: ExecutionQuotaReason;
    limit: number;
    current: number;
    state: ExecutionQuotaCounters;
    metadata?: Record<string, any>;
  }): Promise<void> {
    if (!db) {
      return;
    }

    try {
      await db.insert(organizationExecutionQuotaAudit).values({
        id: randomUUID(),
        organizationId: params.organizationId,
        eventType: params.reason,
        limitValue: params.limit,
        observedValue: params.current,
        windowCount: params.state.windowCount,
        windowStart: new Date(params.state.windowStartMs),
        metadata: params.metadata ?? null,
      });
    } catch (error) {
      console.warn(
        '[ExecutionQuotaService] Failed to persist quota audit event:',
        getErrorMessage(error)
      );
    }
  }

  private resetWindowIfExpired(state: ExecutionQuotaCounters): ExecutionQuotaCounters {
    const copy = cloneState(state);
    const delta = nowMs() - copy.windowStartMs;
    if (delta >= WINDOW_MS) {
      copy.windowStartMs = nowMs();
      copy.windowCount = 0;
    }
    return copy;
  }

  private async loadState(organizationId: string): Promise<ExecutionQuotaCounters> {
    const cached = this.memoryState.get(organizationId);
    if (cached) {
      return cloneState(cached);
    }

    const fromDb = await this.loadFromDatabase(organizationId);
    if (fromDb) {
      this.memoryState.set(organizationId, cloneState(fromDb));
      return fromDb;
    }

    const fromRedis = await this.loadFromRedis(organizationId);
    if (fromRedis) {
      this.memoryState.set(organizationId, cloneState(fromRedis));
      return fromRedis;
    }

    const empty: ExecutionQuotaCounters = {
      running: 0,
      windowStartMs: nowMs(),
      windowCount: 0,
    };
    this.memoryState.set(organizationId, cloneState(empty));
    return empty;
  }

  private async loadFromDatabase(organizationId: string): Promise<ExecutionQuotaCounters | null> {
    if (!db) {
      return null;
    }

    try {
      const [row] = await db
        .select()
        .from(organizationExecutionCounters)
        .where(eq(organizationExecutionCounters.organizationId, organizationId))
        .limit(1);

      if (!row) {
        return null;
      }

      const windowStart = row.windowStart instanceof Date ? row.windowStart.getTime() : nowMs();
      return {
        running: row.runningExecutions ?? 0,
        windowStartMs: windowStart,
        windowCount: row.executionsInWindow ?? 0,
      };
    } catch (error) {
      console.warn('[ExecutionQuotaService] Failed to load counters from database:', error);
      return null;
    }
  }

  private async loadFromRedis(organizationId: string): Promise<ExecutionQuotaCounters | null> {
    const client = await this.getRedisClient();
    if (!client) {
      return null;
    }

    try {
      const key = this.redisKey(organizationId);
      const [runningRaw, windowStartRaw, windowCountRaw] = await client.hmget(
        key,
        REDIS_HASH_RUNNING,
        REDIS_HASH_WINDOW_START,
        REDIS_HASH_WINDOW_COUNT
      );

      if (runningRaw === null && windowStartRaw === null && windowCountRaw === null) {
        return null;
      }

      return {
        running: Number.parseInt(runningRaw ?? '0', 10) || 0,
        windowStartMs: Number.parseInt(windowStartRaw ?? `${nowMs()}`, 10) || nowMs(),
        windowCount: Number.parseInt(windowCountRaw ?? '0', 10) || 0,
      };
    } catch (error) {
      console.warn('[ExecutionQuotaService] Failed to load counters from Redis:', error);
      return null;
    }
  }

  private async persistState(organizationId: string, state: ExecutionQuotaCounters): Promise<void> {
    const copy = cloneState(state);
    this.memoryState.set(organizationId, copy);
    await this.persistToDatabase(organizationId, copy);
    await this.persistToRedis(organizationId, copy);
    await organizationService.updateExecutionUsageSnapshot(organizationId, {
      concurrentExecutions: copy.running,
      executionsInCurrentWindow: copy.windowCount,
    });
  }

  private async persistToDatabase(organizationId: string, state: ExecutionQuotaCounters): Promise<void> {
    if (!db) {
      return;
    }

    const now = new Date();
    try {
      await db
        .insert(organizationExecutionCounters)
        .values({
          organizationId,
          runningExecutions: state.running,
          executionsInWindow: state.windowCount,
          windowStart: new Date(state.windowStartMs),
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: organizationExecutionCounters.organizationId,
          set: {
            runningExecutions: state.running,
            executionsInWindow: state.windowCount,
            windowStart: new Date(state.windowStartMs),
            updatedAt: now,
          },
        });
    } catch (error) {
      console.warn('[ExecutionQuotaService] Failed to persist counters to database:', error);
    }
  }

  private async persistToRedis(organizationId: string, state: ExecutionQuotaCounters): Promise<void> {
    const client = await this.getRedisClient();
    if (!client) {
      return;
    }

    try {
      const key = this.redisKey(organizationId);
      await client.hset(key, {
        [REDIS_HASH_RUNNING]: state.running,
        [REDIS_HASH_WINDOW_START]: state.windowStartMs,
        [REDIS_HASH_WINDOW_COUNT]: state.windowCount,
        [REDIS_HASH_UPDATED]: nowMs(),
      });
    } catch (error) {
      console.warn('[ExecutionQuotaService] Failed to persist counters to Redis:', error);
    }
  }

  private redisKey(organizationId: string): string {
    return `org:${organizationId}:execution_quota`;
  }

  private async getRedisClient(): Promise<IORedis | null> {
    if (this.redis) {
      return this.redis;
    }

    if (this.redisConnecting) {
      return this.redisConnecting;
    }

    this.redisConnecting = (async () => {
      try {
        const options = getRedisConnectionOptions();
        const client = new IORedis(options);
        client.on('error', (error) => {
          console.warn('[ExecutionQuotaService] Redis error:', getErrorMessage(error));
        });
        client.on('end', () => {
          if (this.redis === client) {
            this.redis = null;
          }
        });
        await new Promise<void>((resolve, reject) => {
          client.once('ready', resolve);
          client.once('error', reject);
        });
        this.redis = client;
        return client;
      } catch (error) {
        console.warn(
          '[ExecutionQuotaService] Unable to establish Redis connection:',
          getErrorMessage(error)
        );
        return null;
      } finally {
        this.redisConnecting = null;
      }
    })();

    return this.redisConnecting;
  }
}

export const executionQuotaService = new ExecutionQuotaService();
