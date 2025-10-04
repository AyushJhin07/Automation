import type { Job, Processor, Worker } from 'bullmq';
import { SpanKind, SpanStatusCode } from '@opentelemetry/api';

import { createWorker, type JobPayloads, type QueueName } from '../queue/index.js';
import type { RegionalWorkerOptions } from '../queue/types.js';
import { tracer } from '../observability/index.js';

type JobPayload<Name extends QueueName> = JobPayloads[Name];

type TenantResolver<Name extends QueueName, ResultType> = (
  job: Job<JobPayload<Name>, ResultType, Name>
) => string | null | undefined;

const DEFAULT_GROUP_KEY = '__ungrouped__';
const DEFAULT_LOCK_DURATION_MS = 60_000;
const DEFAULT_LOCK_RENEW_MS = 15_000;

const MIN_HEARTBEAT_INTERVAL_MS = 250;
const DEFAULT_HEARTBEAT_TIMEOUT_FACTOR = 4;

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

export interface QueueWorkerHeartbeatContext<Name extends QueueName, ResultType = unknown> {
  timestamp: Date;
  lockExpiresAt: Date;
  renewCount: number;
  job: Job<JobPayload<Name>, ResultType, Name>;
}

export type RegisterQueueWorkerOptions<Name extends QueueName, ResultType = unknown> =
  Omit<RegionalWorkerOptions<Name, ResultType>, 'group'> & {
    tenantConcurrency?: number;
    resolveTenantId?: TenantResolver<Name, ResultType>;
    heartbeatIntervalMs?: number;
    heartbeatTimeoutMs?: number;
    onHeartbeat?: (
      job: Job<JobPayload<Name>, ResultType, Name>,
      context: QueueWorkerHeartbeatContext<Name, ResultType>
    ) => void | Promise<void>;
  };

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function registerQueueWorker<Name extends QueueName, ResultType = unknown>(
  name: Name,
  processor: Processor<JobPayload<Name>, ResultType, Name>,
  options: RegisterQueueWorkerOptions<Name, ResultType> = {}
): Worker<JobPayload<Name>, ResultType, Name> {
  const {
    tenantConcurrency,
    resolveTenantId,
    heartbeatIntervalMs,
    heartbeatTimeoutMs,
    onHeartbeat,
    ...workerOptions
  } = options;
  const baseConcurrency = normalizeConcurrency(workerOptions.concurrency, 1);
  const resolvedTenantConcurrency = normalizeConcurrency(
    tenantConcurrency ?? baseConcurrency,
    baseConcurrency
  );
  const tenantConcurrencyLimit = Math.max(1, Math.min(baseConcurrency, resolvedTenantConcurrency));

  const resolvedLockDuration = Math.max(
    MIN_HEARTBEAT_INTERVAL_MS,
    Math.floor(Number(workerOptions.lockDuration ?? DEFAULT_LOCK_DURATION_MS))
  );
  const resolvedLockRenew = Math.max(
    MIN_HEARTBEAT_INTERVAL_MS,
    Math.floor(Number(workerOptions.lockRenewTime ?? DEFAULT_LOCK_RENEW_MS))
  );

  const resolvedHeartbeatInterval = Math.max(
    MIN_HEARTBEAT_INTERVAL_MS,
    Number.isFinite(heartbeatIntervalMs)
      ? Math.floor((heartbeatIntervalMs ?? MIN_HEARTBEAT_INTERVAL_MS) as number)
      : Math.max(resolvedLockRenew, MIN_HEARTBEAT_INTERVAL_MS)
  );
  const resolvedHeartbeatTimeout = Math.max(
    resolvedHeartbeatInterval * 2,
    Number.isFinite(heartbeatTimeoutMs)
      ? Math.floor((heartbeatTimeoutMs ?? resolvedLockDuration * DEFAULT_HEARTBEAT_TIMEOUT_FACTOR) as number)
      : Math.max(resolvedLockDuration * DEFAULT_HEARTBEAT_TIMEOUT_FACTOR, resolvedHeartbeatInterval * 2)
  );

  const finalOptions: RegionalWorkerOptions<Name, ResultType> = {
    ...workerOptions,
    concurrency: baseConcurrency,
    lockDuration: resolvedLockDuration,
    lockRenewTime: resolvedLockRenew,
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

  let workerRef: Worker<JobPayload<Name>, ResultType, Name> | null = null;

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
      const shouldMonitorHeartbeat = resolvedHeartbeatInterval > 0;
      let stopHeartbeat = false;
      let heartbeatPromise: Promise<void> | null = null;
      let renewCount = 0;
      let lastHeartbeatAt = Date.now();

      const invokeHeartbeatCallback = async (count: number, timestamp: number) => {
        if (!onHeartbeat) {
          return;
        }
        try {
          await onHeartbeat(job, {
            job,
            renewCount: count,
            timestamp: new Date(timestamp),
            lockExpiresAt: new Date(timestamp + resolvedLockDuration),
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.warn(
            `[queue:${String(name)}] Heartbeat callback failed for job ${job.id ?? 'unknown'}: ${message}`
          );
        }
      };

      if (shouldMonitorHeartbeat) {
        const extendLockAvailable = Boolean(
          workerRef && typeof (workerRef as any).extendLock === 'function' && job.id
        );
        const jobToken = (job as Job<JobPayload<Name>, ResultType, Name> & { token?: string }).token ?? job.id;

        heartbeatPromise = (async () => {
          lastHeartbeatAt = Date.now();
          await invokeHeartbeatCallback(renewCount, lastHeartbeatAt);
          try {
            while (!stopHeartbeat) {
              await delay(resolvedHeartbeatInterval);
              if (stopHeartbeat) {
                break;
              }

              const now = Date.now();
              const elapsed = now - lastHeartbeatAt;
              if (elapsed > resolvedHeartbeatTimeout) {
                throw new Error(
                  `Worker heartbeat timed out for job ${job.id ?? 'unknown'} after ${elapsed}ms (timeout=${resolvedHeartbeatTimeout}ms)`
                );
              }

              if (extendLockAvailable && jobToken) {
                try {
                  await (workerRef as any).extendLock(job.id, jobToken, resolvedLockDuration);
                } catch (error) {
                  const message = error instanceof Error ? error.message : String(error);
                  throw new Error(
                    `Failed to extend lock for job ${job.id ?? 'unknown'}: ${message}`
                  );
                }
              }

              lastHeartbeatAt = Date.now();
              renewCount += 1;
              await invokeHeartbeatCallback(renewCount, lastHeartbeatAt);
            }
          } finally {
            stopHeartbeat = true;
          }
        })();
      }

      try {
        const processorPromise = (async () => {
          try {
            return await processor(job);
          } finally {
            stopHeartbeat = true;
          }
        })();

        const result = heartbeatPromise
          ? (await Promise.all([processorPromise, heartbeatPromise]))[0]
          : await processorPromise;

        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error: unknown) {
        const exception = error instanceof Error ? error : new Error(String(error));
        span.recordException(exception);
        span.setStatus({ code: SpanStatusCode.ERROR, message: exception.message });
        throw error;
      } finally {
        stopHeartbeat = true;
        if (heartbeatPromise) {
          await heartbeatPromise.catch(() => {});
        }
        const durationMs = Number(process.hrtime.bigint() - startTime) / 1_000_000;
        span.setAttribute('queue.job.duration_ms', durationMs);
        span.end();
      }
    });
  };

  const worker = createWorker(name, instrumentedProcessor, finalOptions);
  workerRef = worker;
  return worker;
}
