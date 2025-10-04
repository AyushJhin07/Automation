import IORedis, { type RedisOptions as IoRedisOptions } from 'ioredis';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';

import { db } from '../database/schema.js';
import { getRedisConnectionOptions } from '../queue/index.js';
import { getErrorMessage } from '../types/common.js';

const DEFAULT_TTL_MS = 30_000;
const REDIS_SCRIPT_RELEASE =
  'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';

export type SchedulerLockStrategy = 'redis' | 'postgres' | 'memory';

export interface SchedulerLockHandle {
  readonly resource: string;
  readonly mode: SchedulerLockStrategy;
  release(): Promise<void>;
}

interface AcquireLockOptions {
  ttlMs?: number;
}

interface SchedulerLockServiceOptions {
  strategy?: SchedulerLockStrategy | 'auto';
}

type AcquireAttempt =
  | { status: 'acquired'; handle: SchedulerLockHandle }
  | { status: 'busy' }
  | { status: 'error'; error: unknown };

interface MemoryLockEntry {
  readonly token: string;
  readonly timeout: NodeJS.Timeout;
}

export interface SchedulerLockTelemetrySnapshot {
  preferredStrategy: SchedulerLockStrategy;
  strategyOverride: SchedulerLockStrategy | 'auto';
  postgresAvailable: boolean;
  redis: {
    status: string;
    isConnected: boolean;
    isConnecting: boolean;
  };
  memoryLocks: {
    count: number;
    resources: string[];
  };
}

export class SchedulerLockService {
  private redis: IORedis | null = null;
  private redisConnecting: Promise<IORedis | null> | null = null;
  private readonly memoryLocks = new Map<string, MemoryLockEntry>();
  private strategyOverride: SchedulerLockStrategy | 'auto';

  constructor(options: SchedulerLockServiceOptions = {}) {
    this.strategyOverride = options.strategy ?? 'auto';
  }

  public getPreferredStrategy(): SchedulerLockStrategy {
    if (this.strategyOverride !== 'auto') {
      return this.strategyOverride;
    }

    if (db) {
      return 'postgres';
    }

    if ((process.env.QUEUE_DRIVER ?? '').toLowerCase() !== 'inmemory') {
      return 'redis';
    }

    return 'memory';
  }

