import { performance } from 'node:perf_hooks';
import { SpanStatusCode } from '@opentelemetry/api';

import { recordNodeLatency, tracer } from '../observability/index.js';
import {
  SandboxExecutionResult,
  SandboxExecutor,
  SandboxExecutorRunOptions,
  SandboxAbortError,
  SandboxTimeoutError,
  SandboxPolicyEvent,
  SandboxPolicyViolationError,
  SandboxResourceLimits,
  dedupeSecrets,
  sanitizeForTransfer,
} from './SandboxShared';
import { WorkerSandboxExecutor } from './WorkerSandboxExecutor';
import { ProcessSandboxExecutor } from './ProcessSandboxExecutor';
import { connectionService } from '../services/ConnectionService.js';

const DEFAULT_TIMEOUT_MS = 15_000;
const ENV_CPU_LIMIT_MS = Number(process.env.SANDBOX_MAX_CPU_MS);
const ENV_MEMORY_LIMIT_MB = Number(process.env.SANDBOX_MAX_MEMORY_MB);
const ENV_CPU_QUOTA_MS = Number(process.env.SANDBOX_CPU_QUOTA_MS);
const ENV_CGROUP_ROOT = process.env.SANDBOX_CGROUP_ROOT;
const ENV_HEARTBEAT_INTERVAL_MS = Number(process.env.SANDBOX_HEARTBEAT_INTERVAL_MS);
const ENV_HEARTBEAT_TIMEOUT_MS = Number(process.env.SANDBOX_HEARTBEAT_TIMEOUT_MS);

export interface SandboxExecutionOptions {
  code: string;
  entryPoint?: string;
  params?: any;
  context?: any;
  timeoutMs?: number;
  signal?: AbortSignal;
  secrets?: string[];
  resourceLimits?: SandboxResourceLimits;
  heartbeatIntervalMs?: number;
  heartbeatTimeoutMs?: number;
}

export { collectSecretStrings } from './SandboxShared';
export type { SandboxLogEntry } from './SandboxShared';
export {
  SandboxAbortError,
  SandboxTimeoutError,
  SandboxPolicyViolationError,
  SandboxResourceLimitError,
  SandboxHeartbeatTimeoutError,
} from './SandboxShared';

function resolveExecutorFromEnv(): SandboxExecutor {
  const requested = (process.env.SANDBOX_EXECUTOR || '').toLowerCase();
  if (requested) {
    if (['worker', 'worker_thread', 'worker-threads', 'thread'].includes(requested)) {
      return new WorkerSandboxExecutor();
    }
    if (['process', 'proc', 'child_process', 'processes'].includes(requested)) {
      return new ProcessSandboxExecutor();
    }
  }

  if (process.env.WORKER_SANDBOX_ENABLED === 'true') {
    return new WorkerSandboxExecutor();
  }

  return new ProcessSandboxExecutor();
}

export class NodeSandbox {
  private executor: SandboxExecutor;

  constructor(executor: SandboxExecutor = resolveExecutorFromEnv()) {
    this.executor = executor;
  }

  setExecutor(executor: SandboxExecutor): void {
    this.executor = executor;
  }

  getExecutor(): SandboxExecutor {
    return this.executor;
  }

