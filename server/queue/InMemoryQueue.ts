import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';

import type {
  JobsOptions,
  Processor,
  Queue,
  QueueEvents,
  QueueEventsOptions,
  QueueOptions,
  Worker,
  WorkerOptions,
} from 'bullmq';

import type { JobPayload, QueueJobCounts, QueueName } from './types';

const DEFAULT_GROUP_KEY = '__ungrouped__';

interface JobRecord<Name extends QueueName, ResultType = unknown> {
  id: string;
  name: Name;
  data: JobPayload<Name>;
  attemptsMade: number;
  opts: JobsOptions<JobPayload<Name>, ResultType, Name>;
  maxAttempts: number;
  groupId: string;
}

interface DelayedJob<Name extends QueueName, ResultType = unknown> {
  job: JobRecord<Name, ResultType>;
  timeout: NodeJS.Timeout | null;
}

interface QueueState<Name extends QueueName, ResultType = unknown> {
  options?: QueueOptions<JobPayload<Name>, ResultType, Name>;
  waiting: JobRecord<Name, ResultType>[];
  active: Set<JobRecord<Name, ResultType>>;
  delayed: Set<DelayedJob<Name, ResultType>>;
  completed: number;
  failed: number;
  workers: Set<InMemoryWorker<Name, ResultType>>;
  events: Set<InMemoryQueueEvents<Name>>;
}

class InMemoryJob<Name extends QueueName, ResultType = unknown>
  implements JobRecord<Name, ResultType>
{
  public id: string;
  public name: Name;
  public data: JobPayload<Name>;
  public attemptsMade: number;
  public opts: JobsOptions<JobPayload<Name>, ResultType, Name>;
  public maxAttempts: number;
  public groupId: string;
  public returnvalue?: ResultType;
  public failedReason?: string;

  constructor(record: JobRecord<Name, ResultType>) {
    this.id = record.id;
    this.name = record.name;
    this.data = record.data;
    this.attemptsMade = record.attemptsMade;
    this.opts = record.opts;
    this.maxAttempts = record.maxAttempts;
    this.groupId = record.groupId;
  }
}

class InMemoryQueueEvents<Name extends QueueName> extends EventEmitter implements QueueEvents {
  constructor(private readonly queueName: Name, private readonly driver: InMemoryQueueDriver) {
    super();
  }

  public async close(): Promise<void> {
    this.removeAllListeners();
    this.driver.unregisterQueueEvents(this.queueName, this as InMemoryQueueEvents<Name>);
  }
}

class InMemoryQueue<Name extends QueueName, ResultType = unknown>
  extends EventEmitter
  implements Queue<JobPayload<Name>, ResultType, Name>
{
  public readonly name: Name;
  private readonly driver: InMemoryQueueDriver;
  private readonly options?: QueueOptions<JobPayload<Name>, ResultType, Name>;

  constructor(name: Name, driver: InMemoryQueueDriver, options?: QueueOptions<JobPayload<Name>, ResultType, Name>) {
    super();
    this.name = name;
    this.driver = driver;
    this.options = options;
  }

  public async add(
    name: Name,
    data: JobPayload<Name>,
    options: JobsOptions<JobPayload<Name>, ResultType, Name> = {}
  ): Promise<InMemoryJob<Name, ResultType>> {
    const jobId = options.jobId ?? randomUUID();
    const defaultOptions = this.options?.defaultJobOptions ?? {};
    const mergedOptions: JobsOptions<JobPayload<Name>, ResultType, Name> = {
      ...defaultOptions,
      ...options,
      backoff: { ...((defaultOptions as any)?.backoff ?? {}), ...((options as any)?.backoff ?? {}) },
      group: {
        id: options.group?.id ?? (defaultOptions as any)?.group?.id ?? DEFAULT_GROUP_KEY,
      },
    };

    const maxAttempts = Math.max(1, Number(mergedOptions.attempts ?? defaultOptions.attempts ?? 1));

    const record: JobRecord<Name, ResultType> = {
      id: jobId,
      name,
      data,
      attemptsMade: 0,
      opts: mergedOptions,
      maxAttempts,
      groupId: mergedOptions.group?.id ?? DEFAULT_GROUP_KEY,
    };

    this.driver.enqueueJob(this.name, record, this.options);

    return new InMemoryJob<Name, ResultType>(record);
  }

  public async close(): Promise<void> {
    this.driver.closeQueue(this.name);
  }

  public async getJobCounts(..._types: string[]): Promise<QueueJobCounts<Name>> {
    return this.driver.getJobCounts(this.name) as QueueJobCounts<Name>;
  }

  public get opts(): QueueOptions<JobPayload<Name>, ResultType, Name> | undefined {
    return this.options;
  }
}

