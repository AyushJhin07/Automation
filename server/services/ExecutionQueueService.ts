import { eq, sql } from 'drizzle-orm';

import { getErrorMessage } from '../types/common.js';
import { sanitizeLogPayload } from '../utils/executionLogRedaction.js';
import { WorkflowRepository } from '../workflow/WorkflowRepository.js';
import { workflowRuntime } from '../core/WorkflowRuntime.js';
import { db, workflowTimers, type OrganizationLimits, type OrganizationRegion } from '../database/schema.js';
import {
  createQueue,
  createQueueEvents,
  getActiveQueueDriver,
  registerQueueTelemetry,
  type Queue,
  type QueueEvents,
  type Worker,
  type WorkflowExecuteJobPayload,
  type ExecutionQueueName,
} from '../queue/index.js';
import { registerQueueWorker, type QueueWorkerHeartbeatContext } from '../workers/queueWorker.js';
import type { WorkflowResumeState, WorkflowTimerPayload } from '../types/workflowTimers';
import {
  getQueueDepthSnapshot,
  recordCrossRegionViolation,
  updateQueueDepthMetric,
} from '../observability/index.js';
import { organizationService } from './OrganizationService.js';
import {
  executionQuotaService,
  ExecutionQuotaExceededError,
  type ExecutionQuotaCounters,
} from './ExecutionQuotaService.js';
import {
  connectorConcurrencyService,
  ConnectorConcurrencyExceededError,
} from './ConnectorConcurrencyService.js';
import type { Job } from 'bullmq';
import { usageMeteringService, type QuotaCheck } from './UsageMeteringService.js';
import { executionResumeTokenService } from './ExecutionResumeTokenService.js';
import {
  assertQueueIsReady,
  checkQueueHealth,
  getQueueHealthSnapshot,
  type QueueHealthStatus,
} from './QueueHealthService.js';

export type QueueRunRequest = {
  workflowId: string;
  userId?: string;
  triggerType?: string;
  triggerData?: Record<string, any> | null;
  organizationId: string;
  initialData?: any;
  resumeState?: WorkflowResumeState | null;
  replay?: {
    sourceExecutionId: string;
    mode: 'full' | 'node';
    nodeId?: string | null;
    reason?: string | null;
    triggeredBy?: string | null;
  };
};

type ExecutionLeaseTelemetry = {
  executionId: string;
  organizationId: string;
  workerId: string | null;
  lockedAt: string | null;
  lockExpiresAt: string | null;
  lastHeartbeatAt: string | null;
  renewCount: number | null;
};

type ExecutionQueueTelemetrySnapshot = {
  started: boolean;
  databaseEnabled: boolean;
  queueDriver: string;
  queueHealth: QueueHealthStatus | null;
  worker: {
    id: string | null;
    region: OrganizationRegion;
    queueName: ExecutionQueueName;
    concurrency: number;
    tenantConcurrency: number;
    lockDurationMs: number;
    lockRenewTimeMs: number;
    heartbeatIntervalMs: number;
    heartbeatTimeoutMs: number;
  };
  leases: {
    count: number;
    entries: ExecutionLeaseTelemetry[];
  };
  metrics: {
    queueDepths: ReturnType<typeof getQueueDepthSnapshot>;
  };
};

class UsageQuotaExceededError extends Error {
  public readonly quota: QuotaCheck;
  public readonly organizationId: string;
  public readonly executionId: string;

  constructor(params: { quota: QuotaCheck; organizationId: string; executionId: string }) {
    const message = `Plan quota exceeded for ${params.quota.quotaType ?? 'usage'}`;
    super(message);
    this.quota = params.quota;
    this.organizationId = params.organizationId;
    this.executionId = params.executionId;
  }
}

class ExecutionQueueService {
  private static instance: ExecutionQueueService;
  private readonly concurrency: number;
  private readonly tenantConcurrency: number;
  private readonly maxRetries: number;
  private readonly baseRetryDelayMs: number;
  private readonly maxRetryDelayMs: number;
  private readonly lockDurationMs: number;
  private readonly lockRenewTimeMs: number;
  private readonly heartbeatIntervalMs: number;
  private readonly heartbeatTimeoutMs: number;
  private readonly heartbeatPersistIntervalMs: number;
  private started = false;
  private startPromise: Promise<void> | null = null;
  private shutdownPromise: Promise<void> | null = null;
  private readonly queueCache = new Map<
    ExecutionQueueName,
    Queue<WorkflowExecuteJobPayload, unknown, ExecutionQueueName>
  >();
  private worker: Worker<WorkflowExecuteJobPayload, unknown, ExecutionQueueName> | null = null;
  private queueEvents: QueueEvents | null = null;
  private telemetryCleanup: (() => void) | null = null;
  private readonly activeLeases = new Map<
    string,
    { metadata: Record<string, any>; organizationId: string; lastPersistedAt: number }
  >();
  private readonly workerRegion: OrganizationRegion;
  private readonly workerQueueName: ExecutionQueueName;

