import type { Job, Queue, QueueEvents, Worker } from 'bullmq';

import { getErrorMessage } from '../types/common.js';
import { WorkflowRepository } from '../workflow/WorkflowRepository.js';
import { workflowRuntime } from '../core/WorkflowRuntime.js';
import { db } from '../database/schema.js';
import {
  createQueue,
  createQueueEvents,
  createWorker,
  registerQueueTelemetry,
  type WorkflowExecuteJobPayload,
} from '../queue/BullMQFactory.js';

type QueueRunRequest = {
  workflowId: string;
  userId?: string;
  triggerType?: string;
  triggerData?: Record<string, any> | null;
  organizationId: string;
};

class ExecutionQueueService {
  private static instance: ExecutionQueueService;
  private readonly concurrency: number;
  private readonly maxRetries: number;
  private readonly baseRetryDelayMs: number;
  private readonly maxRetryDelayMs: number;
  private started = false;
  private shutdownPromise: Promise<void> | null = null;
  private queue: Queue<WorkflowExecuteJobPayload, unknown, 'workflow.execute'> | null = null;
  private worker: Worker<WorkflowExecuteJobPayload, unknown, 'workflow.execute'> | null = null;
  private queueEvents: QueueEvents | null = null;
  private telemetryCleanup: (() => void) | null = null;

  private constructor(concurrency = 2) {
    this.concurrency = Math.max(1, concurrency);
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
      metadata: { queuedAt: new Date().toISOString(), attemptsMade: 0, retryCount: 0 },
    });

    if (!this.isDbEnabled()) {
      return { executionId: execution.id };
    }

    const queue = this.ensureQueue();
    try {
      await queue.add(
        'workflow.execute',
        {
          executionId: execution.id,
          workflowId: req.workflowId,
          organizationId: req.organizationId,
          userId: req.userId,
          triggerType: req.triggerType ?? 'manual',
          triggerData: req.triggerData ?? null,
        },
        {
          jobId: execution.id,
        }
      );
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      console.error('Failed to enqueue workflow execution job:', errorMessage);
      await WorkflowRepository.updateWorkflowExecution(
        execution.id,
        {
          status: 'failed',
          completedAt: new Date(),
          duration: 0,
          errorDetails: { error: errorMessage },
        },
        req.organizationId
      );
      throw error;
    }

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

    const queue = this.ensureQueue();
    if (!this.queueEvents) {
      this.queueEvents = createQueueEvents('workflow.execute');
    }

    if (!this.telemetryCleanup) {
      this.telemetryCleanup = registerQueueTelemetry(queue, this.queueEvents, {
        logger: console,
      });
    }

    this.worker = createWorker(
      'workflow.execute',
      async (job) => this.process(job),
      {
        concurrency: this.concurrency,
        settings: {
          backoffStrategies: {
            'execution-backoff': (attemptsMade: number) => this.computeBackoff(Math.max(1, attemptsMade)),
          },
        },
      }
    );

    this.worker.on('error', (error) => {
      console.error('ExecutionQueue worker error:', getErrorMessage(error));
    });

    this.started = true;

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

      this.started = false;
      this.shutdownPromise = null;
    })();

    return this.shutdownPromise;
  }

  private ensureQueue(): Queue<WorkflowExecuteJobPayload, unknown, 'workflow.execute'> {
    if (!this.queue) {
      this.queue = createQueue('workflow.execute', {
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
    }

    return this.queue;
  }

  private async process(job: Job<WorkflowExecuteJobPayload>): Promise<void> {
    const startedAt = Date.now();
    const { executionId, workflowId, organizationId, userId } = job.data;
    const executionRecord = await WorkflowRepository.getExecutionById(executionId, organizationId);
    const baseMetadata = {
      ...(executionRecord?.metadata ?? {}),
    } as Record<string, any>;
    const attemptNumber = job.attemptsMade + 1;
    const maxAttempts = job.opts.attempts ?? this.maxRetries + 1;

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

    try {
      const wf = await WorkflowRepository.getWorkflowById(workflowId, organizationId);
      if (!wf || !wf.graph) {
        throw new Error(`Workflow not found or missing graph: ${workflowId}`);
      }

      const initialData = { trigger: { id: 'queue', source: 'queue', timestamp: new Date().toISOString() } };
      const result = await workflowRuntime.executeWorkflow(wf.graph as any, initialData, userId);

      if (!result.success) {
        throw new Error(result.error || 'Execution returned unsuccessful result');
      }

      const metadata = {
        ...runningMetadata,
        finishedAt: new Date().toISOString(),
        retryCount: Math.max(0, attemptNumber - 1),
      } as Record<string, any>;
      delete metadata.lastError;

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
      if ('finishedAt' in failureMetadata) {
        delete failureMetadata.finishedAt;
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
    }
  }
}

export const executionQueueService = ExecutionQueueService.getInstance();
