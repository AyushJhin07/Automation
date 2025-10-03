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
import type {
  JobPayload,
  JobPayloads,
  QueueJobCounts,
  QueueName,
  QueueTelemetryOptions,
} from './types';

const defaultLogger: Pick<Console, 'info' | 'warn' | 'error'> = console;

export function getRedisConnectionOptions(): RedisOptions {
  const baseOptions: RedisOptions = {
    host: env.QUEUE_REDIS_HOST,
    port: env.QUEUE_REDIS_PORT,
    db: env.QUEUE_REDIS_DB,
  };

  if (env.QUEUE_REDIS_USERNAME) {
    baseOptions.username = env.QUEUE_REDIS_USERNAME;
  }
  if (env.QUEUE_REDIS_PASSWORD) {
    baseOptions.password = env.QUEUE_REDIS_PASSWORD;
  }
  if (env.QUEUE_REDIS_TLS) {
    baseOptions.tls = {};
  }

  return baseOptions;
}

export function createQueue<Name extends QueueName, ResultType = unknown>(
  name: Name,
  options?: QueueOptions<JobPayload<Name>, ResultType, Name>
): Queue<JobPayload<Name>, ResultType, Name> {
  const connection = { ...getRedisConnectionOptions(), ...options?.connection };
  const defaultJobOptions = {
    removeOnComplete: true,
    removeOnFail: false,
    ...options?.defaultJobOptions,
  };
  const merged: QueueOptions<JobPayload<Name>, ResultType, Name> = {
    ...options,
    connection,
    defaultJobOptions,
    prefix: options?.prefix ?? `bull:${String(name)}`,
  };

  return new Queue<JobPayload<Name>, ResultType, Name>(name, merged);
}

export function createWorker<Name extends QueueName, ResultType = unknown>(
  name: Name,
  processor: Processor<JobPayload<Name>, ResultType, Name>,
  options?: WorkerOptions<JobPayload<Name>, ResultType, Name>
): Worker<JobPayload<Name>, ResultType, Name> {
  const merged: WorkerOptions<JobPayload<Name>, ResultType, Name> = {
    connection: { ...getRedisConnectionOptions(), ...options?.connection },
    autorun: options?.autorun ?? true,
    ...options,
  };

  return new Worker<JobPayload<Name>, ResultType, Name>(name, processor, merged);
}

export function createQueueEvents<Name extends QueueName>(
  name: Name,
  options?: QueueEventsOptions
): QueueEvents {
  const merged: QueueEventsOptions = {
    connection: { ...getRedisConnectionOptions(), ...options?.connection },
    autorun: options?.autorun ?? true,
    ...options,
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