  public setStrategyOverrideForTests(strategy: SchedulerLockStrategy | 'auto'): void {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('setStrategyOverrideForTests is only available in test environments');
    }
    this.strategyOverride = strategy;
  }

  public getTelemetrySnapshot(): SchedulerLockTelemetrySnapshot {
    const redisStatus = this.redis?.status ?? 'disconnected';

    return {
      preferredStrategy: this.getPreferredStrategy(),
      strategyOverride: this.strategyOverride,
      postgresAvailable: Boolean(db),
      redis: {
        status: redisStatus,
        isConnected: redisStatus === 'ready',
        isConnecting: Boolean(this.redisConnecting),
      },
      memoryLocks: {
        count: this.memoryLocks.size,
        resources: Array.from(this.memoryLocks.keys()),
      },
    };
  }

  public async acquireLock(resource: string, options: AcquireLockOptions = {}): Promise<SchedulerLockHandle | null> {
    const ttlMs = Math.max(1_000, options.ttlMs ?? DEFAULT_TTL_MS);
    const strategy = this.getPreferredStrategy();

    if (strategy === 'postgres') {
      const attempt = await this.tryAcquirePostgresLock(resource);
      if (attempt.status === 'acquired') {
        return attempt.handle;
      }
      if (attempt.status === 'busy') {
        return null;
      }
      return (await this.tryAcquireMemoryLock(resource, ttlMs)).handle ?? null;
    }

    if (strategy === 'redis') {
      const attempt = await this.tryAcquireRedisLock(resource, ttlMs);
      if (attempt.status === 'acquired') {
        return attempt.handle;
      }
      if (attempt.status === 'busy') {
        return null;
      }
      return (await this.tryAcquireMemoryLock(resource, ttlMs)).handle ?? null;
    }

    return (await this.tryAcquireMemoryLock(resource, ttlMs)).handle ?? null;
  }

  public async shutdown(): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.quit();
      } catch {
        this.redis.disconnect();
      }
    }
    this.redis = null;
    this.redisConnecting = null;

    for (const { timeout } of this.memoryLocks.values()) {
      clearTimeout(timeout);
    }
    this.memoryLocks.clear();
  }

  private async tryAcquirePostgresLock(resource: string): Promise<AcquireAttempt> {
    if (!db) {
      return { status: 'error', error: new Error('Postgres database is not configured') };
    }

    try {
      const result = await db.execute(
        sql`select pg_try_advisory_lock(hashtext(${resource})::bigint) as acquired`
      );

      const rows = Array.isArray((result as { rows?: unknown[] }).rows)
        ? ((result as { rows: unknown[] }).rows as Array<Record<string, unknown>>)
        : [];
      const row = rows[0] ?? {};
      const acquired = Boolean(row.acquired ?? row.pg_try_advisory_lock);

      if (!acquired) {
        return { status: 'busy' };
      }

      return {
        status: 'acquired',
        handle: {
          resource,
          mode: 'postgres',
          release: async () => {
            try {
              await db.execute(sql`select pg_advisory_unlock(hashtext(${resource})::bigint)`);
            } catch (error) {
              console.warn('[SchedulerLockService] Failed to release Postgres advisory lock', {
                resource,
                error,
              });
            }
          },
        },
      };
    } catch (error) {
      console.warn('[SchedulerLockService] Unable to acquire Postgres advisory lock', {
        resource,
        error,
      });
      return { status: 'error', error };
    }
  }

  private async tryAcquireRedisLock(resource: string, ttlMs: number): Promise<AcquireAttempt> {
    const client = await this.getRedisClient();
    if (!client) {
      return { status: 'error', error: new Error('Redis client not available') };
    }

    const key = this.redisKey(resource);
    const token = randomUUID();

    try {
      const result = await client.set(key, token, 'PX', ttlMs, 'NX');
      if (result !== 'OK') {
        return { status: 'busy' };
      }

      return {
        status: 'acquired',
        handle: {
          resource,
          mode: 'redis',
          release: async () => {
            try {
              await client.eval(REDIS_SCRIPT_RELEASE, 1, key, token);
            } catch (error) {
              console.warn('[SchedulerLockService] Failed to release Redis scheduler lock', {
                resource,
                error,
              });
            }
          },
        },
      };
    } catch (error) {
      console.warn('[SchedulerLockService] Unable to acquire Redis scheduler lock', {
        resource,
        error,
      });
      return { status: 'error', error };
    }
  }

  private async tryAcquireMemoryLock(resource: string, ttlMs: number): Promise<AcquireAttempt> {
    if (this.memoryLocks.has(resource)) {
      return { status: 'busy' };
    }

    const token = randomUUID();
    const timeout = setTimeout(() => {
      const entry = this.memoryLocks.get(resource);
      if (entry && entry.token === token) {
        this.memoryLocks.delete(resource);
      }
    }, ttlMs);
    timeout.unref?.();

    this.memoryLocks.set(resource, { token, timeout });

    return {
      status: 'acquired',
      handle: {
        resource,
        mode: 'memory',
        release: async () => {
          const entry = this.memoryLocks.get(resource);
          if (entry && entry.token === token) {
            clearTimeout(entry.timeout);
            this.memoryLocks.delete(resource);
          }
        },
      },
    };
  }

  private redisKey(resource: string): string {
    return `scheduler:lock:${resource}`;
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
        const baseOptions = getRedisConnectionOptions();
        const client = new IORedis({
          ...(baseOptions as IoRedisOptions),
          enableOfflineQueue: false,
          lazyConnect: true,
          maxRetriesPerRequest: 0,
        });
        client.on('error', (error) => {
          console.warn('[SchedulerLockService] Redis error', getErrorMessage(error));
        });
        client.on('end', () => {
          if (this.redis === client) {
            this.redis = null;
          }
        });
        await client.connect();
        this.redis = client;
        return client;
      } catch (error) {
        console.warn('[SchedulerLockService] Failed to establish Redis connection', getErrorMessage(error));
        return null;
      } finally {
        this.redisConnecting = null;
      }
    })();

    return this.redisConnecting;
  }
}

let singleton: SchedulerLockService = new SchedulerLockService();

export function getSchedulerLockService(): SchedulerLockService {
  return singleton;
}

export function setSchedulerLockServiceForTests(service: SchedulerLockService): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('setSchedulerLockServiceForTests is only available in test environments');
  }
  void singleton.shutdown();
  singleton = service;
}

export function resetSchedulerLockServiceForTests(): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('resetSchedulerLockServiceForTests is only available in test environments');
  }
  void singleton.shutdown();
  singleton = new SchedulerLockService();
}

