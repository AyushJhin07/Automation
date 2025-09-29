import { getErrorMessage } from '../types/common.js';
import { WorkflowRepository } from '../workflow/WorkflowRepository.js';
import { workflowRuntime } from '../core/WorkflowRuntime.js';
import { db, workflowExecutions } from '../database/schema.js';
import { and, eq } from 'drizzle-orm';

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

  private constructor(concurrency = 2, pollingMs = 1000) {
    this.concurrency = Math.max(1, concurrency);
    this.pollingMs = Math.max(250, pollingMs);
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
      metadata: { queuedAt: new Date().toISOString() },
    });
    return { executionId: execution.id };
  }

  public start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick().catch(() => {}), this.pollingMs);
    console.log(`🧵 ExecutionQueueService started (concurrency=${this.concurrency})`);
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
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

  private async claimNextQueued(): Promise<{ id: string; workflowId: string; userId?: string } | null> {
    if (!this.isDbEnabled()) {
      // Memory mode: rely on WorkflowRepository to store an in-memory record; we cannot list queued ones.
      // For dev, skip DB claim and return null so queue is driven via direct enqueue->immediate run fallback.
      return null;
    }

    try {
      const result = await db
        .select({ id: workflowExecutions.id, workflowId: workflowExecutions.workflowId, userId: workflowExecutions.userId })
        .from(workflowExecutions)
        .where(eq(workflowExecutions.status, 'queued'))
        .limit(1);

      const row = result[0];
      if (!row) return null;

      // Mark as running
      await db
        .update(workflowExecutions)
        .set({ status: 'running', startedAt: new Date() })
        .where(and(eq(workflowExecutions.id, row.id), eq(workflowExecutions.status, 'queued')));

      return row;
    } catch (error) {
      console.error('Failed to claim queued execution:', getErrorMessage(error));
      return null;
    }
  }

  private async process(job: { id: string; workflowId: string; userId?: string }): Promise<void> {
    const startedAt = Date.now();
    try {
      const wf = await WorkflowRepository.getWorkflowById(job.workflowId);
      if (!wf || !wf.graph) {
        throw new Error(`Workflow not found or missing graph: ${job.workflowId}`);
      }

      const initialData = { trigger: { id: 'queue', source: 'queue', timestamp: new Date().toISOString() } };
      const result = await workflowRuntime.executeWorkflow(wf.graph as any, initialData, job.userId);

      await WorkflowRepository.updateWorkflowExecution(job.id, {
        status: result.success ? 'completed' : 'failed',
        completedAt: new Date(),
        duration: Date.now() - startedAt,
        nodeResults: result.nodeOutputs,
        errorDetails: result.success ? null : { error: result.error || 'Execution failed' },
        metadata: { queued: true, finishedAt: new Date().toISOString() },
      });
    } catch (error: any) {
      await WorkflowRepository.updateWorkflowExecution(job.id, {
        status: 'failed',
        completedAt: new Date(),
        duration: Date.now() - startedAt,
        errorDetails: { error: getErrorMessage(error) },
      });
      console.error(`❌ Execution ${job.id} failed:`, getErrorMessage(error));
    }
  }
}

export const executionQueueService = ExecutionQueueService.getInstance();