class InMemoryWorker<Name extends QueueName, ResultType = unknown>
  extends EventEmitter
  implements Worker<JobPayload<Name>, ResultType, Name>
{
  private running = true;
  private readonly concurrency: number;
  private readonly groupConcurrency: number;
  private readonly activeGroups = new Map<string, number>();
  private readonly settings: WorkerOptions<JobPayload<Name>, ResultType, Name>['settings'] | undefined;
  private activeJobs = 0;

  constructor(
    private readonly name: Name,
    private readonly driver: InMemoryQueueDriver,
    private readonly processor: Processor<JobPayload<Name>, ResultType, Name>,
    private readonly options: WorkerOptions<JobPayload<Name>, ResultType, Name>
  ) {
    super();
    this.concurrency = Math.max(1, Number(options.concurrency ?? 1));
    const groupConcurrency = Math.max(1, Number(options.group?.concurrency ?? this.concurrency));
    this.groupConcurrency = Math.min(this.concurrency, groupConcurrency);
    this.settings = options.settings;
  }

  public async close(): Promise<void> {
    this.running = false;
    this.driver.unregisterWorker(this.name, this as InMemoryWorker<Name, ResultType>);
  }

  public requestWork(): void {
    if (!this.running) {
      return;
    }
    this.driver.schedule(this.name);
  }

  public hasCapacity(): boolean {
    return this.activeJobs < this.concurrency;
  }

  public canProcessGroup(groupId: string): boolean {
    const active = this.activeGroups.get(groupId) ?? 0;
    return active < this.groupConcurrency;
  }

  public markGroupStarted(groupId: string): void {
    const active = this.activeGroups.get(groupId) ?? 0;
    this.activeGroups.set(groupId, active + 1);
  }

  public markGroupFinished(groupId: string): void {
    const active = this.activeGroups.get(groupId) ?? 0;
    if (active <= 1) {
      this.activeGroups.delete(groupId);
    } else {
      this.activeGroups.set(groupId, active - 1);
    }
  }

  public incrementActiveJobs(): void {
    this.activeJobs += 1;
  }

  public decrementActiveJobs(): void {
    this.activeJobs = Math.max(0, this.activeJobs - 1);
  }

  public getProcessor(): Processor<JobPayload<Name>, ResultType, Name> {
    return this.processor;
  }

  public getSettings(): WorkerOptions<JobPayload<Name>, ResultType, Name>['settings'] | undefined {
    return this.settings;
  }
}

export class InMemoryQueueDriver {
  private readonly queues = new Map<string, QueueState<any, any>>();

  public createQueue<Name extends QueueName, ResultType = unknown>(
    name: Name,
    options?: QueueOptions<JobPayload<Name>, ResultType, Name>
  ): Queue<JobPayload<Name>, ResultType, Name> {
    if (!this.queues.has(name)) {
      const state: QueueState<Name, ResultType> = {
        options,
        waiting: [],
        active: new Set(),
        delayed: new Set(),
        completed: 0,
        failed: 0,
        workers: new Set(),
        events: new Set(),
      };
      this.queues.set(name, state);
    } else {
      const state = this.queues.get(name) as QueueState<Name, ResultType>;
      state.options = options;
    }

    return new InMemoryQueue<Name, ResultType>(name, this, options) as unknown as Queue<
      JobPayload<Name>,
      ResultType,
      Name
    >;
  }