  async execute(options: SandboxExecutionOptions): Promise<SandboxExecutionResult> {
    const {
      code,
      entryPoint = 'run',
      params = {},
      context = {},
      timeoutMs = DEFAULT_TIMEOUT_MS,
      signal,
      secrets = [],
      resourceLimits,
      heartbeatIntervalMs,
      heartbeatTimeoutMs,
    } = options;

    if (typeof code !== 'string' || code.trim().length === 0) {
      throw new Error('Sandbox execution requires a code string');
    }

    if (signal?.aborted) {
      throw new SandboxAbortError('Sandbox execution aborted before start');
    }

    const spanAttributes = {
      'workflow.execution_id': (context as Record<string, unknown>)?.executionId as string | undefined,
      'workflow.workflow_id': (context as Record<string, unknown>)?.workflowId as string | undefined,
      'workflow.node_id': (context as Record<string, unknown>)?.nodeId as string | undefined,
      'sandbox.entry_point': entryPoint,
    } as const;

    return tracer.startActiveSpan('workflow.sandbox', { attributes: spanAttributes }, async (span) => {
      const start = performance.now();
      const policyEvents: SandboxPolicyEvent[] = [];
      try {
        const sanitizedParams = sanitizeForTransfer(params, 'params');
        const sanitizedContext = sanitizeForTransfer(context, 'context');
        const collectedSecrets = dedupeSecrets(secrets);

        const resolvedResourceLimits = this.resolveResourceLimits(resourceLimits);
        const resolvedHeartbeatInterval = Number.isFinite(heartbeatIntervalMs)
          ? Math.max(25, Math.floor(heartbeatIntervalMs))
          : Number.isFinite(ENV_HEARTBEAT_INTERVAL_MS)
            ? Math.max(25, Math.floor(ENV_HEARTBEAT_INTERVAL_MS))
            : undefined;
        const resolvedHeartbeatTimeout = Number.isFinite(heartbeatTimeoutMs)
          ? Math.max(resolvedHeartbeatInterval ? resolvedHeartbeatInterval * 2 : 100, Math.floor(heartbeatTimeoutMs))
          : Number.isFinite(ENV_HEARTBEAT_TIMEOUT_MS)
            ? Math.max(resolvedHeartbeatInterval ? resolvedHeartbeatInterval * 2 : 100, Math.floor(ENV_HEARTBEAT_TIMEOUT_MS))
            : undefined;

        const organizationId = typeof (context as any)?.organizationId === 'string'
          ? (context as any).organizationId
          : undefined;
        const executionId = typeof (context as any)?.executionId === 'string'
          ? (context as any).executionId
          : undefined;
        const nodeId = typeof (context as any)?.nodeId === 'string'
          ? (context as any).nodeId
          : undefined;
        const connectionId = typeof (context as any)?.connectionId === 'string'
          ? (context as any).connectionId
          : undefined;
        const userId = typeof (context as any)?.userId === 'string'
          ? (context as any).userId
          : undefined;

        const allowlist = organizationId
          ? await connectionService.getOrganizationNetworkAllowlist(organizationId)
          : null;

        const networkPolicy = allowlist
          ? {
              allowlist,
              audit: {
                organizationId,
                executionId,
                nodeId,
                connectionId,
                userId,
              },
            }
          : null;

        const executorOptions: SandboxExecutorRunOptions = {
          code,
          entryPoint,
          params: sanitizedParams,
          context: sanitizedContext,
          timeoutMs,
          signal,
          secrets: collectedSecrets,
          resourceLimits: resolvedResourceLimits,
          networkPolicy,
          heartbeatIntervalMs: resolvedHeartbeatInterval,
          heartbeatTimeoutMs: resolvedHeartbeatTimeout,
          onPolicyEvent: (event) => {
            policyEvents.push(event);
            if (event.type === 'network-denied') {
              try {
                connectionService.recordDeniedNetworkAccess({
                  organizationId,
                  connectionId,
                  userId,
                  attemptedHost: event.host,
                  attemptedUrl: event.url,
                  reason: event.reason,
                  allowlist: allowlist ?? undefined,
                });
              } catch (recordError) {
                console.warn('[Sandbox] Failed to record denied network access', recordError);
              }
            }
          },
        };

        const outcome = await this.executor.run(executorOptions);

        span.setAttribute('sandbox.log_count', outcome.logs.length);
        span.setStatus({ code: SpanStatusCode.OK });
        return outcome;
      } catch (error) {
        const exception = error instanceof Error ? error : new Error(String(error));
        if (!(exception instanceof SandboxPolicyViolationError) && policyEvents.length > 0) {
          const violation = policyEvents[policyEvents.length - 1];
          throw new SandboxPolicyViolationError(exception.message, violation, { cause: exception });
        }
        span.recordException(exception);
        span.setStatus({ code: SpanStatusCode.ERROR, message: exception.message });
        throw error;
      } finally {
        const durationMs = performance.now() - start;
        span.setAttribute('sandbox.duration_ms', durationMs);
        if (policyEvents.length > 0) {
          const violation = policyEvents[policyEvents.length - 1];
          span.setAttribute('sandbox.policy_violation', true);
          span.setAttribute('sandbox.policy_violation_type', violation.type);
          if (violation.type === 'resource-limit') {
            span.setAttribute('sandbox.policy_violation_resource', violation.resource);
          }
        }
        const metricAttributes: Record<string, unknown> = {
          workflow_id: spanAttributes['workflow.workflow_id'],
          execution_id: spanAttributes['workflow.execution_id'],
          node_id: spanAttributes['workflow.node_id'],
          entry_point: entryPoint,
        };
        if (policyEvents.length > 0) {
          const violation = policyEvents[policyEvents.length - 1];
          metricAttributes.policy_violation = violation.type;
          if (violation.type === 'resource-limit') {
            metricAttributes.policy_resource = violation.resource;
          }
        }
        recordNodeLatency(durationMs, metricAttributes);
        span.end();
      }
    });
  }

  private resolveResourceLimits(overrides?: SandboxResourceLimits): SandboxResourceLimits | undefined {
    const limits: SandboxResourceLimits = { ...overrides };
    if (!Number.isFinite(limits.maxCpuMs) && Number.isFinite(ENV_CPU_LIMIT_MS)) {
      limits.maxCpuMs = Math.max(0, Number(ENV_CPU_LIMIT_MS));
    }
    if (!Number.isFinite(limits.cpuQuotaMs) && Number.isFinite(ENV_CPU_QUOTA_MS)) {
      limits.cpuQuotaMs = Math.max(0, Number(ENV_CPU_QUOTA_MS));
    }
    if (!Number.isFinite(limits.maxMemoryBytes) && Number.isFinite(ENV_MEMORY_LIMIT_MB)) {
      const bytes = Number(ENV_MEMORY_LIMIT_MB) * 1024 * 1024;
      limits.maxMemoryBytes = Math.max(0, bytes);
    }
    if (!limits.cgroupRoot && typeof ENV_CGROUP_ROOT === 'string' && ENV_CGROUP_ROOT.trim().length > 0) {
      limits.cgroupRoot = ENV_CGROUP_ROOT.trim();
    }

    const hasCpuLimit = Number.isFinite(limits.maxCpuMs) && (limits.maxCpuMs ?? 0) > 0;
    const hasCpuQuota = Number.isFinite(limits.cpuQuotaMs) && (limits.cpuQuotaMs ?? 0) > 0;
    const hasMemoryLimit = Number.isFinite(limits.maxMemoryBytes) && (limits.maxMemoryBytes ?? 0) > 0;

    if (!hasCpuLimit && !hasCpuQuota && !hasMemoryLimit) {
      return undefined;
    }
    return limits;
  }
}

export const nodeSandbox = new NodeSandbox();
