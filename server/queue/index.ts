import type {
  Processor,
  Queue,
  QueueEvents,
  QueueEventsOptions,
  QueueOptions,
  Worker,
  WorkerOptions,
} from 'bullmq';

import { getErrorMessage } from '../types/common.js';

import {
  createQueue as createBullQueue,
  createQueueEvents as createBullQueueEvents,
  createWorker as createBullWorker,
  getRedisConnectionOptions,
  registerQueueTelemetry as registerBullQueueTelemetry,
} from './BullMQFactory.js';
import { createInMemoryQueueDriver, InMemoryQueueDriver } from './InMemoryQueue.js';
import type { JobPayload, QueueName, QueueTelemetryOptions } from './types.js';

export type { QueueTelemetryHandlers, QueueJobCounts } from './types.js';
export type { JobPayloads, QueueName, WorkflowExecuteJobPayload } from './types.js';
export type {
  Processor,
  Queue,
  QueueEvents,
  QueueEventsOptions,
  QueueOptions,
  Worker,
  WorkerOptions,
} from './types.js';

type QueueDriverName = 'bullmq' | 'inmemory';

type QueueDriverState = {
  name: QueueDriverName;
  memoryDriver: InMemoryQueueDriver | null;
  warnedFallback: boolean;
};

const state: QueueDriverState = {
  name: resolveInitialDriver(),
  memoryDriver: null,
  warnedFallback: false,
};

function resolveInitialDriver(): QueueDriverName {
  const override = process.env.QUEUE_DRIVER?.toLowerCase();
  if (override === 'inmemory') {
    console.warn('[Queue] QUEUE_DRIVER=inmemory detected. Using in-memory queue driver.');
    return 'inmemory';
  }
  return 'bullmq';
}

function getMemoryDriver(): InMemoryQueueDriver {
  if (!state.memoryDriver) {
    state.memoryDriver = createInMemoryQueueDriver();
  }
  return state.memoryDriver;
}

function isRedisConnectionError(error: unknown): boolean {
  if (!error) {
    return false;
  }
  const code = (error as { code?: string }).code ?? '';
  const message = typeof (error as { message?: string }).message === 'string'
    ? (error as { message: string }).message
    : '';
  const lowered = message.toLowerCase();

  const indicativeCodes = new Set([
    'ECONNREFUSED',
    'ECONNRESET',
    'ETIMEDOUT',
    'EHOSTUNREACH',
    'ENOTFOUND',
  ]);

  if (code && indicativeCodes.has(code)) {
    return true;
  }

  const indicativeMessages = [
    'connect ECONNREFUSED',
    'connect etimedout',
    'connection is closed',
    'ready check failed',
    'getaddrinfo enotfound',
    'getaddrinfo eai_again',
    'redis connection',
  ];

  return indicativeMessages.some((needle) => lowered.includes(needle));
}

function switchToInMemoryDriver(reason?: unknown): void {
  if (state.name === 'inmemory') {
    return;
  }
  state.name = 'inmemory';
  if (!state.warnedFallback) {
    const explanation = reason ? getErrorMessage(reason) : 'unknown error';
    console.warn(
      `[Queue] Falling back to in-memory queue driver due to Redis issue: ${explanation}. Jobs will not be persisted.`
    );
    state.warnedFallback = true;
  }
}

export function handleQueueDriverError(error: unknown): boolean {
  if (state.name === 'inmemory') {
    return false;
  }
  if (!isRedisConnectionError(error)) {
    return false;
  }
  switchToInMemoryDriver(error);
  return true;
}

export function createQueue<Name extends QueueName, ResultType = unknown>(
  name: Name,
  options?: QueueOptions<JobPayload<Name>, ResultType, Name>
): Queue<JobPayload<Name>, ResultType, Name> {
  if (state.name === 'bullmq') {
    try {
      return createBullQueue<Name, ResultType>(name, options);
    } catch (error) {
      if (handleQueueDriverError(error)) {
        return createQueue<Name, ResultType>(name, options);
      }
      throw error;
    }
  }

  return getMemoryDriver().createQueue<Name, ResultType>(name, options);
}

export function createWorker<Name extends QueueName, ResultType = unknown>(
  name: Name,
  processor: Processor<JobPayload<Name>, ResultType, Name>,
  options?: WorkerOptions<JobPayload<Name>, ResultType, Name>
): Worker<JobPayload<Name>, ResultType, Name> {
  if (state.name === 'bullmq') {
    try {
      return createBullWorker<Name, ResultType>(name, processor, options);
    } catch (error) {
      if (handleQueueDriverError(error)) {
        return createWorker<Name, ResultType>(name, processor, options);
      }
      throw error;
    }
  }

  return getMemoryDriver().createWorker<Name, ResultType>(name, processor, options);
}

export function createQueueEvents<Name extends QueueName>(
  name: Name,
  options?: QueueEventsOptions
): QueueEvents {
  if (state.name === 'bullmq') {
    try {
      return createBullQueueEvents<Name>(name, options);
    } catch (error) {
      if (handleQueueDriverError(error)) {
        return createQueueEvents<Name>(name, options);
      }
      throw error;
    }
  }

  return getMemoryDriver().createQueueEvents<Name>(name, options);
}

export function registerQueueTelemetry<Name extends QueueName>(
  queue: Queue<JobPayload<Name>, unknown, Name>,
  events: QueueEvents,
  options: QueueTelemetryOptions<Name> = {}
): () => void {
  return registerBullQueueTelemetry(queue, events, options);
}

export { getRedisConnectionOptions };

export function getActiveQueueDriver(): QueueDriverName {
  return state.name;
}