  private constructor() {
    const configuredConcurrency = Number.parseInt(
      process.env.EXECUTION_WORKER_CONCURRENCY ?? '2',
      10
    );
    const normalizedConcurrency = Number.isNaN(configuredConcurrency)
      ? 2
      : configuredConcurrency;
    this.concurrency = Math.max(1, normalizedConcurrency);

    const configuredTenantConcurrency = Number.parseInt(
      process.env.EXECUTION_TENANT_CONCURRENCY ?? `${this.concurrency}`,
      10
    );
    const normalizedTenantConcurrency = Number.isNaN(configuredTenantConcurrency)
      ? this.concurrency
      : configuredTenantConcurrency;
    this.tenantConcurrency = Math.max(1, Math.min(this.concurrency, normalizedTenantConcurrency));
    this.maxRetries = Math.max(0, Number.parseInt(process.env.EXECUTION_MAX_RETRIES ?? '3', 10));
    this.baseRetryDelayMs = Math.max(500, Number.parseInt(process.env.EXECUTION_RETRY_DELAY_MS ?? '1000', 10));
    this.maxRetryDelayMs = Math.max(
      this.baseRetryDelayMs,
      Number.parseInt(process.env.EXECUTION_MAX_RETRY_DELAY_MS ?? `${5 * 60 * 1000}`, 10)
    );
    this.lockDurationMs = Math.max(
      1000,
      Number.parseInt(process.env.EXECUTION_LOCK_DURATION_MS ?? '60000', 10)
    );
    this.lockRenewTimeMs = Math.max(
      500,
      Number.parseInt(
        process.env.EXECUTION_LOCK_RENEW_MS ?? `${Math.max(1000, Math.floor(this.lockDurationMs / 4))}`,
        10
      )
    );
    this.heartbeatIntervalMs = Math.max(
      250,
      Number.parseInt(
        process.env.EXECUTION_HEARTBEAT_INTERVAL_MS ?? `${Math.max(500, Math.floor(this.lockRenewTimeMs / 2))}`,
        10
      )
    );
    this.heartbeatTimeoutMs = Math.max(
      this.heartbeatIntervalMs * 2,
      Number.parseInt(
        process.env.EXECUTION_HEARTBEAT_TIMEOUT_MS ?? `${Math.max(this.lockDurationMs * 2, this.lockDurationMs + this.lockRenewTimeMs)}`,
        10
      )
    );
    this.heartbeatPersistIntervalMs = Math.max(
      this.heartbeatIntervalMs,
      Number.parseInt(
        process.env.EXECUTION_HEARTBEAT_PERSIST_MS ?? `${Math.max(this.heartbeatIntervalMs, 1000)}`,
        10
      )
    );

    this.workerRegion = this.resolveRegionFromEnv();
    this.workerQueueName = this.getQueueName(this.workerRegion);
  }

  public static getInstance(): ExecutionQueueService {
    if (!ExecutionQueueService.instance) {
      ExecutionQueueService.instance = new ExecutionQueueService();
    }
    return ExecutionQueueService.instance;
  }

  public isDbEnabled(): boolean {
    return Boolean(db);
  }

  private resolveRegionFromEnv(): OrganizationRegion {
    const raw = (process.env.DATA_RESIDENCY_REGION ?? 'us').toLowerCase();
    const allowed: OrganizationRegion[] = ['us', 'eu', 'apac'];
    if ((allowed as string[]).includes(raw)) {
      return raw as OrganizationRegion;
    }
    if (raw && raw !== 'us') {
      console.warn(
        `⚠️ Unrecognized DATA_RESIDENCY_REGION="${raw}" for ExecutionQueueService. Falling back to "us".`
      );
    }
    return 'us';
  }

  private getQueueName(region: OrganizationRegion): ExecutionQueueName {
    return `workflow.execute.${region}` as ExecutionQueueName;
  }

  private computeBackoff(attempt: number): number {
    const exponent = Math.pow(2, Math.max(0, attempt - 1));
    const jitter = Math.floor(Math.random() * this.baseRetryDelayMs * 0.2);
    return Math.min(exponent * this.baseRetryDelayMs + jitter, this.maxRetryDelayMs);
  }

  private async withQueueOperation<T>(
    queueName: ExecutionQueueName,
    operation: (
      queue: Queue<WorkflowExecuteJobPayload, unknown, ExecutionQueueName>
    ) => Promise<T>
  ): Promise<T> {
    const queue = this.ensureQueue(queueName);
    try {
      return await operation(queue);
    } catch (error) {
      console.error(
        `ExecutionQueueService queue operation failed for ${queueName}:`,
        getErrorMessage(error)
      );
      throw error;
    }
  }

  public getTelemetrySnapshot(): ExecutionQueueTelemetrySnapshot {
    const queueDepths = getQueueDepthSnapshot();
    const queueHealth = getQueueHealthSnapshot();
    const leases: ExecutionLeaseTelemetry[] = Array.from(this.activeLeases.entries()).map(
      ([executionId, entry]) => {
        const leaseMetadata = (entry.metadata.lease ?? {}) as Record<string, any>;
        return {
          executionId,
          organizationId: entry.organizationId,
          workerId: typeof leaseMetadata.workerId === 'string' ? leaseMetadata.workerId : null,
          lockedAt: typeof leaseMetadata.lockedAt === 'string' ? leaseMetadata.lockedAt : null,
          lockExpiresAt:
            typeof leaseMetadata.lockExpiresAt === 'string' ? leaseMetadata.lockExpiresAt : null,
          lastHeartbeatAt:
            typeof leaseMetadata.lastHeartbeatAt === 'string' ? leaseMetadata.lastHeartbeatAt : null,
          renewCount:
            typeof leaseMetadata.renewCount === 'number' ? leaseMetadata.renewCount : null,
        };
      }
    );

    return {
      started: this.started,
      databaseEnabled: this.isDbEnabled(),
      queueDriver: getActiveQueueDriver(),
      queueHealth,
      worker: {
        id: this.worker?.id ?? null,
        region: this.workerRegion,
        queueName: this.workerQueueName,
        concurrency: this.concurrency,
        tenantConcurrency: this.tenantConcurrency,
        lockDurationMs: this.lockDurationMs,
        lockRenewTimeMs: this.lockRenewTimeMs,
        heartbeatIntervalMs: this.heartbeatIntervalMs,
        heartbeatTimeoutMs: this.heartbeatTimeoutMs,
      },
      leases: {
        count: leases.length,
        entries: leases,
      },
      metrics: {
        queueDepths,
      },
    };
  }

