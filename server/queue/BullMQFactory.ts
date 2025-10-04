import {
  Queue,
  QueueEvents,
  Worker,
  type Processor,
  type QueueEventsOptions,
  type QueueOptions,
  type WorkerOptions,
  type RedisOptions,
} from 'bullmq';

import { env } from '../env';
import type { OrganizationRegion } from '../database/schema.js';
import type {
  JobPayload,
  JobPayloads,
  QueueJobCounts,
  QueueName,
  QueueTelemetryOptions,
} from './types';
import type {
  RegionalQueueEventsOptions,
  RegionalQueueOptions,
  RegionalWorkerOptions,
} from './types';

const defaultLogger: Pick<Console, 'info' | 'warn' | 'error'> = console;

function resolveRegionalRedisEnv(region: OrganizationRegion | undefined, key: 'HOST' | 'PORT' | 'DB' | 'USERNAME' | 'PASSWORD' | 'TLS'): string | undefined {
  if (!region) {
    return undefined;
  }
  const suffix = region.toUpperCase();
  const envKey = `QUEUE_REDIS_${suffix}_${key}`;
  return process.env[envKey];
}

function resolveNumber(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getRedisConnectionOptions(region?: OrganizationRegion): RedisOptions {
  const hostOverride = resolveRegionalRedisEnv(region, 'HOST');
  const portOverride = resolveRegionalRedisEnv(region, 'PORT');
  const dbOverride = resolveRegionalRedisEnv(region, 'DB');
  const usernameOverride = resolveRegionalRedisEnv(region, 'USERNAME');
  const passwordOverride = resolveRegionalRedisEnv(region, 'PASSWORD');
  const tlsOverride = resolveRegionalRedisEnv(region, 'TLS');

  const baseOptions: RedisOptions = {
    host: hostOverride ?? env.QUEUE_REDIS_HOST,
    port: resolveNumber(portOverride, env.QUEUE_REDIS_PORT),
    db: resolveNumber(dbOverride, env.QUEUE_REDIS_DB),
  };

  const username = usernameOverride ?? env.QUEUE_REDIS_USERNAME;
  if (username) {
    baseOptions.username = username;
  }
  const password = passwordOverride ?? env.QUEUE_REDIS_PASSWORD;
  if (password) {
    baseOptions.password = password;
  }

  const tlsFlag = (tlsOverride ?? (env.QUEUE_REDIS_TLS ? 'true' : '')).toLowerCase();
  if (tlsFlag === 'true') {
    baseOptions.tls = {};
  }

  return baseOptions;
}

export function createQueue<Name extends QueueName, ResultType = unknown>(
  name: Name,
  options?: RegionalQueueOptions<Name, ResultType>
): Queue<JobPayload<Name>, ResultType, Name> {
  const region = options?.region;
  const connection = { ...getRedisConnectionOptions(region), ...options?.connection };
  const defaultJobOptions = {
    removeOnComplete: true,
    removeOnFail: false,
    ...options?.defaultJobOptions,
  };
  const { region: _region, ...rest } = options ?? {};
  const merged: QueueOptions<JobPayload<Name>, ResultType, Name> = {
    ...rest,
    connection,
    defaultJobOptions,
    prefix: rest.prefix ?? `bull:${String(name)}`,
  };

  return new Queue<JobPayload<Name>, ResultType, Name>(name, merged);
}

export function createWorker<Name extends QueueName, ResultType = unknown>(
  name: Name,
  processor: Processor<JobPayload<Name>, ResultType, Name>,
  options?: RegionalWorkerOptions<Name, ResultType>
): Worker<JobPayload<Name>, ResultType, Name> {
  const region = options?.region;
  const { region: _region, ...rest } = options ?? {};
  const merged: WorkerOptions<JobPayload<Name>, ResultType, Name> = {
    connection: { ...getRedisConnectionOptions(region), ...rest.connection },
    autorun: rest.autorun ?? true,
    ...rest,
  };

  return new Worker<JobPayload<Name>, ResultType, Name>(name, processor, merged);
}

export function createQueueEvents<Name extends QueueName>(
  name: Name,
  options?: RegionalQueueEventsOptions
): QueueEvents {
  const region = options?.region;
  const { region: _region, ...rest } = options ?? {};
  const merged: QueueEventsOptions = {
    connection: { ...getRedisConnectionOptions(region), ...rest.connection },
    autorun: rest.autorun ?? true,
    ...rest,
  };

  return new QueueEvents(name, merged);
}

export function registerQueueTelemetry<Name extends QueueName>(
  queue: Queue<JobPayload<Name>, unknown, Name>,
  queueEvents: QueueEvents,
  options: QueueTelemetryOptions<Name> = {}
): () => void {
  const logger = options.logger ?? defaultLogger;
  const handlers = options.handlers ?? {};
  const metricsIntervalMs = options.metricsIntervalMs ?? env.QUEUE_METRICS_INTERVAL_MS;

  const completedHandler = ({ jobId, returnvalue }: { jobId: string; returnvalue: unknown }) => {
    handlers.onCompleted?.({ jobId, returnValue: returnvalue });
    if (!handlers.onCompleted) {
      logger.info(`[queue:${queue.name}] Job ${jobId} completed`);
    }
  };

  const failedHandler = ({
    jobId,
    failedReason,
    attemptsMade,
  }: {
    jobId: string;
    failedReason: string;
    attemptsMade: number;
  }) => {
    handlers.onFailed?.({ jobId, failedReason, attemptsMade });
    if (!handlers.onFailed) {
      logger.error(
        `[queue:${queue.name}] Job ${jobId} failed after ${attemptsMade} attempts: ${failedReason}`
      );
    }
  };

  const stalledHandler = ({ jobId }: { jobId: string }) => {
    handlers.onStalled?.({ jobId });
    if (!handlers.onStalled) {
      logger.warn(`[queue:${queue.name}] Job ${jobId} stalled`);
    }
  };

  const waitingHandler = ({ jobId }: { jobId: string }) => {
    handlers.onWaiting?.({ jobId });
    if (!handlers.onWaiting) {
      logger.info(`[queue:${queue.name}] Job ${jobId} enqueued`);
    }
  };

  const errorHandler = (error: Error) => {
    handlers.onError?.(error);
    if (!handlers.onError) {
      logger.error(`[queue:${queue.name}] Queue error`, error);
    }
  };

  queueEvents.on('completed', completedHandler as unknown as (...args: unknown[]) => void);
  queueEvents.on('failed', failedHandler as unknown as (...args: unknown[]) => void);
  queueEvents.on('stalled', stalledHandler as unknown as (...args: unknown[]) => void);
  queueEvents.on('waiting', waitingHandler as unknown as (...args: unknown[]) => void);
  queueEvents.on('error', errorHandler);

  let metricsTimer: NodeJS.Timeout | undefined;
  if (metricsIntervalMs > 0) {
    const collectMetrics = async () => {
      try {
        const counts = await queue.getJobCounts(
          'waiting',
          'active',
          'completed',
          'failed',
          'delayed',
          'paused'
        );
        options.onMetrics?.(counts as QueueJobCounts<Name>);
        if (!options.onMetrics) {
          logger.info(`[queue:${queue.name}] counts`, counts);
        }
      } catch (error) {
        logger.error(`[queue:${queue.name}] Failed to collect metrics`, error);
      }
    };

    metricsTimer = setInterval(collectMetrics, metricsIntervalMs);
    metricsTimer.unref?.();
    void collectMetrics();
  }

  return () => {
    queueEvents.off('completed', completedHandler as unknown as (...args: unknown[]) => void);
    queueEvents.off('failed', failedHandler as unknown as (...args: unknown[]) => void);
    queueEvents.off('stalled', stalledHandler as unknown as (...args: unknown[]) => void);
    queueEvents.off('waiting', waitingHandler as unknown as (...args: unknown[]) => void);
    queueEvents.off('error', errorHandler);
    if (metricsTimer) {
      clearInterval(metricsTimer);
    }
  };
}
