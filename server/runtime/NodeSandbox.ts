import { performance } from 'node:perf_hooks';
import { SpanStatusCode } from '@opentelemetry/api';

import {
  recordNodeLatency,
  tracer,
  recordSandboxLifecycleEvent,
  recordSandboxPolicyViolation,
  recordSandboxHeartbeatTimeout,
  setSandboxState,
  clearSandboxState,
} from '../observability/index.js';
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
  SandboxHeartbeatTimeoutError,
  SandboxIsolationWatchdog,
  createSandboxIsolationWatchdog,
  SandboxTenancyOverrides,
  SandboxTenancyMetadata,
  SandboxNetworkAllowlist,
} from './SandboxShared';
import { WorkerSandboxExecutor } from './WorkerSandboxExecutor';
import { ProcessSandboxExecutor } from './ProcessSandboxExecutor';
import { connectionService } from '../services/ConnectionService.js';
import type {
  OrganizationNetworkAllowlist,
  OrganizationNetworkPolicy,
  SandboxTenancyConfiguration,
} from '../services/ConnectionService.js';
import { connectorRegistry } from '../ConnectorRegistry.js';
import type { SandboxProvisionRequest, SandboxScopeDescriptor } from './sandbox/types.js';
import { createSandboxScopeKey, mergeStringSets, toTelemetryAttributes } from './sandbox/utils.js';

const DEFAULT_TIMEOUT_MS = 15_000;
const ENV_CPU_LIMIT_MS = Number(process.env.SANDBOX_MAX_CPU_MS);
const ENV_MEMORY_LIMIT_MB = Number(process.env.SANDBOX_MAX_MEMORY_MB);
const ENV_CPU_QUOTA_MS = Number(process.env.SANDBOX_CPU_QUOTA_MS);
const ENV_CGROUP_ROOT = process.env.SANDBOX_CGROUP_ROOT;
const ENV_HEARTBEAT_INTERVAL_MS = Number(process.env.SANDBOX_HEARTBEAT_INTERVAL_MS);
const ENV_HEARTBEAT_TIMEOUT_MS = Number(process.env.SANDBOX_HEARTBEAT_TIMEOUT_MS);

const normalizeNetworkValues = (values: unknown): string[] => {
  if (!values) {
    return [];
  }

  const source = Array.isArray(values)
    ? values
    : typeof values === 'string'
      ? values.split(/[,\n]/)
      : [];

  const normalized = new Set<string>();
  for (const entry of source) {
    if (typeof entry !== 'string') {
      continue;
    }
    const trimmed = entry.trim().toLowerCase();
    if (!trimmed) {
      continue;
    }
    normalized.add(trimmed);
  }
  return Array.from(normalized);
};

const mergeNetworkLists = (
  ...lists: Array<OrganizationNetworkAllowlist | null | undefined>
): OrganizationNetworkAllowlist => {
  const domains = new Set<string>();
  const ipRanges = new Set<string>();

  for (const list of lists) {
    if (!list) {
      continue;
    }
    for (const domain of normalizeNetworkValues(list.domains)) {
      domains.add(domain);
    }
    for (const range of normalizeNetworkValues(list.ipRanges)) {
      ipRanges.add(range);
    }
  }

  return {
    domains: Array.from(domains),
    ipRanges: Array.from(ipRanges),
  };
};

const toSandboxList = (list: OrganizationNetworkAllowlist): SandboxNetworkAllowlist => ({
  domains: [...list.domains],
  ipRanges: [...list.ipRanges],
});

const extractConnectorId = (params: any, context: any): string | undefined => {
  const candidates: unknown[] = [];

  const push = (value: unknown) => {
    if (typeof value === 'string' && value.trim().length > 0) {
      candidates.push(value.trim());
    }
  };

  const metadata = context?.metadata ?? {};
  push(metadata.connectorId);
  push(metadata.appId);
  push(metadata.app);
  push(metadata.provider);

  push(context?.connectorId);
  push(context?.appId);
  push(context?.app);

  push(params?.appId);
  push(params?.app);
  push(params?.connectorId);

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim().toLowerCase();
    }
  }
  return undefined;
};

