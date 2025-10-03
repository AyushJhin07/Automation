import type { Job, Processor, Worker, WorkerOptions } from 'bullmq';
import { SpanKind, SpanStatusCode } from '@opentelemetry/api';

import {
  createWorker,
  type JobPayloads,
  type QueueName,
} from '../queue/BullMQFactory.js';
import { tracer } from '../observability/index.js';

type JobPayload<Name extends QueueName> = JobPayloads[Name];

type TenantResolver<Name extends QueueName, ResultType> = (
  job: Job<JobPayload<Name>, ResultType, Name>
) => string | null | undefined;

const DEFAULT_GROUP_KEY = '__ungrouped__';

function normalizeConcurrency(value: number | undefined, fallback: number): number {
  const parsed = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(1, Math.floor(parsed));
}

function resolveTenantFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const maybeOrganization = record.organizationId;
  if (typeof maybeOrganization === 'string' && maybeOrganization.trim().length > 0) {
    return maybeOrganization;
  }

  const maybeTenant = record.tenantId;
  if (typeof maybeTenant === 'string' && maybeTenant.trim().length > 0) {
    return maybeTenant;
  }

  return null;
}

export type RegisterQueueWorkerOptions<Name extends QueueName, ResultType = unknown> = Omit<
  WorkerOptions<JobPayload<Name>, ResultType, Name>,
  'group'
> & {
  tenantConcurrency?: number;
  resolveTenantId?: TenantResolver<Name, ResultType>;
};

export function registerQueueWorker<Name extends QueueName, ResultType = unknown>(
  name: Name,
  processor: Processor<JobPayload<Name>, ResultType, Name>,
  options: RegisterQueueWorkerOptions<Name, ResultType> = {}
): Worker<JobPayload<Name>, ResultType, Name> {
  const { tenantConcurrency, resolveTenantId, ...workerOptions } = options;
  const baseConcurrency = normalizeConcurrency(workerOptions.concurrency, 1);
  const resolvedTenantConcurrency = normalizeConcurrency(
    tenantConcurrency ?? baseConcurrency,
    baseConcurrency
  );
  const tenantConcurrencyLimit = Math.max(1, Math.min(baseConcurrency, resolvedTenantConcurrency));

  const finalOptions: WorkerOptions<JobPayload<Name>, ResultType, Name> = {
    ...workerOptions,
    concurrency: baseConcurrency,
  };

  const tenantResolver: TenantResolver<Name, ResultType> =
    resolveTenantId ?? ((job) => resolveTenantFromPayload(job.data));

  finalOptions.group = {
    concurrency: tenantConcurrencyLimit,
    limiter: {
      groupKey: (job: Job<JobPayload<Name>, ResultType, Name>) => {
        const candidate = tenantResolver(job);
        if (typeof candidate === 'string' && candidate.trim().length > 0) {
          return candidate;
        }
        return DEFAULT_GROUP_KEY;
      },
    },
  };

  const instrumentedProcessor: Processor<JobPayload<Name>, ResultType, Name> = async (job) => {
    return tracer.startActiveSpan(`queue.process ${String(name)}`, {
      kind: SpanKind.CONSUMER,
      attributes: {
        'queue.name': String(name),
        'queue.job_id': job.id ?? undefined,
        'queue.attempt': job.attemptsMade + 1,
        'queue.max_attempts': job.opts.attempts ?? undefined,
        'workflow.execution_id': (job.data as Record<string, unknown>)?.executionId as string | undefined,
        'workflow.workflow_id': (job.data as Record<string, unknown>)?.workflowId as string | undefined,
        'workflow.organization_id': (job.data as Record<string, unknown>)?.organizationId as string | undefined,
      },
    }, async (span) => {
      const startTime = process.hrtime.bigint();
      try {
        const result = await processor(job);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error: unknown) {
        const exception = error instanceof Error ? error : new Error(String(error));
        span.recordException(exception);
        span.setStatus({ code: SpanStatusCode.ERROR, message: exception.message });
        throw error;
      } finally {
        const durationMs = Number(process.hrtime.bigint() - startTime) / 1_000_000;
        span.setAttribute('queue.job.duration_ms', durationMs);
        span.end();
      }
    });
  };

  return createWorker(name, instrumentedProcessor, finalOptions);
}
