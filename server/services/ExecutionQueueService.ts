import { getErrorMessage } from '../types/common.js';
import { WorkflowRepository } from '../workflow/WorkflowRepository.js';
import { workflowRuntime } from '../core/WorkflowRuntime.js';
import { db, workflowExecutions } from '../database/schema.js';
import { and, eq, asc } from 'drizzle-orm';

type QueueRunRequest = {
  workflowId: string;
  userId?: string;
  triggerType?: string;
  triggerData?: Record<string, any> | null;
};

type QueueJob = {
  id: string;
  workflowId: string;
  userId?: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  createdAt: Date;
};

class ExecutionQueueService {
  private static instance: ExecutionQueueService;
  private running = 0;
  private concurrency: number;
  private pollingMs: number;
  private timer: NodeJS.Timeout | null = null;
  private pendingWake: NodeJS.Timeout | null = null;
  private readonly maxRetries: number;
  private readonly baseRetryDelayMs: number;
  private readonly maxRetryDelayMs: number;

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

  private computeBackoff(attempt: number): number {
    const exponent = Math.pow(2, Math.max(0, attempt - 1));
    const jitter = Math.floor(Math.random() * this.baseRetryDelayMs * 0.2);
    return Math.min(exponent * this.baseRetryDelayMs + jitter, this.maxRetryDelayMs);
  }

  private scheduleWake(delayMs: number): void {
    if (this.pendingWake) {
      clearTimeout(this.pendingWake);
      this.pendingWake = null;
    }

    const clamped = Math.min(Math.max(delayMs, 100), this.maxRetryDelayMs);
    this.pendingWake = setTimeout(() => {
      this.pendingWake = null;
      this.tick().catch((error) => {
        console.error('ExecutionQueue wake error:', getErrorMessage(error));
      });
    }, clamped);
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

  public async enqueue(req: QueueRunRequest): Promise<{ executionId: string }> {
    const execution = await WorkflowRepository.createWorkflowExecution({
      workflowId: req.workflowId,
      userId: req.userId,
      status: 'queued',
      triggerType: req.triggerType ?? 'manual',
      triggerData: req.triggerData ?? null,
      metadata: { queuedAt: new Date().toISOString(), retryCount: 0 },
    });
    return { executionId: execution.id };
  }

  public start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick().catch(() => {}), this.pollingMs);
    console.log(`🧵 ExecutionQueueService started (concurrency=${this.concurrency})`);
    this.tick().catch((error) => {
      console.error('ExecutionQueue initial tick error:', getErrorMessage(error));
    });
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.pendingWake) {
      clearTimeout(this.pendingWake);
      this.pendingWake = null;
    }
  }

  private async tick(): Promise<void> {
    try {
      while (this.running < this.concurrency) {
        const next = await this.claimNextQueued();
        if (!next) break;
        this.running++;
        this.process(next).finally(() => {
          this.running = Math.max(0, this.running - 1);
        });
      }
    } catch (error) {
      console.error('ExecutionQueue tick error:', getErrorMessage(error));
    }
  }

  private async claimNextQueued(): Promise<{ id: string; workflowId: string; userId?: string; metadata?: Record<string, any> } | null> {
    if (!this.isDbEnabled()) {
      // Memory mode: rely on WorkflowRepository to store an in-memory record; we cannot list queued ones.
      // For dev, skip DB claim and return null so queue is driven via direct enqueue->immediate run fallback.
      return null;
    }

    try {
      const candidates = await db
        .select({
          id: workflowExecutions.id,
          workflowId: workflowExecutions.workflowId,
          userId: workflowExecutions.userId,
          metadata: workflowExecutions.metadata,
        })
        .from(workflowExecutions)
        .where(eq(workflowExecutions.status, 'queued'))
        .orderBy(asc(workflowExecutions.startedAt))
        .limit(this.concurrency * 2);

      for (const candidate of candidates) {
        const metadata = (candidate.metadata ?? {}) as Record<string, any>;
        const nextRetryAt = typeof metadata.nextRetryAt === 'string' ? Date.parse(metadata.nextRetryAt) : NaN;
        if (!Number.isNaN(nextRetryAt) && nextRetryAt > Date.now()) {
          this.scheduleWake(nextRetryAt - Date.now());
          continue;
        }

        const sanitizedMetadata = { ...metadata };
        if ('nextRetryAt' in sanitizedMetadata) {
          delete sanitizedMetadata.nextRetryAt;
        }

        await db
          .update(workflowExecutions)
          .set({ status: 'running', startedAt: new Date(), metadata: sanitizedMetadata })
          .where(and(eq(workflowExecutions.id, candidate.id), eq(workflowExecutions.status, 'queued')));

        return {
          id: candidate.id,
          workflowId: candidate.workflowId,
          userId: candidate.userId,
          metadata: sanitizedMetadata,
        };
      }

      return null;
    } catch (error) {
      console.error('Failed to claim queued execution:', getErrorMessage(error));
      return null;
    }
  }

  private async process(job: { id: string; workflowId: string; userId?: string; metadata?: Record<string, any> }): Promise<void> {
    const startedAt = Date.now();
    const executionRecord = await WorkflowRepository.getExecutionById(job.id);
    const baseMetadata = { ...(executionRecord?.metadata ?? job.metadata ?? {}) } as Record<string, any>;
    try {
      const wf = await WorkflowRepository.getWorkflowById(job.workflowId);
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
      });
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
        });

        console.warn(
          `⚠️ Execution ${job.id} failed (attempt ${nextRetryCount}). Retrying in ${delay}ms: ${errorMessage}`
        );
        this.scheduleWake(delay);
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
      });

      console.error(`❌ Execution ${job.id} failed after ${nextRetryCount} attempts:`, errorMessage);
    }
  }
}

export const executionQueueService = ExecutionQueueService.getInstance();