type ResolvedSandboxNetworkPolicy = {
  allowlist: SandboxNetworkAllowlist | null;
  denylist: SandboxNetworkAllowlist | null;
  required: SandboxNetworkAllowlist | null;
};

const getConnectorRequiredNetwork = (
  connectorId: string | undefined
): OrganizationNetworkAllowlist | null => {
  if (!connectorId) {
    return null;
  }

  try {
    const definition = connectorRegistry.getConnectorDefinition(connectorId);
    const required = (definition as any)?.network?.requiredOutbound;
    if (!required || typeof required !== 'object') {
      return null;
    }

    const domains = normalizeNetworkValues((required as any).domains);
    const ipRanges = normalizeNetworkValues((required as any).ipRanges);

    if (domains.length === 0 && ipRanges.length === 0) {
      return null;
    }

    return { domains, ipRanges };
  } catch (error) {
    console.warn('[NodeSandbox] Failed to resolve connector network requirements', connectorId, error);
    return null;
  }
};

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
  tenancy?: SandboxTenancyOverrides;
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

class NodeSandboxFactory {
  private readonly sandboxes = new Map<string, ScopedNodeSandbox>();

  constructor(private readonly executorFactory: () => SandboxExecutor = resolveExecutorFromEnv) {}

  provision(request: SandboxProvisionRequest): ScopedNodeSandbox {
    const key = createSandboxScopeKey(request);
    const descriptor: SandboxScopeDescriptor = { ...request, key };
    let sandbox = this.sandboxes.get(key);
    if (!sandbox || sandbox.isDisposed()) {
      sandbox = new ScopedNodeSandbox(descriptor, this);
      this.sandboxes.set(key, sandbox);
    }
    return sandbox;
  }

  dispose(request: SandboxProvisionRequest): void {
    const key = createSandboxScopeKey(request);
    const sandbox = this.sandboxes.get(key);
    if (sandbox) {
      sandbox.dispose('factory-dispose');
      this.sandboxes.delete(key);
    }
  }

  createExecutor(): SandboxExecutor {
    return this.executorFactory();
  }

  async resolveTenancyConfiguration(organizationId?: string): Promise<SandboxTenancyConfiguration> {
    return connectionService.getSandboxTenancyConfiguration(organizationId);
  }

  resolveEffectiveResourceLimits(
    base: SandboxResourceLimits | undefined,
    ...overrides: Array<SandboxResourceLimits | undefined>
  ): SandboxResourceLimits | undefined {
    const limits: SandboxResourceLimits = { ...(base ?? {}) };

    for (const override of overrides) {
      if (!override) continue;
      if (typeof override.maxCpuMs === 'number' && Number.isFinite(override.maxCpuMs)) {
        limits.maxCpuMs = override.maxCpuMs;
      }
      if (typeof override.cpuQuotaMs === 'number' && Number.isFinite(override.cpuQuotaMs)) {
        limits.cpuQuotaMs = override.cpuQuotaMs;
      }
      if (typeof override.maxMemoryBytes === 'number' && Number.isFinite(override.maxMemoryBytes)) {
        limits.maxMemoryBytes = override.maxMemoryBytes;
      }
      if (typeof override.cgroupRoot === 'string' && override.cgroupRoot.trim().length > 0) {
        limits.cgroupRoot = override.cgroupRoot.trim();
      }
    }

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

  handleSandboxDisposal(key: string): void {
    this.sandboxes.delete(key);
  }
}

class ScopedNodeSandbox {
  private executor: SandboxExecutor;
  private readonly watchdog: SandboxIsolationWatchdog;
  private readonly tenancyConfigPromise: Promise<SandboxTenancyConfiguration>;
  private readonly attributes = toTelemetryAttributes(this.descriptor);
  private disposed = false;
  private quarantined = false;
  private lastViolation: SandboxPolicyEvent | null = null;

  constructor(private readonly descriptor: SandboxScopeDescriptor, private readonly factory: NodeSandboxFactory) {
    this.executor = this.factory.createExecutor();
    this.watchdog = createSandboxIsolationWatchdog();
    this.tenancyConfigPromise = this.factory.resolveTenancyConfiguration(descriptor.organizationId);

    recordSandboxLifecycleEvent('provisioned', { ...this.attributes });
    setSandboxState(this.descriptor.key, this.attributes, 'active');
  }