  public createWorker<Name extends QueueName, ResultType = unknown>(
    name: Name,
    processor: Processor<JobPayload<Name>, ResultType, Name>,
    options?: WorkerOptions<JobPayload<Name>, ResultType, Name>
  ): Worker<JobPayload<Name>, ResultType, Name> {
    const worker = new InMemoryWorker<Name, ResultType>(name, this, processor, options ?? {} as any);
    const state = this.ensureState<Name, ResultType>(name);
    state.workers.add(worker as InMemoryWorker<Name, ResultType>);
    worker.requestWork();
    return worker as unknown as Worker<JobPayload<Name>, ResultType, Name>;
  }

  public createQueueEvents<Name extends QueueName>(
    name: Name,
    _options?: QueueEventsOptions
  ): QueueEvents {
    const events = new InMemoryQueueEvents<Name>(name, this);
    const state = this.ensureState<Name, unknown>(name);
    state.events.add(events as InMemoryQueueEvents<Name>);
    return events as unknown as QueueEvents;
  }

  public registerQueueTelemetry<Name extends QueueName>(
    queue: Queue<JobPayload<Name>, unknown, Name>,
    events: QueueEvents,
    handler: (cleanup: () => void) => void
  ): void {
    handler(() => {
      events.removeAllListeners();
    });
  }

  public enqueueJob<Name extends QueueName, ResultType = unknown>(
    name: Name,
    record: JobRecord<Name, ResultType>,
    options?: QueueOptions<JobPayload<Name>, ResultType, Name>
  ): void {
    const state = this.ensureState<Name, ResultType>(name);
    state.options = options;
    state.waiting.push(record);
    this.emitEvent(name, 'waiting', { jobId: record.id });
    this.schedule(name);
  }

  public schedule<Name extends QueueName>(name: Name): void {
    const state = this.ensureState<Name, unknown>(name);
    for (const worker of state.workers) {
      this.processForWorker(name, worker as InMemoryWorker<Name, unknown>);
    }
  }

  public closeQueue<Name extends QueueName>(name: Name): void {
    const state = this.ensureState<Name, unknown>(name);
    for (const delayed of state.delayed) {
      if (delayed.timeout) {
        clearTimeout(delayed.timeout);
      }
    }
    state.delayed.clear();
    state.waiting.length = 0;
  }

  public unregisterWorker<Name extends QueueName, ResultType = unknown>(
    name: Name,
    worker: InMemoryWorker<Name, ResultType>
  ): void {
    const state = this.ensureState<Name, ResultType>(name);
    state.workers.delete(worker as InMemoryWorker<Name, ResultType>);
  }

  public unregisterQueueEvents<Name extends QueueName>(
    name: Name,
    events: InMemoryQueueEvents<Name>
  ): void {
    const state = this.ensureState<Name, unknown>(name);
    state.events.delete(events as InMemoryQueueEvents<Name>);
  }

  public getJobCounts<Name extends QueueName>(name: Name): Record<string, number> {
    const state = this.ensureState<Name, unknown>(name);
    return {
      waiting: state.waiting.length,
      active: state.active.size,
      completed: state.completed,
      failed: state.failed,
      delayed: state.delayed.size,
      paused: 0,
    };
  }

  private ensureState<Name extends QueueName, ResultType = unknown>(
    name: Name
  ): QueueState<Name, ResultType> {
    if (!this.queues.has(name)) {
      this.queues.set(name, {
        waiting: [],
        active: new Set(),
        delayed: new Set(),
        completed: 0,
        failed: 0,
        workers: new Set(),
        events: new Set(),
      });
    }
    return this.queues.get(name) as QueueState<Name, ResultType>;
  }