  private async acquireRunningSlotWithBackoff(
    organizationId: string,
    limits: OrganizationLimits
  ): Promise<{ acquired: boolean; state: ExecutionQuotaCounters }> {
    type RunningDecision = Awaited<ReturnType<typeof executionQuotaService.acquireRunningSlot>>;
    const pollInterval = Math.min(1000, Math.max(200, Math.floor(this.lockRenewTimeMs / 2)));
    const maxWaitMs = Math.max(this.lockDurationMs, 5000);
    const deadline = Date.now() + maxWaitMs;
    let lastDecision: RunningDecision | null = null;

    while (Date.now() <= deadline) {
      const decision = await executionQuotaService.acquireRunningSlot(organizationId, {
        maxConcurrentExecutions: limits.maxConcurrentExecutions,
      });

      if (decision.allowed) {
        return { acquired: true, state: decision.state };
      }

      lastDecision = decision;
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    if (lastDecision) {
      return { acquired: false, state: lastDecision.state };
    }

    const fallback = await executionQuotaService.getState(organizationId);
    return { acquired: false, state: fallback };
  }

  public async enqueue(req: QueueRunRequest): Promise<{ executionId: string }> {
    const quotaProfile = await organizationService.getExecutionQuotaProfile(req.organizationId);
    const region = await organizationService.getOrganizationRegion(req.organizationId);
    const queueName = this.getQueueName(region);

    const sanitizedInitialData =
      req.initialData !== undefined ? sanitizeLogPayload(req.initialData) : undefined;
    const sanitizedResumeState = req.resumeState ? sanitizeLogPayload(req.resumeState) : undefined;

    const workflowRecord = await WorkflowRepository.getWorkflowById(req.workflowId, req.organizationId);
    if (!workflowRecord || !workflowRecord.graph) {
      throw new Error(`Workflow ${req.workflowId} not found or missing graph for organization ${req.organizationId}`);
    }

    const connectors = connectorConcurrencyService.extractConnectorsFromGraph(
      (workflowRecord.graph as any) ?? null
    );

    const baseMetadata: Record<string, any> = {
      queuedAt: new Date().toISOString(),
      attemptsMade: 0,
      retryCount: 0,
      connectors,
      connectorConcurrency: {
        connectors,
      },
      residency: {
        region,
      },
    };

    if (req.replay) {
      baseMetadata.replay = {
        sourceExecutionId: req.replay.sourceExecutionId,
        mode: req.replay.mode,
        nodeId: req.replay.nodeId ?? null,
        reason: req.replay.reason ?? null,
        triggeredBy: req.replay.triggeredBy ?? req.userId ?? null,
        requestedAt: new Date().toISOString(),
      };
    }

    const dedupeToken = req.triggerData && typeof req.triggerData === 'object'
      ? (req.triggerData as Record<string, any>).dedupeToken
      : undefined;
    if (typeof dedupeToken === 'string' && dedupeToken.trim()) {
      baseMetadata.deterministicKeys = {
        ...(baseMetadata.deterministicKeys ?? {}),
        trigger: {
          dedupeToken: dedupeToken.trim(),
        },
      };
    }

    const estimatedApiCalls = Array.isArray(connectors) && connectors.length > 0 ? connectors.length : 1;
    let usageQuotaCheck: QuotaCheck | null = null;

    if (req.userId) {
      try {
        usageQuotaCheck = await usageMeteringService.checkQuota(
          req.userId,
          estimatedApiCalls,
          0,
          1,
          0
        );

        baseMetadata.usageQuota = {
          allowed: usageQuotaCheck.hasQuota,
          quotaType: usageQuotaCheck.quotaType,
          current: usageQuotaCheck.current,
          limit: usageQuotaCheck.limit,
          remaining: usageQuotaCheck.remaining,
          resetDate: usageQuotaCheck.resetDate?.toISOString?.() ?? null,
        };
      } catch (error) {
        console.error(
          'Failed to evaluate usage quota before enqueue:',
          getErrorMessage(error)
        );
      }
    }

    const capacityCheck = await connectorConcurrencyService.checkCapacity({
      organizationId: req.organizationId,
      connectors,
      planLimits: quotaProfile.limits,
    });

    if (usageQuotaCheck && !usageQuotaCheck.hasQuota) {
      baseMetadata.usageQuota = {
        ...(baseMetadata.usageQuota ?? {}),
        allowed: false,
        quotaType: usageQuotaCheck.quotaType,
        current: usageQuotaCheck.current,
        limit: usageQuotaCheck.limit,
        remaining: usageQuotaCheck.remaining,
        resetDate: usageQuotaCheck.resetDate?.toISOString?.() ?? null,
        blocked: true,
      };

      if (req.userId) {
        usageMeteringService
          .recordQuotaBlock({
            userId: req.userId,
            organizationId: req.organizationId,
            quota: usageQuotaCheck,
            requested: {
              apiCalls: estimatedApiCalls,
              workflowRuns: 1,
              storage: 0,
            },
          })
          .catch(error => {
            console.error('Failed to emit usage quota block event:', getErrorMessage(error));
          });
      }

      const execution = await WorkflowRepository.createWorkflowExecution({
        workflowId: req.workflowId,
        userId: req.userId,
        organizationId: req.organizationId,
        status: 'failed',
        triggerType: req.triggerType ?? 'manual',
        triggerData: req.triggerData ?? null,
        metadata: baseMetadata,
      });

      await WorkflowRepository.updateWorkflowExecution(
        execution.id,
        {
          status: 'failed',
          completedAt: new Date(),
          duration: 0,
          errorDetails: {
            error: `Usage quota exceeded for ${usageQuotaCheck.quotaType ?? 'usage'}`,
            quotaType: usageQuotaCheck.quotaType,
            current: usageQuotaCheck.current,
            limit: usageQuotaCheck.limit,
            remaining: usageQuotaCheck.remaining,
          },
          metadata: baseMetadata,
        },
        req.organizationId
      );

      throw new UsageQuotaExceededError({
        quota: usageQuotaCheck,
        organizationId: req.organizationId,
        executionId: execution.id,
      });
    }

    if (!capacityCheck.allowed) {
      const violation = capacityCheck.violation;
      baseMetadata.connectorConcurrency = {
        connectors: capacityCheck.connectors,
        violation,
      };

      const execution = await WorkflowRepository.createWorkflowExecution({
        workflowId: req.workflowId,
        userId: req.userId,
        organizationId: req.organizationId,
        status: 'failed',
        triggerType: req.triggerType ?? 'manual',
        triggerData: req.triggerData ?? null,
        metadata: baseMetadata,
      });

      const concurrencyError = new ConnectorConcurrencyExceededError({
        connectorId: violation.connectorId,
        scope: violation.scope,
        limit: violation.limit,
        active: violation.active,
        organizationId: req.organizationId,
        executionId: execution.id,
      });

      await WorkflowRepository.updateWorkflowExecution(
        execution.id,
        {
          status: 'failed',
          completedAt: new Date(),
          duration: 0,
          errorDetails: {
            error: concurrencyError.message,
            connectorId: violation.connectorId,
            scope: violation.scope,
            limit: violation.limit,
            active: violation.active,
          },
          metadata: baseMetadata,
        },
        req.organizationId
      );

      throw concurrencyError;
    }

    const admission = await executionQuotaService.reserveAdmission(req.organizationId, {
      maxConcurrentExecutions: quotaProfile.limits.maxConcurrentExecutions,
      maxExecutionsPerMinute: quotaProfile.limits.maxExecutionsPerMinute,
    });

    baseMetadata.quota = {
      runningBeforeEnqueue: admission.state.running,
      executionsInWindow: admission.state.windowCount,
      windowStart: new Date(admission.state.windowStartMs).toISOString(),
      maxConcurrentExecutions: quotaProfile.limits.maxConcurrentExecutions,
      maxExecutionsPerMinute: quotaProfile.limits.maxExecutionsPerMinute,
    };

    if (!admission.allowed) {
      const execution = await WorkflowRepository.createWorkflowExecution({
        workflowId: req.workflowId,
        userId: req.userId,
        organizationId: req.organizationId,
        status: 'failed',
        triggerType: req.triggerType ?? 'manual',
        triggerData: req.triggerData ?? null,
        metadata: baseMetadata,
      });

      const quotaError = new ExecutionQuotaExceededError({
        organizationId: req.organizationId,
        reason: admission.reason,
        limit: admission.limit,
        current: admission.current,
        windowCount: admission.state.windowCount,
        windowStart: new Date(admission.state.windowStartMs),
        executionId: execution.id,
      });

      await WorkflowRepository.updateWorkflowExecution(
        execution.id,
        {
          status: 'failed',
          completedAt: new Date(),
          duration: 0,
          errorDetails: {
            error: quotaError.message,
            reason: quotaError.reason,
            limit: quotaError.limit,
            current: quotaError.current,
          },
          metadata: {
            ...baseMetadata,
            quota: {
              ...baseMetadata.quota,
              reason: quotaError.reason,
              limit: quotaError.limit,
              current: quotaError.current,
            },
          },
        },
        req.organizationId
      );

      await executionQuotaService.recordQuotaEvent({
        organizationId: req.organizationId,
        reason: admission.reason,
        limit: admission.limit,
        current: admission.current,
        state: admission.state,
        metadata: {
          workflowId: req.workflowId,
          triggerType: req.triggerType ?? 'manual',
        },
      });

      throw quotaError;
    }

    const execution = await WorkflowRepository.createWorkflowExecution({
      workflowId: req.workflowId,
      userId: req.userId,
      organizationId: req.organizationId,
      status: 'queued',
      triggerType: req.triggerType ?? (sanitizedResumeState ? 'resume' : 'manual'),
      triggerData: req.triggerData ?? null,
      metadata: baseMetadata,
    });

    if (!this.isDbEnabled()) {
      return { executionId: execution.id };
    }

    try {
      const jobPayload: WorkflowExecuteJobPayload & { replayOf?: string } = {
        executionId: execution.id,
        workflowId: req.workflowId,
        organizationId: req.organizationId,
        userId: req.userId,
        triggerType: req.triggerType ?? (sanitizedResumeState ? 'resume' : 'manual'),
        triggerData: req.triggerData ?? null,
        connectors,
        region,
      };

      if (sanitizedResumeState) {
        jobPayload.resumeState = sanitizedResumeState;
      }

      if (sanitizedInitialData !== undefined) {
        jobPayload.initialData = sanitizedInitialData;
      }

      if (req.replay?.sourceExecutionId) {
        jobPayload.replayOf = req.replay.sourceExecutionId;
      }

      await this.withQueueOperation(queueName, (queue) =>
        queue.add(
          'workflow.execute',
          jobPayload,
          {
            jobId: execution.id,
            group: {
              id: req.organizationId,
            },
          }
        )
      );
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      console.error('Failed to enqueue workflow execution job:', errorMessage);
      await executionQuotaService.releaseAdmission(req.organizationId).catch((releaseError) => {
        console.warn(
          'Failed to release admission slot after enqueue failure:',
          getErrorMessage(releaseError)
        );
      });
      await WorkflowRepository.updateWorkflowExecution(
        execution.id,
        {
          status: 'failed',
          completedAt: new Date(),
          duration: 0,
          errorDetails: { error: errorMessage },
          metadata: {
            ...baseMetadata,
            quota: {
              ...baseMetadata.quota,
              enqueueFailed: true,
            },
          },
        },
        req.organizationId
      );
      throw error;
    }

    return { executionId: execution.id };
  }

  public async enqueueResume(params: {
    timerId?: string;
    tokenId?: string;
    executionId: string;
    workflowId: string;
    organizationId: string;
    userId?: string;
    resumeState: WorkflowResumeState;
    initialData: any;
    triggerType?: string;
  }): Promise<void> {
    if (!this.isDbEnabled()) {
      return;
    }

    const resumeIdentifier = params.timerId ?? params.tokenId ?? Date.now().toString(36);
    const jobId = `${params.executionId}:${resumeIdentifier}`;
    const region = await organizationService.getOrganizationRegion(params.organizationId);
    const queueName = this.getQueueName(region);

    try {
      await this.withQueueOperation(queueName, (queue) =>
        queue.add(
          'workflow.execute',
          {
            executionId: params.executionId,
            workflowId: params.workflowId,
            organizationId: params.organizationId,
            userId: params.userId,
            triggerType: params.triggerType ?? 'timer',
            resumeState: params.resumeState,
            initialData: params.initialData,
            timerId: params.timerId ?? null,
            region,
          },
          {
            jobId,
            group: {
              id: params.organizationId,
            },
          }
        )
      );
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      console.error(
        `Failed to enqueue resume job for execution ${params.executionId} (timer ${params.timerId}):`,
        errorMessage
      );
      await this.markTimerForRetry(params.timerId, errorMessage);
      throw error;
    }
  }

  public async start(): Promise<void> {
    if (this.started) {
      return;
    }

    if (this.startPromise) {
      await this.startPromise;
      return;
    }

    this.startPromise = (async () => {
      if (!this.isDbEnabled()) {
        console.warn('⚠️ ExecutionQueueService requires a configured database to run.');
        return;
      }

      await assertQueueIsReady({ context: 'ExecutionQueueService', region: this.workerRegion });

      const queue = this.ensureQueue(this.workerQueueName);
      if (!this.queueEvents) {
        this.queueEvents = createQueueEvents(this.workerQueueName, { region: this.workerRegion });
      }

      if (!this.telemetryCleanup) {
        this.telemetryCleanup = registerQueueTelemetry(queue, this.queueEvents, {
          logger: console,
          onMetrics: (counts) => {
            updateQueueDepthMetric(queue.name, counts);
          },
        });
      }

      this.worker = registerQueueWorker(
        this.workerQueueName,
        async (job) => this.process(job),
        {
          region: this.workerRegion,
          concurrency: this.concurrency,
          tenantConcurrency: this.tenantConcurrency,
          resolveTenantId: (job) => job.data.organizationId,
          lockDuration: this.lockDurationMs,
          lockRenewTime: this.lockRenewTimeMs,
          heartbeatIntervalMs: this.heartbeatIntervalMs,
          heartbeatTimeoutMs: this.heartbeatTimeoutMs,
          onHeartbeat: async (
            _job: Job<WorkflowExecuteJobPayload, unknown, ExecutionQueueName>,
            context: QueueWorkerHeartbeatContext<ExecutionQueueName>
          ) => {
            const payload = _job.data;
            const executionId = payload.executionId;
            const organizationId = payload.organizationId;
            if (!executionId || !organizationId) {
              return;
            }

            const leaseEntry = this.activeLeases.get(executionId);
            if (!leaseEntry) {
              return;
            }

            const leaseMetadata = (leaseEntry.metadata.lease ?? {}) as Record<string, any>;
            leaseMetadata.lastHeartbeatAt = context.timestamp.toISOString();
            leaseMetadata.lockExpiresAt = context.lockExpiresAt.toISOString();
            leaseMetadata.renewCount = context.renewCount;
            leaseEntry.metadata.lease = leaseMetadata;

            const now = context.timestamp.getTime();
            if (now - leaseEntry.lastPersistedAt < this.heartbeatPersistIntervalMs) {
              return;
            }

            leaseEntry.lastPersistedAt = now;

            try {
              await WorkflowRepository.updateWorkflowExecution(
                executionId,
                { metadata: { ...leaseEntry.metadata } },
                organizationId
              );
            } catch (error) {
              console.warn(
                `Failed to persist heartbeat metadata for execution ${executionId}:`,
                getErrorMessage(error)
              );
            }
          },
          settings: {
            backoffStrategies: {
              'execution-backoff': (attemptsMade: number) => this.computeBackoff(Math.max(1, attemptsMade)),
            },
          },
        }
      );

      this.worker.on('error', (error) => {
        console.error('ExecutionQueue worker error:', getErrorMessage(error));
        void checkQueueHealth(this.workerRegion).catch(() => undefined);
      });

      this.started = true;

      console.log(
        `🧵 ExecutionQueueService started (region=${this.workerRegion}, concurrency=${this.concurrency}, tenantConcurrency=${this.tenantConcurrency})`
      );
    })();

    try {
      await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  public stop(): Promise<void> {
    return this.shutdown();
  }

  public async shutdown(options: { timeoutMs?: number } = {}): Promise<void> {
    if (!this.started) {
      return;
    }

    if (this.shutdownPromise) {
      return this.shutdownPromise;
    }

    const timeoutMs = Math.max(0, options.timeoutMs ?? 30000);

    this.shutdownPromise = (async () => {
      const closeWorker = async () => {
        if (!this.worker) {
          return;
        }
        await this.worker.close();
        this.worker = null;
      };

      if (timeoutMs === 0) {
        await closeWorker();
      } else {
        await Promise.race([
          closeWorker(),
          new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
        ]);
        await closeWorker().catch((error) => {
          console.error('Failed to close execution worker gracefully:', getErrorMessage(error));
        });
      }

      if (this.queueEvents) {
        await this.queueEvents.close();
        this.queueEvents = null;
      }

      if (this.telemetryCleanup) {
        try {
          this.telemetryCleanup();
        } catch (error) {
          console.error('Failed to cleanup queue telemetry handlers:', getErrorMessage(error));
        }
        this.telemetryCleanup = null;
      }

      const workerQueue = this.queueCache.get(this.workerQueueName);
      if (workerQueue) {
        try {
          await workerQueue.close();
        } catch (error) {
          console.error('Failed to close execution queue during shutdown:', getErrorMessage(error));
        }
      }

      this.queueCache.clear();

      this.started = false;
      this.shutdownPromise = null;
    })();

    return this.shutdownPromise;
  }

  private ensureQueue(
    name: ExecutionQueueName
  ): Queue<WorkflowExecuteJobPayload, unknown, ExecutionQueueName> {
    const existing = this.queueCache.get(name);
    if (existing) {
      return existing;
    }

    const queue = createQueue(name, {
      region: this.workerRegion,
      defaultJobOptions: {
        attempts: this.maxRetries + 1,
        backoff: { type: 'execution-backoff' },
        removeOnComplete: true,
        removeOnFail: false,
      },
      settings: {
        backoffStrategies: {
          'execution-backoff': (attemptsMade: number) => this.computeBackoff(Math.max(1, attemptsMade)),
        },
      },
    });

    this.queueCache.set(name, queue);
    return queue;
  }

  private async process(job: Job<WorkflowExecuteJobPayload>): Promise<void> {
    const startedAt = Date.now();
    const { executionId, workflowId, organizationId, userId } = job.data;
    const jobRegion = (job.data.region as OrganizationRegion | undefined) ?? this.workerRegion;

    if (jobRegion !== this.workerRegion) {
      recordCrossRegionViolation({
        subsystem: 'execution-worker',
        expectedRegion: this.workerRegion,
        actualRegion: jobRegion,
        identifier: executionId,
      });
      throw new Error(
        `Execution worker region mismatch: expected ${this.workerRegion}, received ${jobRegion} for job ${executionId}`
      );
    }
    const resumeState = (job.data.resumeState ?? null) as WorkflowResumeState | null;
    const timerId = job.data.timerId ?? null;
    const executionRecord = await WorkflowRepository.getExecutionById(executionId, organizationId);
    const baseMetadata = {
      ...(executionRecord?.metadata ?? {}),
    } as Record<string, any>;
    const attemptNumber = job.attemptsMade + 1;
    const maxAttempts = job.opts.attempts ?? this.maxRetries + 1;

    const connectorSet = new Set<string>();
    if (Array.isArray(job.data.connectors)) {
      for (const candidate of job.data.connectors) {
        if (typeof candidate === 'string') {
          const normalized = candidate.trim();
          if (normalized) {
            connectorSet.add(normalized);
          }
        }
      }
    }
    if (Array.isArray(baseMetadata.connectors)) {
      for (const candidate of baseMetadata.connectors as unknown[]) {
        if (typeof candidate === 'string') {
          const normalized = candidate.trim();
          if (normalized) {
            connectorSet.add(normalized);
          }
        }
      }
    }
    const connectorsForExecution = Array.from(connectorSet);

    const runningMetadata = {
      ...baseMetadata,
      attemptsMade: attemptNumber,
      retryCount: Math.max(0, attemptNumber - 1),
    } as Record<string, any>;
    if ('lastError' in runningMetadata) {
      delete runningMetadata.lastError;
    }
    if ('finishedAt' in runningMetadata) {
      delete runningMetadata.finishedAt;
    }
    if ('lease' in runningMetadata) {
      delete runningMetadata.lease;
    }
    if ('resumeCallbacks' in runningMetadata) {
      delete runningMetadata.resumeCallbacks;
    }

    if (connectorsForExecution.length > 0) {
      runningMetadata.connectorConcurrency = {
        ...(runningMetadata.connectorConcurrency ?? {}),
        connectors: connectorsForExecution,
      } as Record<string, any>;
    }

    runningMetadata.residency = {
      ...(runningMetadata.residency ?? {}),
      region: jobRegion,
    };

    if (resumeState?.idempotencyKeys || resumeState?.requestHashes) {
      runningMetadata.deterministicKeys = {
        ...(runningMetadata.deterministicKeys ?? {}),
        ...(resumeState?.idempotencyKeys ? { idempotency: { ...resumeState.idempotencyKeys } } : {}),
        ...(resumeState?.requestHashes ? { request: { ...resumeState.requestHashes } } : {}),
      };
    }

    const now = new Date();
    const lockExpiresAt = new Date(now.getTime() + this.lockDurationMs);
    const workerId = this.worker?.id ?? `execution-worker:${process.pid}`;
    runningMetadata.lease = {
      workerId,
      lockedAt: now.toISOString(),
      lockDurationMs: this.lockDurationMs,
      lockRenewTimeMs: this.lockRenewTimeMs,
      heartbeatIntervalMs: this.heartbeatIntervalMs,
      heartbeatTimeoutMs: this.heartbeatTimeoutMs,
      lockExpiresAt: lockExpiresAt.toISOString(),
      lastHeartbeatAt: now.toISOString(),
      renewCount: 0,
    } as Record<string, any>;

    let runningSlotAcquired = false;
    let connectorSlotsAcquired = false;
    let runningSlotState: ExecutionQuotaCounters | null = null;

    try {
      const quotaProfile = await organizationService.getExecutionQuotaProfile(organizationId);
      const runningSlot = await this.acquireRunningSlotWithBackoff(organizationId, quotaProfile.limits);
      if (!runningSlot.acquired) {
        const quotaError = new ExecutionQuotaExceededError({
          organizationId,
          reason: 'concurrency',
          limit: quotaProfile.limits.maxConcurrentExecutions,
          current: runningSlot.state.running,
          windowCount: runningSlot.state.windowCount,
          windowStart: new Date(runningSlot.state.windowStartMs),
          executionId,
          message: `Execution ${executionId} is waiting for a concurrency slot (${runningSlot.state.running}/${quotaProfile.limits.maxConcurrentExecutions})`,
        });
        await executionQuotaService.recordQuotaEvent({
          organizationId,
          reason: 'concurrency',
          limit: quotaProfile.limits.maxConcurrentExecutions,
          current: runningSlot.state.running,
          state: runningSlot.state,
          metadata: { executionId, workflowId },
        });
        throw quotaError;
      }

      runningSlotAcquired = true;
      runningSlotState = runningSlot.state;

      if (runningSlotState) {
        runningMetadata.quota = {
          ...(runningMetadata.quota ?? {}),
          runningAt: new Date().toISOString(),
          concurrentExecutions: runningSlotState.running,
          executionsInWindow: runningSlotState.windowCount,
          windowStart: new Date(runningSlotState.windowStartMs).toISOString(),
        } as Record<string, any>;
      }

      if (connectorsForExecution.length > 0) {
        await connectorConcurrencyService.registerExecution({
          executionId,
          organizationId,
          connectors: connectorsForExecution,
        });
        connectorSlotsAcquired = true;
        runningMetadata.connectorConcurrency = {
          ...(runningMetadata.connectorConcurrency ?? {}),
          connectors: connectorsForExecution,
          running: true,
        } as Record<string, any>;
      }

      await WorkflowRepository.updateWorkflowExecution(
        executionId,
        {
          status: 'running',
          startedAt: new Date(),
          completedAt: null,
          duration: null,
          metadata: runningMetadata,
        },
        organizationId
      );

      this.activeLeases.set(executionId, {
        metadata: runningMetadata,
        organizationId,
        lastPersistedAt: Date.now(),
      });

      const wf = await WorkflowRepository.getWorkflowById(workflowId, organizationId);
      if (!wf || !wf.graph) {
        throw new Error(`Workflow not found or missing graph: ${workflowId}`);
      }

      const defaultInitialData = {
        trigger: { id: 'queue', source: 'queue', timestamp: new Date().toISOString() },
      };
      const initialData = job.data.initialData ?? defaultInitialData;
      const trigger = job.data.triggerType ?? (resumeState ? 'timer' : 'manual');

      const result = await workflowRuntime.executeWorkflow(wf.graph as any, initialData, userId, {
        executionId,
        organizationId,
        triggerType: trigger,
        resumeState,
      });

      if (result.deterministicKeys) {
        runningMetadata.deterministicKeys = {
          ...(runningMetadata.deterministicKeys ?? {}),
          ...result.deterministicKeys,
        };
      }

      if (timerId) {
        await this.markTimerCompleted(timerId);
      }

      if (!result.success && result.status === 'failed') {
        throw new Error(result.error || 'Execution returned unsuccessful result');
      }

      if (result.status === 'waiting') {
        const waitingMetadata = {
          ...runningMetadata,
          waitUntil: result.waitUntil ?? null,
          timerId: result.timerId ?? null,
          retryCount: Math.max(0, attemptNumber - 1),
        } as Record<string, any>;
        delete waitingMetadata.lastError;
        delete waitingMetadata.finishedAt;
        if ('lease' in waitingMetadata) {
          delete waitingMetadata.lease;
        }

        if (result.resumeState && result.waitingNode?.id) {
          const tokenResult = await executionResumeTokenService.issueToken({
            executionId,
            workflowId,
            organizationId,
            nodeId: result.waitingNode.id,
            userId,
            resumeState: result.resumeState,
            initialData: job.data.initialData ?? null,
            triggerType: 'callback',
            waitUntil: result.waitUntil ? new Date(result.waitUntil) : null,
            metadata: {
              timerId: result.timerId ?? null,
              waitingNode: {
                id: result.waitingNode.id,
                label: result.waitingNode.label,
                type: result.waitingNode.type,
              },
            },
          });

          if (tokenResult) {
            waitingMetadata.resumeCallbacks = {
              ...(waitingMetadata.resumeCallbacks ?? {}),
              [result.waitingNode.id]: {
                callbackUrl: tokenResult.callbackUrl,
                expiresAt: tokenResult.expiresAt.toISOString(),
              },
            } as Record<string, any>;
          }
        }

        await WorkflowRepository.updateWorkflowExecution(
          executionId,
          {
            status: 'waiting',
            completedAt: null,
            duration: Date.now() - startedAt,
            nodeResults: result.nodeOutputs,
            errorDetails: null,
            metadata: waitingMetadata,
          },
          organizationId
        );

        return;
      }

      const metadata = {
        ...runningMetadata,
        finishedAt: new Date().toISOString(),
        retryCount: Math.max(0, attemptNumber - 1),
      } as Record<string, any>;
      delete metadata.lastError;
      if ('waitUntil' in metadata) {
        delete metadata.waitUntil;
      }
      if ('timerId' in metadata) {
        delete metadata.timerId;
      }
      if ('lease' in metadata) {
        delete metadata.lease;
      }
      if ('resumeCallbacks' in metadata) {
        delete metadata.resumeCallbacks;
      }

      await WorkflowRepository.updateWorkflowExecution(
        executionId,
        {
          status: 'completed',
          completedAt: new Date(),
          duration: Date.now() - startedAt,
          nodeResults: result.nodeOutputs,
          errorDetails: null,
          metadata,
        },
        organizationId
      );
    } catch (error: any) {
      const errorMessage = getErrorMessage(error);
      const failureMetadata = {
        ...baseMetadata,
        attemptsMade: attemptNumber,
        retryCount: attemptNumber,
        lastError: errorMessage,
      } as Record<string, any>;
      if (runningMetadata.deterministicKeys) {
        failureMetadata.deterministicKeys = {
          ...(failureMetadata.deterministicKeys ?? {}),
          ...runningMetadata.deterministicKeys,
        };
      }
      if ('finishedAt' in failureMetadata) {
        delete failureMetadata.finishedAt;
      }
      if ('lease' in failureMetadata) {
        delete failureMetadata.lease;
      }

      if (error instanceof ExecutionQuotaExceededError) {
        failureMetadata.quota = {
          ...(failureMetadata.quota ?? {}),
          reason: error.reason,
          limit: error.limit,
          current: error.current,
        } as Record<string, any>;
      }

      if (error instanceof ConnectorConcurrencyExceededError) {
        failureMetadata.connectorConcurrency = {
          ...(failureMetadata.connectorConcurrency ?? {}),
          violation: {
            connectorId: error.connectorId,
            scope: error.scope,
            limit: error.limit,
            active: error.active,
          },
        } as Record<string, any>;
      }

      const remainingAttempts = Math.max(0, maxAttempts - attemptNumber);

      if (remainingAttempts > 0) {
        await WorkflowRepository.updateWorkflowExecution(
          executionId,
          {
            status: 'queued',
            completedAt: null,
            duration: null,
            errorDetails: { error: errorMessage },
            metadata: failureMetadata,
          },
          organizationId
        );

        console.warn(
          `⚠️ Execution ${executionId} failed (attempt ${attemptNumber}/${maxAttempts}). Retrying via queue: ${errorMessage}`
        );
      } else {
        if (timerId) {
          await this.markTimerForRetry(timerId, errorMessage);
        }

        await WorkflowRepository.updateWorkflowExecution(
          executionId,
          {
            status: 'failed',
            completedAt: new Date(),
            duration: Date.now() - startedAt,
            errorDetails: { error: errorMessage },
            metadata: failureMetadata,
          },
          organizationId
        );

        console.error(`❌ Execution ${executionId} failed after ${attemptNumber} attempts:`, errorMessage);
      }

      throw error;
    } finally {
      if (connectorSlotsAcquired) {
        await connectorConcurrencyService.releaseExecution(executionId).catch((error) => {
          console.warn(
            `Failed to release connector concurrency slots for execution ${executionId}:`,
            getErrorMessage(error)
          );
        });
      }
      if (runningSlotAcquired) {
        await executionQuotaService.releaseRunningSlot(organizationId).catch((error) => {
          console.warn(
            `Failed to release running slot for organization ${organizationId}:`,
            getErrorMessage(error)
          );
        });
      }
      this.activeLeases.delete(executionId);
    }
  }

  private async markTimerCompleted(timerId: string | null): Promise<void> {
    if (!timerId || !this.isDbEnabled()) {
      return;
    }

    try {
      await db
        .update(workflowTimers)
        .set({
          status: 'completed',
          updatedAt: new Date(),
          lastError: null,
        })
        .where(eq(workflowTimers.id, timerId));
    } catch (error) {
      console.error('Failed to mark workflow timer as completed:', getErrorMessage(error));
    }
  }

  private async markTimerForRetry(timerId: string | null, errorMessage: string): Promise<void> {
    if (!timerId || !this.isDbEnabled()) {
      return;
    }

    const retryDelayMs = Math.max(this.baseRetryDelayMs, 5000);
    const nextAttemptAt = new Date(Date.now() + retryDelayMs);

    try {
      await db
        .update(workflowTimers)
        .set({
          status: 'pending',
          resumeAt: nextAttemptAt,
          updatedAt: new Date(),
          lastError: errorMessage,
          attempts: sql`${workflowTimers.attempts} + 1`,
        })
        .where(eq(workflowTimers.id, timerId));
    } catch (error) {
      console.error('Failed to reset workflow timer for retry:', getErrorMessage(error));
    }
  }
}

export const executionQueueService = ExecutionQueueService.getInstance();