  isDisposed(): boolean {
    return this.disposed;
  }

  isQuarantined(): boolean {
    return this.quarantined;
  }

  async execute(options: SandboxExecutionOptions): Promise<SandboxExecutionResult> {
    this.assertActive();

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
      tenancy,
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
      'sandbox.scope': this.descriptor.scope,
    } as const;

    return tracer.startActiveSpan('workflow.sandbox', { attributes: spanAttributes }, async (span) => {
      const start = performance.now();
      const policyEvents: SandboxPolicyEvent[] = [];
      try {
        const sanitizedParams = sanitizeForTransfer(params, 'params');
        const baseTenancy = await this.tenancyConfigPromise;

        const dependencyAllowlist = mergeStringSets(
          baseTenancy.dependencyAllowlist,
          tenancy?.dependencyAllowlist,
        );
        const secretScopes = mergeStringSets(baseTenancy.secretScopes, tenancy?.secretScopes);
        const policyVersion = tenancy?.policyVersion ?? baseTenancy.policyVersion ?? null;

        const tenancyMetadata: SandboxTenancyMetadata = {
          scope: this.descriptor.scope,
          organizationId: this.descriptor.organizationId,
          executionId: this.descriptor.executionId,
          workflowId: this.descriptor.workflowId,
          nodeId: this.descriptor.nodeId ?? (context as any)?.nodeId,
          policyVersion,
          dependencyAllowlist,
          secretScopes,
        };

        const sanitizedContext = sanitizeForTransfer(context, 'context');
        let finalContext: any;
        if (sanitizedContext && typeof sanitizedContext === 'object' && !Array.isArray(sanitizedContext)) {
          finalContext = { ...sanitizedContext, tenancy: sanitizeForTransfer(tenancyMetadata, 'context.tenancy') };
        } else {
          finalContext = {
            value: sanitizedContext,
            tenancy: sanitizeForTransfer(tenancyMetadata, 'context.tenancy'),
          };
        }

        const collectedSecrets = dedupeSecrets(secrets);
        const resolvedResourceLimits = this.factory.resolveEffectiveResourceLimits(
          baseTenancy.resourceLimits,
          tenancy?.resourceLimits,
          resourceLimits
        );

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

        const connectorId = extractConnectorId(params, context);
        const connectorRequirements = getConnectorRequiredNetwork(connectorId);
        const effectivePolicy: OrganizationNetworkPolicy = {
          allowlist: mergeNetworkLists(baseTenancy.networkPolicy.allowlist, connectorRequirements),
          denylist: mergeNetworkLists(baseTenancy.networkPolicy.denylist),
        };

        const networkPolicy = {
          allowlist: toSandboxList(effectivePolicy.allowlist),
          denylist: toSandboxList(effectivePolicy.denylist),
          required: connectorRequirements ? toSandboxList(connectorRequirements) : null,
          audit: {
            organizationId: this.descriptor.organizationId,
            executionId: this.descriptor.executionId,
            nodeId: this.descriptor.nodeId ?? (context as any)?.nodeId,
            connectionId: (context as any)?.connectionId,
            userId: (context as any)?.userId,
          },
        } as const;

        const simplifiedPolicy: ResolvedSandboxNetworkPolicy = {
          allowlist: networkPolicy.allowlist,
          denylist: networkPolicy.denylist,
          required: networkPolicy.required,
        };

        const executorOptions: SandboxExecutorRunOptions = {
          code,
          entryPoint,
          params: sanitizedParams,
          context: finalContext,
          timeoutMs,
          signal,
          secrets: collectedSecrets,
          resourceLimits: resolvedResourceLimits,
          networkPolicy,
          heartbeatIntervalMs: resolvedHeartbeatInterval,
          heartbeatTimeoutMs: resolvedHeartbeatTimeout,
          onPolicyEvent: (event) => {
            policyEvents.push(event);
            this.handlePolicyEvent(event, simplifiedPolicy);
          },
        };

        const outcome = await this.executor.run(executorOptions);

        this.watchdog.reset();
        this.lastViolation = null;
        this.quarantined = false;
        this.watchdog.liftQuarantine();
        setSandboxState(this.descriptor.key, this.attributes, 'active');

        span.setAttribute('sandbox.log_count', outcome.logs.length);
        span.setStatus({ code: SpanStatusCode.OK });
        return outcome;
      } catch (error) {
        const exception = error instanceof Error ? error : new Error(String(error));
        if (exception instanceof SandboxPolicyViolationError) {
          if (policyEvents.length === 0) {
            this.handlePolicyViolation(exception.violation);
          }
        } else if (exception instanceof SandboxHeartbeatTimeoutError) {
          this.handleHeartbeatTimeout();
        } else if (!(exception instanceof SandboxPolicyViolationError) && policyEvents.length > 0) {
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

  dispose(reason: string): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    recordSandboxLifecycleEvent('disposed', { ...this.attributes, reason });
    clearSandboxState(this.descriptor.key);
    this.factory.handleSandboxDisposal(this.descriptor.key);
  }

  private assertActive(): void {
    if (this.disposed) {
      throw new Error('Sandbox has been disposed');
    }
    if (this.quarantined) {
      const violation =
        this.lastViolation ?? ({ type: 'resource-limit', resource: 'cpu', usage: 0, limit: 0 } as SandboxPolicyEvent);
      throw new SandboxPolicyViolationError('Sandbox is quarantined due to previous violations', violation);
    }
  }

  private handlePolicyEvent(event: SandboxPolicyEvent, policy: ResolvedSandboxNetworkPolicy): void {
    recordSandboxPolicyViolation(this.attributes, event);
    this.lastViolation = event;

    if (event.type === 'network-denied') {
      try {
        const audit = (event as any).audit ?? {};
        connectionService.recordDeniedNetworkAccess({
          organizationId: typeof audit.organizationId === 'string' ? audit.organizationId : this.descriptor.organizationId,
          connectionId: typeof audit.connectionId === 'string' ? audit.connectionId : undefined,
          userId: typeof audit.userId === 'string' ? audit.userId : undefined,
          attemptedHost: event.host,
          attemptedUrl: event.url,
          reason: event.reason,
          policy: {
            allowlist: event.allowlist ?? policy.allowlist,
            denylist: event.denylist ?? policy.denylist,
            required: event.required ?? policy.required ?? undefined,
            source: 'sandbox',
          },
        });
      } catch (recordError) {
        console.warn('[Sandbox] Failed to record denied network access', recordError);
      }
    }

    const result = this.watchdog.recordPolicyViolation(event);
    if (result.action === 'quarantine') {
      this.quarantine(event, 'policy-violation');
    } else if (result.action === 'recycle') {
      this.recycle('policy-violation');
    }
  }

  private handlePolicyViolation(event: SandboxPolicyEvent): void {
    this.lastViolation = event;
    const result = this.watchdog.recordPolicyViolation(event);
    if (result.action === 'quarantine') {
      this.quarantine(event, 'policy-violation');
    } else if (result.action === 'recycle') {
      this.recycle('policy-violation');
    }
  }

  private handleHeartbeatTimeout(): void {
    recordSandboxHeartbeatTimeout(this.attributes);
    const result = this.watchdog.recordHeartbeatTimeout();
    if (result.action === 'quarantine') {
      this.quarantine(null, 'heartbeat-timeout');
    } else {
      this.recycle('heartbeat-timeout');
    }
  }

  private recycle(reason: string): void {
    this.executor = this.factory.createExecutor();
    recordSandboxLifecycleEvent('recycled', { ...this.attributes, reason });
    setSandboxState(this.descriptor.key, this.attributes, 'active');
  }

  private quarantine(event: SandboxPolicyEvent | null, reason: string): void {
    this.quarantined = true;
    if (event) {
      this.lastViolation = event;
    }
    recordSandboxLifecycleEvent('quarantined', { ...this.attributes, reason });
    setSandboxState(this.descriptor.key, this.attributes, 'quarantined');
  }
}

export const nodeSandboxFactory = new NodeSandboxFactory();

