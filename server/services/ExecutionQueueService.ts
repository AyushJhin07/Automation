import { sql } from 'drizzle-orm';

import { getErrorMessage } from '../types/common.js';
import { WorkflowRepository } from '../workflow/WorkflowRepository.js';
import { workflowRuntime } from '../core/WorkflowRuntime.js';
import { db, workflowExecutions } from '../database/schema.js';

type QueueRunRequest = {
  workflowId: string;
  userId?: string;
  triggerType?: string;
  triggerData?: Record<string, any> | null;
  organizationId: string;
};

type ClaimedJob = {
  id: string;
  workflowId: string;
  userId?: string;
  metadata?: Record<string, any>;
  organizationId: string;
};

class ExecutionQueueService {
  private static instance: ExecutionQueueService;
  private running = 0;
  private readonly concurrency: number;
  private readonly pollingMs: number;
  private readonly maxRetries: number;
  private readonly baseRetryDelayMs: number;
  private readonly maxRetryDelayMs: number;
  private started = false;
  private shouldStop = false;
  private workerPromises: Promise<void>[] = [];
  private waiters: Set<() => void> = new Set();
  private shutdownPromise: Promise<void> | null = null;
  private pendingOrganizations: Set<string> = new Set();

  private constructor(concurrency = 2, pollingMs = 1000) {
    this.concurrency = Math.max(1, concurrency);
    this.pollingMs = Math.max(250, pollingMs);
    this.maxRetries = Math.max(0, Number.parseInt(process.env.EXECUTION_MAX_RETRIES ?? '3', 10));
    this.baseRetryDelayMs = Math.max(500, Number.parseInt(process.env.EXECUTION_RETRY_DELAY_MS ?? '1000', 10));
    this.maxRetryDelayMs = Math.max(
      this.baseRetryDelayMs,
      Number.parseInt(process.env.EXECUTION_MAX_RETRY_DELAY_MS ?? `${5 * 60 * 1000}`, 10)
    );
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

  private computeBackoff(attempt: number): number {
    const exponent = Math.pow(2, Math.max(0, attempt - 1));
    const jitter = Math.floor(Math.random() * this.baseRetryDelayMs * 0.2);
    return Math.min(exponent * this.baseRetryDelayMs + jitter, this.maxRetryDelayMs);
  }

  public async enqueue(req: QueueRunRequest): Promise<{ executionId: string }> {
    const execution = await WorkflowRepository.createWorkflowExecution({
      workflowId: req.workflowId,
      userId: req.userId,
      organizationId: req.organizationId,
      status: 'queued',
      triggerType: req.triggerType ?? 'manual',
      triggerData: req.triggerData ?? null,
      metadata: { queuedAt: new Date().toISOString(), retryCount: 0 },
    });
    this.pendingOrganizations.add(req.organizationId);
    this.signalNewWork();
    return { executionId: execution.id };
  }

  public start(): void {
    if (this.started) {
      return;
    }

    if (!this.isDbEnabled()) {
      console.warn('⚠️ ExecutionQueueService requires a configured database to run.');
      return;
    }

    this.started = true;
    this.shouldStop = false;

    this.workerPromises = Array.from({ length: this.concurrency }, (_, workerIndex) =>
      this.workerLoop(workerIndex).catch((error) => {
        console.error(`ExecutionQueue worker ${workerIndex} failed:`, getErrorMessage(error));
      })
    );

    console.log(`🧵 ExecutionQueueService started (concurrency=${this.concurrency})`);
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

    this.shouldStop = true;
    this.signalNewWork();

    const timeoutMs = Math.max(0, options.timeoutMs ?? 30000);

    const awaitWorkers = async (): Promise<void> => {
      const settled = await Promise.allSettled(this.workerPromises);
      const rejected = settled.find((result) => result.status === 'rejected');
      if (rejected && rejected.status === 'rejected') {
        throw rejected.reason;
      }
    };

    this.shutdownPromise = (async () => {
      if (timeoutMs === 0) {
        await awaitWorkers();
      } else {
        await Promise.race([
          awaitWorkers(),
          new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
        ]);
      }

      this.workerPromises = [];
      this.started = false;
      this.shutdownPromise = null;
    })();

    return this.shutdownPromise;
  }

  private async workerLoop(workerIndex: number): Promise<void> {
    while (!this.shouldStop) {
      let job: ClaimedJob | null = null;
      try {
        job = await this.claimNextQueued();
      } catch (error) {
        console.error(`ExecutionQueue worker ${workerIndex} claim error:`, getErrorMessage(error));
      }

      if (!job) {
        await this.waitForWork();
        continue;
      }

      this.running++;
      try {
        await this.process(job);
      } finally {
        this.running = Math.max(0, this.running - 1);
      }
    }
  }

  private async waitForWork(): Promise<void> {
    if (this.shouldStop) {
      return;
    }

    await new Promise<void>((resolve) => {
      if (this.shouldStop) {
        resolve();
        return;
      }

      let settled = false;
      let timeoutHandle: NodeJS.Timeout;

      const release = () => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeoutHandle);
        this.waiters.delete(release);
        resolve();
      };

      timeoutHandle = setTimeout(release, this.pollingMs);
      this.waiters.add(release);
    });
  }

  private signalNewWork(): void {
    if (this.waiters.size === 0) {
      return;
    }

    const releases = Array.from(this.waiters);
    this.waiters.clear();

    for (const release of releases) {
      try {
        release();
      } catch (error) {
        console.error('ExecutionQueue wait release error:', getErrorMessage(error));
      }
    }
  }

  private async claimNextQueued(): Promise<ClaimedJob | null> {
    if (!this.isDbEnabled()) {
      return null;
    }

    await this.ensurePendingOrganizations();
    const organizations = Array.from(this.pendingOrganizations);

    for (const organizationId of organizations) {
      const claimed = await WorkflowRepository.claimNextQueuedExecution(organizationId);
      if (!claimed) {
        this.pendingOrganizations.delete(organizationId);
        continue;
      }

      const metadata = (claimed.metadata ?? undefined) as Record<string, any> | undefined;
      if (metadata && 'nextRetryAt' in metadata) {
        delete metadata.nextRetryAt;
      }

      return {
        id: claimed.id,
        workflowId: claimed.workflowId,
        userId: claimed.userId ?? undefined,
        metadata,
        organizationId,
      };
    }

    return null;
  }

  private async ensurePendingOrganizations(): Promise<void> {
    if (this.pendingOrganizations.size > 0 || !this.isDbEnabled()) {
      return;
    }

    try {
      const result = await db.execute(
        sql`SELECT DISTINCT ${workflowExecutions.organizationId} AS organization_id FROM ${workflowExecutions}
            WHERE ${workflowExecutions.status} = 'queued'`
      );
      for (const row of result.rows as Array<{ organization_id: string | null }>) {
        if (row.organization_id) {
          this.pendingOrganizations.add(row.organization_id);
        }
      }
    } catch (error) {
      console.error('ExecutionQueueService organization discovery failed:', getErrorMessage(error));
    }
  }

  private async process(job: ClaimedJob): Promise<void> {
    const startedAt = Date.now();
    const executionRecord = await WorkflowRepository.getExecutionById(job.id, job.organizationId);
    const baseMetadata = { ...(executionRecord?.metadata ?? job.metadata ?? {}) } as Record<string, any>;

    try {
      const wf = await WorkflowRepository.getWorkflowById(job.workflowId, job.organizationId);
      if (!wf || !wf.graph) {
        throw new Error(`Workflow not found or missing graph: ${job.workflowId}`);
      }

      const initialData = { trigger: { id: 'queue', source: 'queue', timestamp: new Date().toISOString() } };
      const result = await workflowRuntime.executeWorkflow(wf.graph as any, initialData, job.userId);

      if (!result.success) {
        throw new Error(result.error || 'Execution returned unsuccessful result');
      }

      const metadata = { ...baseMetadata, retryCount: 0, finishedAt: new Date().toISOString() };
      delete metadata.nextRetryAt;
      delete metadata.lastError;

      await WorkflowRepository.updateWorkflowExecution(job.id, {
        status: 'completed',
        completedAt: new Date(),
        duration: Date.now() - startedAt,
        nodeResults: result.nodeOutputs,
        errorDetails: null,
        metadata,
      }, job.organizationId);
    } catch (error: any) {
      const errorMessage = getErrorMessage(error);
      const currentRetries = typeof baseMetadata.retryCount === 'number' ? baseMetadata.retryCount : 0;
      const nextRetryCount = currentRetries + 1;

      if (nextRetryCount <= this.maxRetries) {
        const delay = this.computeBackoff(nextRetryCount);
        const nextRetryAt = new Date(Date.now() + delay).toISOString();
        const retryMetadata = {
          ...baseMetadata,
          retryCount: nextRetryCount,
          nextRetryAt,
          lastError: errorMessage,
        };

        await WorkflowRepository.updateWorkflowExecution(job.id, {
          status: 'queued',
          completedAt: null,
          duration: null,
          errorDetails: { error: errorMessage },
          metadata: retryMetadata,
          startedAt: new Date(),
        }, job.organizationId);

        console.warn(`⚠️ Execution ${job.id} failed (attempt ${nextRetryCount}). Retrying in ${delay}ms: ${errorMessage}`);
        this.pendingOrganizations.add(job.organizationId);
        this.signalNewWork();
        return;
      }

      const failedMetadata = {
        ...baseMetadata,
        retryCount: nextRetryCount,
        lastError: errorMessage,
      };
      if ('nextRetryAt' in failedMetadata) {
        delete failedMetadata.nextRetryAt;
      }

      await WorkflowRepository.updateWorkflowExecution(job.id, {
        status: 'failed',
        completedAt: new Date(),
        duration: Date.now() - startedAt,
        errorDetails: { error: errorMessage },
        metadata: failedMetadata,
      }, job.organizationId);

      console.error(`❌ Execution ${job.id} failed after ${nextRetryCount} attempts:`, errorMessage);
    }
  }
}

export const executionQueueService = ExecutionQueueService.getInstance();
