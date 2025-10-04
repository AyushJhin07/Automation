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

import type { DataRegion } from '../database/schema';
import type { WorkflowResumeState } from '../types/workflowTimers';

export type WorkflowExecuteJobPayload = {
  workflowId: string;
  executionId: string;
  organizationId: string;
  region: DataRegion;
  userId?: string;
  triggerType: string;
  triggerData?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
  resumeState?: WorkflowResumeState | null;
  initialData?: any;
  timerId?: string | null;
};

export interface JobPayloads {
  'workflow.execute': WorkflowExecuteJobPayload;
  'encryption.rotate': { jobId: string };
}

type BaseQueueName = keyof JobPayloads;

export type QueueName = BaseQueueName | `${BaseQueueName}:${string}`;

export type JobPayload<Name extends QueueName> = Name extends `${infer Base}:${string}`
  ? Base extends BaseQueueName
    ? JobPayloads[Base]
    : never
  : Name extends BaseQueueName
  ? JobPayloads[Name]
  : never;

export type QueueJobCounts<Name extends QueueName> = Awaited<
  ReturnType<Queue<JobPayload<Name>, unknown, Name>['getJobCounts']>
>;

export interface QueueTelemetryHandlers<Name extends QueueName> {
  onCompleted?: (payload: { jobId: string; returnValue: unknown }) => void;
  onFailed?: (payload: { jobId: string; failedReason: string; attemptsMade: number }) => void;
  onStalled?: (payload: { jobId: string }) => void;
  onWaiting?: (payload: { jobId: string }) => void;
  onError?: (error: Error) => void;
}

export interface QueueTelemetryOptions<Name extends QueueName> {
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
  handlers?: QueueTelemetryHandlers<Name>;
  metricsIntervalMs?: number;
  onMetrics?: (counts: QueueJobCounts<Name>) => void;
}

export type {
  JobsOptions,
  Processor,
  Queue,
  QueueEvents,
  QueueEventsOptions,
  QueueOptions,
  Worker,
  WorkerOptions,
};