  private processForWorker<Name extends QueueName, ResultType = unknown>(
    name: Name,
    worker: InMemoryWorker<Name, ResultType>
  ): void {
    const state = this.ensureState<Name, ResultType>(name);
    if (!worker.hasCapacity()) {
      return;
    }

    const nextIndex = state.waiting.findIndex((job) => worker.canProcessGroup(job.groupId));
    if (nextIndex === -1) {
      return;
    }

    const [job] = state.waiting.splice(nextIndex, 1);
    state.active.add(job);
    worker.incrementActiveJobs();
    worker.markGroupStarted(job.groupId);

    const jobInstance = new InMemoryJob<Name, ResultType>(job);
    void this.executeJob(name, worker, state, job, jobInstance);
  }

  private async executeJob<Name extends QueueName, ResultType = unknown>(
    name: Name,
    worker: InMemoryWorker<Name, ResultType>,
    state: QueueState<Name, ResultType>,
    record: JobRecord<Name, ResultType>,
    job: InMemoryJob<Name, ResultType>
  ): Promise<void> {
    try {
      const result = await worker.getProcessor()(job as any);
      job.returnvalue = result;
      state.completed += 1;
      this.emitEvent(name, 'completed', { jobId: job.id, returnvalue: result });
      this.finishJob(name, worker, state, record);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      job.failedReason = err.message;
      record.attemptsMade += 1;
      if (record.attemptsMade < record.maxAttempts) {
        const delay = this.resolveBackoff(worker, record);
        this.requeueJob(name, record, delay);
        this.emitEvent(name, 'failed', {
          jobId: job.id,
          failedReason: err.message,
          attemptsMade: record.attemptsMade,
        });
      } else {
        state.failed += 1;
        this.emitEvent(name, 'failed', {
          jobId: job.id,
          failedReason: err.message,
          attemptsMade: record.attemptsMade,
        });
      }
      this.finishJob(name, worker, state, record);
    }
  }

  private finishJob<Name extends QueueName, ResultType = unknown>(
    name: Name,
    worker: InMemoryWorker<Name, ResultType>,
    state: QueueState<Name, ResultType>,
    record: JobRecord<Name, ResultType>
  ): void {
    state.active.delete(record);
    worker.decrementActiveJobs();
    worker.markGroupFinished(record.groupId);
    this.schedule(name);
  }

  private resolveBackoff<Name extends QueueName, ResultType = unknown>(
    worker: InMemoryWorker<Name, ResultType>,
    record: JobRecord<Name, ResultType>
  ): number {
    const backoff = (record.opts as any)?.backoff;
    if (!backoff || typeof backoff !== 'object') {
      return 0;
    }

    const backoffType = (backoff as { type?: string }).type;
    if (!backoffType) {
      return 0;
    }

    const settings = worker.getSettings();
    const strategy = settings?.backoffStrategies?.[backoffType as keyof typeof settings.backoffStrategies];
    if (typeof strategy === 'function') {
      try {
        return Math.max(0, Number(strategy(record.attemptsMade)) || 0);
      } catch (error) {
        console.warn('In-memory queue backoff strategy failed:', (error as Error)?.message ?? error);
      }
    }

    return 0;
  }

  private requeueJob<Name extends QueueName, ResultType = unknown>(
    name: Name,
    record: JobRecord<Name, ResultType>,
    delayMs: number
  ): void {
    const state = this.ensureState<Name, ResultType>(name);
    if (delayMs > 0) {
      const delayed: DelayedJob<Name, ResultType> = { job: record, timeout: null };
      delayed.timeout = setTimeout(() => {
        state.delayed.delete(delayed);
        state.waiting.push(record);
        this.emitEvent(name, 'waiting', { jobId: record.id });
        this.schedule(name);
      }, delayMs);
      delayed.timeout.unref?.();
      state.delayed.add(delayed);
    } else {
      state.waiting.push(record);
      this.emitEvent(name, 'waiting', { jobId: record.id });
      this.schedule(name);
    }
  }

  private emitEvent<Name extends QueueName>(name: Name, event: string, payload: any): void {
    const state = this.ensureState<Name, unknown>(name);
    for (const listener of state.events) {
      listener.emit(event, payload);
    }
  }
}

export function createInMemoryQueueDriver(): InMemoryQueueDriver {
  return new InMemoryQueueDriver();
}
