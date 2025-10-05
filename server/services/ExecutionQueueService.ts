import { eq, sql } from 'drizzle-orm';

import { getErrorMessage } from '../types/common.js';
import { sanitizeLogPayload } from '../utils/executionLogRedaction.js';
import { WorkflowRepository } from '../workflow/WorkflowRepository.js';
import { workflowRuntime } from '../core/WorkflowRuntime.js';
import { runExecutionManager } from '../core/RunExecutionManager.js';
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
  type WorkflowRunStepJobPayload,
  type ExecutionQueueName,
  type ExecutionStepQueueName,
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
  WorkflowExecutionStepRepository,
  type InitializedStepDescriptor,
} from '../workflow/WorkflowExecutionStepRepository.js';
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
  private readonly stepQueueCache = new Map<
    ExecutionStepQueueName,
    Queue<WorkflowRunStepJobPayload, unknown, ExecutionStepQueueName>
  >();
  private stepWorker: Worker<WorkflowRunStepJobPayload, unknown, ExecutionStepQueueName> | null = null;
  private queueEvents: QueueEvents | null = null;
  private stepQueueEvents: QueueEvents | null = null;
  private telemetryCleanup: (() => void) | null = null;
  private stepTelemetryCleanup: (() => void) | null = null;
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

  private getStepQueueName(region: OrganizationRegion): ExecutionStepQueueName {
    return `workflow.run-step.${region}` as ExecutionStepQueueName;
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

    if (sanitizedInitialData !== undefined) {
      baseMetadata.initialData = sanitizedInitialData;
    }

    if (sanitizedResumeState !== undefined) {
      baseMetadata.resumeState = sanitizedResumeState;
    }

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

    const region = await organizationService.getOrganizationRegion(params.organizationId);
    const targetNodeId = params.resumeState.nextNodeId ?? params.resumeState.remainingNodeIds?.[0] ?? null;
    if (targetNodeId) {
      const stepRecord = await WorkflowExecutionStepRepository.getStepByNode(
        params.executionId,
        targetNodeId
      );
      if (stepRecord) {
        await WorkflowExecutionStepRepository.updateResumeState(stepRecord.id, params.resumeState);
        await WorkflowExecutionStepRepository.resetForRetry(stepRecord.id);
      }
    }

    const resumeIdentifier = params.timerId ?? params.tokenId ?? Date.now().toString(36);
    const jobId = `${params.executionId}:${resumeIdentifier}`;
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

      if (params.timerId) {
        await this.markTimerCompleted(params.timerId);
      }
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

      const stepQueueName = this.getStepQueueName(this.workerRegion);
      const stepQueue = this.ensureStepQueue(stepQueueName);
      if (!this.stepQueueEvents) {
        this.stepQueueEvents = createQueueEvents(stepQueueName, { region: this.workerRegion });
      }

      if (!this.stepTelemetryCleanup) {
        this.stepTelemetryCleanup = registerQueueTelemetry(stepQueue, this.stepQueueEvents, {
          logger: console,
          onMetrics: (counts) => {
            updateQueueDepthMetric(stepQueue.name, counts);
          },
        });
      }

      this.stepWorker = registerQueueWorker(
        stepQueueName,
        async (job) => this.processStep(job),
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
            _job: Job<WorkflowRunStepJobPayload, unknown, ExecutionStepQueueName>,
            context: QueueWorkerHeartbeatContext<ExecutionStepQueueName>
          ) => {
            const { executionId } = _job.data;
            if (!executionId) {
              return;
            }

            const leaseEntry = this.activeLeases.get(executionId);
            if (!leaseEntry) {
              return;
            }

            const leaseMetadata = (leaseEntry.metadata.lease ?? {}) as Record<string, any>;
            leaseMetadata.lastStepHeartbeatAt = context.timestamp.toISOString();
            leaseMetadata.lastStepLockExpiresAt = context.lockExpiresAt.toISOString();
            leaseMetadata.stepRenewCount = context.renewCount;
            leaseEntry.metadata.lease = leaseMetadata;
            leaseEntry.lastPersistedAt = context.timestamp.getTime();
          },
        }
      );

      this.stepWorker.on('error', (error) => {
        console.error('Run-step worker error:', getErrorMessage(error));
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

      const closeStepWorker = async () => {
        if (!this.stepWorker) {
          return;
        }
        await this.stepWorker.close();
        this.stepWorker = null;
      };

      if (timeoutMs === 0) {
        await closeWorker();
        await closeStepWorker();
      } else {
        await Promise.race([
          closeWorker(),
          new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
        ]);
        await closeWorker().catch((error) => {
          console.error('Failed to close execution worker gracefully:', getErrorMessage(error));
        });

        await Promise.race([
          closeStepWorker(),
          new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
        ]);
        await closeStepWorker().catch((error) => {
          console.error('Failed to close step worker gracefully:', getErrorMessage(error));
        });
      }

      if (this.queueEvents) {
        await this.queueEvents.close();
        this.queueEvents = null;
      }

      if (this.stepQueueEvents) {
        await this.stepQueueEvents.close();
        this.stepQueueEvents = null;
      }

      if (this.telemetryCleanup) {
        try {
          this.telemetryCleanup();
        } catch (error) {
          console.error('Failed to cleanup queue telemetry handlers:', getErrorMessage(error));
        }
        this.telemetryCleanup = null;
      }

      if (this.stepTelemetryCleanup) {
        try {
          this.stepTelemetryCleanup();
        } catch (error) {
          console.error('Failed to cleanup step queue telemetry handlers:', getErrorMessage(error));
        }
        this.stepTelemetryCleanup = null;
      }

      const workerQueue = this.queueCache.get(this.workerQueueName);
      if (workerQueue) {
        try {
          await workerQueue.close();
        } catch (error) {
          console.error('Failed to close execution queue during shutdown:', getErrorMessage(error));
        }
      }

      const stepQueue = this.stepQueueCache.get(this.getStepQueueName(this.workerRegion));
      if (stepQueue) {
        try {
          await stepQueue.close();
        } catch (error) {
          console.error('Failed to close step queue during shutdown:', getErrorMessage(error));
        }
      }

      this.queueCache.clear();
      this.stepQueueCache.clear();

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

  private ensureStepQueue(
    name: ExecutionStepQueueName
  ): Queue<WorkflowRunStepJobPayload, unknown, ExecutionStepQueueName> {
    const existing = this.stepQueueCache.get(name);
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

    this.stepQueueCache.set(name, queue);
    return queue;
  }

  private async enqueueReadySteps(params: {
    executionId: string;
    workflowId: string;
    organizationId: string;
    userId?: string;
    trigger: string;
    region: OrganizationRegion;
    steps: InitializedStepDescriptor[];
  }): Promise<void> {
    if (params.steps.length === 0) {
      return;
    }

    const queueName = this.getStepQueueName(params.region);
    const queue = this.ensureStepQueue(queueName);

    for (const step of params.steps) {
      try {
        await WorkflowExecutionStepRepository.setQueued(step.stepId);
        const payload: WorkflowRunStepJobPayload = {
          executionId: params.executionId,
          workflowId: params.workflowId,
          organizationId: params.organizationId,
          nodeId: step.nodeId,
          stepId: step.stepId,
          userId: params.userId,
          triggerType: params.trigger,
          region: params.region,
        };

        await queue.add(
          'workflow.run-step',
          payload,
          {
            jobId: `${step.stepId}:${Date.now().toString(36)}`,
            group: {
              id: params.organizationId,
            },
          }
        );
      } catch (error) {
        console.error(
          `Failed to enqueue step ${step.stepId} for execution ${params.executionId}:`,
          getErrorMessage(error)
        );
        await WorkflowExecutionStepRepository.resetForRetry(step.stepId).catch((resetError) => {
          console.warn(
            `Failed to reset step ${step.stepId} after enqueue error:`,
            getErrorMessage(resetError)
          );
        });
        throw error;
      }
    }
  }

  private async awaitExecutionCompletion(params: {
    executionId: string;
    organizationId: string;
    startedAt: number;
  }): Promise<{ status: 'completed' | 'failed' | 'waiting'; errorMessage?: string }> {
    const pollInterval = Math.max(500, Math.floor(this.heartbeatIntervalMs));

    while (true) {
      const execution = await WorkflowRepository.getExecutionById(
        params.executionId,
        params.organizationId
      );

      if (!execution) {
        throw new Error(`Execution ${params.executionId} not found during orchestration`);
      }

      const status = execution.status as string;
      if (status === 'completed' || status === 'failed' || status === 'waiting') {
        return {
          status: status as 'completed' | 'failed' | 'waiting',
          errorMessage: execution.errorDetails?.error ?? undefined,
        };
      }

      const allCompleted = await WorkflowExecutionStepRepository.allStepsCompleted(params.executionId);
      if (allCompleted) {
        const aggregatedOutputs = await WorkflowExecutionStepRepository.getNodeOutputs(
          params.executionId
        );
        await WorkflowRepository.updateWorkflowExecution(
          params.executionId,
          {
            status: 'completed',
            completedAt: new Date(),
            duration: Date.now() - params.startedAt,
            nodeResults: aggregatedOutputs,
            errorDetails: null,
          },
          params.organizationId
        ).catch((error) => {
          console.warn(
            `Execution ${params.executionId}: failed to mark completion while waiting:`,
            getErrorMessage(error)
          );
        });
        return { status: 'completed' };
      }

      await this.delay(pollInterval);
    }
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private resolvePrevOutputForNode(
    graph: any,
    nodeId: string,
    nodeOutputs: Record<string, any>,
    initialData: any
  ): any {
    if (!graph?.edges || !Array.isArray(graph.edges)) {
      return initialData;
    }

    const inbound = graph.edges.filter((edge: any) => edge?.to === nodeId);
    if (inbound.length === 0) {
      return initialData;
    }

    for (let i = inbound.length - 1; i >= 0; i--) {
      const candidate = inbound[i];
      if (candidate?.from && candidate.from in nodeOutputs) {
        return nodeOutputs[candidate.from];
      }
    }

    return initialData;
  }

  private async processStep(job: Job<WorkflowRunStepJobPayload>): Promise<void> {
    const { executionId, workflowId, organizationId, nodeId, stepId } = job.data;
    const jobRegion = (job.data.region as OrganizationRegion | undefined) ?? this.workerRegion;

    if (jobRegion !== this.workerRegion) {
      recordCrossRegionViolation({
        subsystem: 'run-step-worker',
        expectedRegion: this.workerRegion,
        actualRegion: jobRegion,
        identifier: `${executionId}:${nodeId}`,
      });
      throw new Error(
        `Run-step worker region mismatch: expected ${this.workerRegion}, received ${jobRegion}`
      );
    }

    const execution = await WorkflowRepository.getExecutionById(executionId, organizationId);
    if (!execution) {
      throw new Error(`Execution ${executionId} not found for step ${stepId}`);
    }

    const wf = await WorkflowRepository.getWorkflowById(workflowId, organizationId);
    if (!wf || !wf.graph) {
      throw new Error(`Workflow ${workflowId} not found for step execution`);
    }

    const stepRecord = await WorkflowExecutionStepRepository.markRunning(stepId);
    if (!stepRecord) {
      throw new Error(`Step ${stepId} is missing (execution ${executionId})`);
    }

    const attemptNumber = stepRecord.attempts;
    const maxAttempts = stepRecord.maxAttempts ?? (job.opts.attempts ?? this.maxRetries + 1);

    const initialData = execution.metadata?.initialData ?? job.data.initialData ?? {};
    const existingOutputs = await WorkflowExecutionStepRepository.getNodeOutputs(executionId);
    const deterministicKeys = await WorkflowExecutionStepRepository.getDeterministicKeys(executionId);

    const prevOutput = this.resolvePrevOutputForNode(
      wf.graph as any,
      nodeId,
      existingOutputs,
      initialData
    );

    const storedResumeState = (stepRecord.resumeState as WorkflowResumeState | null) ?? null;
    const resumeState: WorkflowResumeState = storedResumeState
      ? {
          ...storedResumeState,
          nodeOutputs: {
            ...(storedResumeState.nodeOutputs ?? {}),
            ...existingOutputs,
          },
          prevOutput: storedResumeState.prevOutput ?? prevOutput,
          remainingNodeIds:
            storedResumeState.remainingNodeIds && storedResumeState.remainingNodeIds.length > 0
              ? storedResumeState.remainingNodeIds
              : [nodeId],
          nextNodeId: storedResumeState.nextNodeId ?? nodeId,
          idempotencyKeys: storedResumeState.idempotencyKeys ?? deterministicKeys.idempotency,
          requestHashes: storedResumeState.requestHashes ?? deterministicKeys.request,
        }
      : {
          nodeOutputs: existingOutputs,
          prevOutput,
          remainingNodeIds: [nodeId],
          nextNodeId: nodeId,
          startedAt: execution.startedAt?.toISOString() ?? new Date().toISOString(),
          idempotencyKeys: deterministicKeys.idempotency,
          requestHashes: deterministicKeys.request,
        };

    try {
      const result = await workflowRuntime.executeWorkflow(
        wf.graph as any,
        initialData,
        job.data.userId ?? execution.userId ?? undefined,
        {
          executionId,
          organizationId,
          triggerType: job.data.triggerType ?? execution.triggerType ?? 'manual',
          resumeState,
          mode: 'step',
        }
      );

      if (!result.success && result.status === 'failed') {
        throw new Error(result.error || `Step ${nodeId} returned failure`);
      }

      if (result.status === 'waiting') {
        const latestExecution = await WorkflowRepository.getExecutionById(
          executionId,
          organizationId
        );
        const baseMetadata = latestExecution?.metadata ?? {};

        await WorkflowExecutionStepRepository.markWaiting({
          stepId,
          waitUntil: result.waitUntil ? new Date(result.waitUntil) : null,
          resumeState: result.resumeState ?? null,
          metadata: result.deterministicKeys ?? null,
        });

        if (result.resumeState && result.waitingNode?.id) {
          const stepCounts = await WorkflowExecutionStepRepository.getStatusCounts(executionId);
          try {
            const tokenResult = await executionResumeTokenService.issueToken({
              executionId,
              workflowId,
              organizationId,
              nodeId: result.waitingNode.id,
              userId: job.data.userId ?? execution.userId ?? undefined,
              resumeState: result.resumeState,
              initialData,
              triggerType: 'callback',
              waitUntil: result.waitUntil ? new Date(result.waitUntil) : null,
              metadata: {
                waitingNode: result.waitingNode,
              },
            });

            if (tokenResult) {
              await WorkflowRepository.updateWorkflowExecution(
                executionId,
                {
                  status: 'waiting',
                  nodeResults: result.nodeOutputs,
                  metadata: {
                    ...baseMetadata,
                    waitUntil: result.waitUntil ?? null,
                    resumeCallbacks: {
                      ...(baseMetadata?.resumeCallbacks ?? {}),
                      [result.waitingNode.id]: {
                        callbackUrl: tokenResult.callbackUrl,
                        expiresAt: tokenResult.expiresAt.toISOString(),
                      },
                    },
                    stepCounts,
                  },
                },
                organizationId
              );
            }
          } catch (tokenError) {
            console.warn(
              `Execution ${executionId}: failed to emit resume token for node ${result.waitingNode?.id}:`,
              getErrorMessage(tokenError)
            );
          }
        } else {
          await WorkflowRepository.updateWorkflowExecution(
            executionId,
            {
              status: 'waiting',
              nodeResults: result.nodeOutputs,
              metadata: {
                ...baseMetadata,
                waitUntil: result.waitUntil ?? null,
                stepCounts: await WorkflowExecutionStepRepository.getStatusCounts(executionId),
              },
            },
            organizationId
          );
        }

        return;
      }

      const stepOutput = result.nodeOutputs?.[nodeId] ?? null;
      const outputObject =
        stepOutput && typeof stepOutput === 'object' && !Array.isArray(stepOutput)
          ? (stepOutput as Record<string, any>)
          : null;
      await WorkflowExecutionStepRepository.markCompleted({
        stepId,
        output: stepOutput,
        logs: outputObject?.logs ?? null,
        diagnostics: (outputObject?.diagnostics as Record<string, any> | null | undefined) ?? null,
        deterministicKeys: result.deterministicKeys ?? null,
        metadata: {
          executionTime: result.executionTime,
          attempt: attemptNumber,
        },
      });
      await WorkflowExecutionStepRepository.clearResumeState(stepId);

      const refreshedExecution = await WorkflowRepository.getExecutionById(
        executionId,
        organizationId
      );

      const executionMetadata = {
        ...(refreshedExecution?.metadata ?? {}),
      } as Record<string, any>;
      executionMetadata.deterministicKeys = {
        ...(refreshedExecution?.metadata?.deterministicKeys ?? {}),
        ...(result.deterministicKeys ?? {}),
      };
      executionMetadata.stepCounts = await WorkflowExecutionStepRepository.getStatusCounts(executionId);
      if ('waitUntil' in executionMetadata) {
        delete executionMetadata.waitUntil;
      }
      if ('resumeCallbacks' in executionMetadata) {
        delete executionMetadata.resumeCallbacks;
      }

      await WorkflowRepository.updateWorkflowExecution(
        executionId,
        {
          status: 'running',
          nodeResults: result.nodeOutputs,
          metadata: executionMetadata,
        },
        organizationId
      );

      const dependents = await WorkflowExecutionStepRepository.getDependents(stepId);
      const readyDependents: InitializedStepDescriptor[] = [];
      for (const dependent of dependents) {
        const satisfied = await WorkflowExecutionStepRepository.areDependenciesSatisfied(dependent.id);
        if (satisfied && dependent.status === 'pending') {
          readyDependents.push({ stepId: dependent.id, nodeId: dependent.nodeId });
        }
      }

      if (readyDependents.length > 0) {
        await this.enqueueReadySteps({
          executionId,
          workflowId,
          organizationId,
          userId: job.data.userId ?? execution.userId ?? undefined,
          trigger: job.data.triggerType ?? execution.triggerType ?? 'manual',
          region: jobRegion,
          steps: readyDependents,
        });
      }

      const allCompleted = await WorkflowExecutionStepRepository.allStepsCompleted(executionId);
      if (allCompleted) {
        const completedExecution = await WorkflowRepository.getExecutionById(
          executionId,
          organizationId
        );
        const startedAtMs = completedExecution?.startedAt?.getTime() ?? refreshedExecution?.startedAt?.getTime() ?? execution.startedAt?.getTime() ?? null;
        await WorkflowRepository.updateWorkflowExecution(
          executionId,
          {
            status: 'completed',
            completedAt: new Date(),
            duration: startedAtMs !== null ? Date.now() - startedAtMs : null,
            nodeResults: result.nodeOutputs,
            errorDetails: null,
          },
          organizationId
        );
      }
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const finalFailure = attemptNumber >= maxAttempts;

      await WorkflowExecutionStepRepository.markFailed({
        stepId,
        error: { error: errorMessage },
        metadata: { attempt: attemptNumber },
        finalFailure,
        logs: null,
        diagnostics: null,
      });

      if (finalFailure) {
        const failedExecution = await WorkflowRepository.getExecutionById(
          executionId,
          organizationId
        );
        const startedAtMs = failedExecution?.startedAt?.getTime() ?? execution.startedAt?.getTime() ?? null;
        const stepCounts = await WorkflowExecutionStepRepository.getStatusCounts(executionId);
        await WorkflowRepository.updateWorkflowExecution(
          executionId,
          {
            status: 'failed',
            completedAt: new Date(),
            errorDetails: { error: errorMessage, nodeId },
            metadata: {
              ...(failedExecution?.metadata ?? execution.metadata ?? {}),
              lastError: errorMessage,
              failedNode: nodeId,
              stepCounts,
            },
            duration: startedAtMs !== null ? Date.now() - startedAtMs : null,
          },
          organizationId
        );
      } else {
        await WorkflowExecutionStepRepository.resetForRetry(stepId);
      }

      throw error;
    }
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
      try {
        await runExecutionManager.startExecution(
          executionId,
          wf.graph as any,
          userId,
          trigger,
          initialData,
          organizationId
        );
      } catch (startError) {
        console.warn(
          `Execution ${executionId}: failed to record start in execution manager:`,
          getErrorMessage(startError)
        );
      }

      const initialized = await WorkflowExecutionStepRepository.isInitialized(executionId);
      let stepInitialization: { stepIdByNodeId: Map<string, string>; readySteps: InitializedStepDescriptor[] };

      if (!initialized) {
        stepInitialization = await WorkflowExecutionStepRepository.initialize({
          executionId,
          workflowId,
          organizationId,
          graph: wf.graph as any,
          maxAttempts: this.maxRetries + 1,
        });
      } else {
        const existingSteps = await WorkflowExecutionStepRepository.getSteps(executionId);
        const map = new Map<string, string>();
        for (const step of existingSteps) {
          map.set(step.nodeId, step.id);
        }
        const readySteps = await WorkflowExecutionStepRepository.getReadySteps(executionId);
        stepInitialization = { stepIdByNodeId: map, readySteps };
      }

      if (stepInitialization.readySteps.length > 0) {
        await this.enqueueReadySteps({
          executionId,
          workflowId,
          organizationId,
          userId,
          trigger,
          region: jobRegion,
          steps: stepInitialization.readySteps,
        });
      }

      const completion = await this.awaitExecutionCompletion({
        executionId,
        organizationId,
        startedAt,
      });

      if (completion.status === 'waiting') {
        return;
      }

      if (timerId) {
        await this.markTimerCompleted(timerId);
      }

      if (completion.status === 'failed') {
        console.error(
          `❌ Execution ${executionId} failed after ${attemptNumber} attempt(s):`,
          completion.errorMessage ?? 'Unknown error'
        );
        return;
      }

      console.log(`✅ Execution ${executionId} completed via step queue.`);
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
