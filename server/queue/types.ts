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

import type { OrganizationRegion } from '../database/schema.js';
import type { WorkflowResumeState } from '../types/workflowTimers';

export type ExecutionQueueName = `workflow.execute.${OrganizationRegion}`;

export type WorkflowExecuteJobPayload = {
  workflowId: string;
  executionId: string;
  organizationId: string;
  userId?: string;
  triggerType: string;
  triggerData?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
  resumeState?: WorkflowResumeState | null;
  initialData?: any;
  timerId?: string | null;
  region: OrganizationRegion;
};

export interface JobPayloads extends Record<ExecutionQueueName, WorkflowExecuteJobPayload> {
  'workflow.execute': WorkflowExecuteJobPayload;
  'encryption.rotate': { jobId: string };
}

export type QueueName = keyof JobPayloads;

export type JobPayload<Name extends QueueName> = JobPayloads[Name];

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

export interface RegionalQueueOptions<Name extends QueueName, ResultType = unknown>
  extends QueueOptions<JobPayload<Name>, ResultType, Name> {
  region?: OrganizationRegion;
}

export interface RegionalWorkerOptions<Name extends QueueName, ResultType = unknown>
  extends WorkerOptions<JobPayload<Name>, ResultType, Name> {
  region?: OrganizationRegion;
}

export interface RegionalQueueEventsOptions extends QueueEventsOptions {
  region?: OrganizationRegion;
}
