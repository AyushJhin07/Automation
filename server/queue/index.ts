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
import type {
  JobPayload,
  QueueName,
  QueueTelemetryOptions,
  RegionalQueueEventsOptions,
  RegionalQueueOptions,
  RegionalWorkerOptions,
} from './types.js';

export type { QueueTelemetryHandlers, QueueJobCounts } from './types.js';
export type { JobPayloads, QueueName, WorkflowExecuteJobPayload, ExecutionQueueName } from './types.js';
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

export class QueueDriverUnavailableError extends Error {
  public readonly code = 'QUEUE_DRIVER_UNAVAILABLE';

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'QueueDriverUnavailableError';
  }
}

type QueueDriverState = {
  name: QueueDriverName;
  memoryDriver: InMemoryQueueDriver | null;
};

const state: QueueDriverState = {
  name: resolveInitialDriver(),
  memoryDriver: null,
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

function handleBullMQCreationError(error: unknown, context: string): never {
  if (!isRedisConnectionError(error) || state.name === 'inmemory') {
    throw error instanceof Error ? error : new Error(getErrorMessage(error));
  }

  const explanation = getErrorMessage(error);
  const message =
    `[Queue] Unable to connect to Redis while ${context}: ${explanation}. ` +
    'Configure QUEUE_REDIS_* or ensure Redis is reachable. Set QUEUE_DRIVER=inmemory only for isolated testing.';

  console.error(message);
  throw new QueueDriverUnavailableError(message, { cause: error });
}

export function createQueue<Name extends QueueName, ResultType = unknown>(
  name: Name,
  options?: RegionalQueueOptions<Name, ResultType>
): Queue<JobPayload<Name>, ResultType, Name> {
  if (state.name === 'bullmq') {
    try {
      return createBullQueue<Name, ResultType>(name, options);
    } catch (error) {
      handleBullMQCreationError(error, `creating queue "${String(name)}"`);
    }
  }

  return getMemoryDriver().createQueue<Name, ResultType>(name, options);
}

export function createWorker<Name extends QueueName, ResultType = unknown>(
  name: Name,
  processor: Processor<JobPayload<Name>, ResultType, Name>,
  options?: RegionalWorkerOptions<Name, ResultType>
): Worker<JobPayload<Name>, ResultType, Name> {
  if (state.name === 'bullmq') {
    try {
      return createBullWorker<Name, ResultType>(name, processor, options);
    } catch (error) {
      handleBullMQCreationError(error, `creating worker for "${String(name)}"`);
    }
  }

  return getMemoryDriver().createWorker<Name, ResultType>(name, processor, options);
}

export function createQueueEvents<Name extends QueueName>(
  name: Name,
  options?: RegionalQueueEventsOptions
): QueueEvents {
  if (state.name === 'bullmq') {
    try {
      return createBullQueueEvents<Name>(name, options);
    } catch (error) {
      handleBullMQCreationError(error, `creating queue events for "${String(name)}"`);
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
