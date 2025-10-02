import { recordExecution } from './ExecutionAuditService.js';

type QueueEvent = {
  executionId: string;
  workflowId: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'retrying';
  durationMs?: number;
  retries?: number;
  delayMs?: number;
  error?: string;
  timestamp: string;
};

type NodeLogEntry = {
  executionId: string;
  nodeId: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  timestamp: string;
};

class ObservabilityService {
  private static instance: ObservabilityService;
  private readonly queueHistory: QueueEvent[] = [];
  private readonly nodeLogs: NodeLogEntry[] = [];
  private readonly queueStats = {
    started: 0,
    completed: 0,
    failed: 0,
    retries: 0,
    running: 0,
  };
  private readonly maxQueueHistory = 250;
  private readonly maxNodeLogs = 500;

  private constructor() {}

  static getInstance(): ObservabilityService {
    if (!ObservabilityService.instance) {
      ObservabilityService.instance = new ObservabilityService();
    }
    return ObservabilityService.instance;
  }

  recordQueueStart(executionId: string, workflowId: string): void {
    this.queueStats.started += 1;
    this.queueStats.running += 1;
    this.pushQueueEvent({
      executionId,
      workflowId,
      status: 'running',
      timestamp: new Date().toISOString(),
    });
  }

  recordQueueCompletion(
    executionId: string,
    workflowId: string,
    durationMs: number,
    nodeOutputs?: Record<string, any>
  ): void {
    this.queueStats.completed += 1;
    this.queueStats.running = Math.max(0, this.queueStats.running - 1);
    this.pushQueueEvent({
      executionId,
      workflowId,
      status: 'completed',
      durationMs,
      timestamp: new Date().toISOString(),
    });

    if (nodeOutputs) {
      this.recordNodeOutputs(executionId, nodeOutputs);
    }
  }

  recordQueueFailure(executionId: string, workflowId: string, durationMs: number, error: string): void {
    this.queueStats.failed += 1;
    this.queueStats.running = Math.max(0, this.queueStats.running - 1);
    this.pushQueueEvent({
      executionId,
      workflowId,
      status: 'failed',
      durationMs,
      error,
      timestamp: new Date().toISOString(),
    });
  }

  recordQueueRetry(
    executionId: string,
    workflowId: string,
    attempt: number,
    delayMs: number,
    error: string
  ): void {
    this.queueStats.retries += 1;
    this.pushQueueEvent({
      executionId,
      workflowId,
      status: 'retrying',
      retries: attempt,
      delayMs,
      error,
      timestamp: new Date().toISOString(),
    });
  }

  recordNodeOutputs(executionId: string, outputs: Record<string, any>): void {
    const timestamp = new Date().toISOString();
    Object.entries(outputs).forEach(([nodeId, payload]) => {
      const serialized = JSON.stringify(payload).slice(0, 500);
      this.pushNodeLog({
        executionId,
        nodeId,
        level: 'info',
        message: serialized,
        timestamp,
      });
    });
  }

  recordNodeError(executionId: string, nodeId: string, error: string): void {
    this.pushNodeLog({
      executionId,
      nodeId,
      level: 'error',
      message: error,
      timestamp: new Date().toISOString(),
    });
  }

  getQueueMetrics() {
    return {
      ...this.queueStats,
      history: [...this.queueHistory],
    };
  }

  getNodeLogSnapshot(limit = 100): NodeLogEntry[] {
    return this.nodeLogs.slice(-limit);
  }

  getSnapshot() {
    return {
      queue: this.getQueueMetrics(),
      nodeLogs: this.getNodeLogSnapshot(50),
    };
  }

  resetForTests(): void {
    this.queueHistory.length = 0;
    this.nodeLogs.length = 0;
    this.queueStats.started = 0;
    this.queueStats.completed = 0;
    this.queueStats.failed = 0;
    this.queueStats.retries = 0;
    this.queueStats.running = 0;
  }

  private pushQueueEvent(event: QueueEvent): void {
    this.queueHistory.push(event);
    if (this.queueHistory.length > this.maxQueueHistory) {
      this.queueHistory.splice(0, this.queueHistory.length - this.maxQueueHistory);
    }
  }

  private pushNodeLog(entry: NodeLogEntry): void {
    this.nodeLogs.push(entry);
    if (this.nodeLogs.length > this.maxNodeLogs) {
      this.nodeLogs.splice(0, this.nodeLogs.length - this.maxNodeLogs);
    }

    recordExecution({
      requestId: entry.executionId,
      appId: 'workflow',
      functionId: entry.nodeId,
      durationMs: 0,
      success: entry.level !== 'error',
      error: entry.level === 'error' ? entry.message : undefined,
      meta: { level: entry.level },
    });
  }
}

export const observabilityService = ObservabilityService.getInstance();
