/**
 * RUN EXECUTION MANAGER - Comprehensive execution tracking and observability
 * Persists workflow executions to the database with secret redaction
 */

import { and, asc, desc, eq, gte, inArray, lt, lte, sql } from 'drizzle-orm';

import { NodeGraph, GraphNode } from '../../shared/nodeGraphSchema';
import type { WorkflowNodeMetadataSnapshot } from '../../shared/workflow/metadata';
import { db, executionLogs, nodeLogs } from '../database/schema.js';
import { sanitizeLogPayload, appendTimelineEvent } from '../utils/executionLogRedaction';
import { logAction } from '../utils/actionLog';
import { retryManager, CircuitBreakerSnapshot } from './RetryManager';

export interface NodeExecution {
  nodeId: string;
  nodeType: string;
  nodeLabel: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'retrying' | 'dlq';
  startTime: Date;
  endTime?: Date;
  duration?: number;
  attempt: number;
  maxAttempts: number;
  input?: any;
  output?: any;
  error?: string;
  correlationId: string;
  retryHistory: Array<{
    attempt: number;
    timestamp: Date;
    error?: string;
    duration: number;
  }>;
  metadata: {
    idempotencyKey?: string;
    cacheHit?: boolean;
    costUSD?: number;
    tokensUsed?: number;
    promptTokens?: number;
    completionTokens?: number;
    llmProvider?: string;
    llmModel?: string;
    cacheSavings?: {
      tokensSaved?: number;
      costSaved?: number;
      [key: string]: any;
    };
    httpStatusCode?: number;
    headers?: Record<string, string>;
    timeoutMs?: number;
    connectorId?: string;
    circuitState?: CircuitBreakerSnapshot;
    metadataSnapshots?: WorkflowNodeMetadataSnapshot[];
    [key: string]: any;
  };
}

export interface WorkflowExecution {
  executionId: string;
  workflowId: string;
  workflowName: string;
  userId?: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'partial' | 'waiting';
  startTime: Date;
  endTime?: Date;
  duration?: number;
  triggerType?: string;
  triggerData?: any;
  totalNodes: number;
  completedNodes: number;
  failedNodes: number;
  nodeExecutions: NodeExecution[];
  finalOutput?: any;
  error?: string;
  correlationId: string;
  tags: string[];
  metadata: {
    retryCount: number;
    totalCostUSD: number;
    totalTokensUsed: number;
    cacheHitRate: number;
    averageNodeDuration: number;
    openCircuitBreakers: Array<{
      nodeId: string;
      nodeLabel: string;
      connectorId?: string;
      state: CircuitBreakerSnapshot['state'];
      consecutiveFailures: number;
      openedAt?: Date;
      lastFailureAt?: Date;
      cooldownMs: number;
      failureThreshold: number;
    }>;
    nextResumeAt?: Date;
    waitReason?: string;
  };
}

export interface ExecutionQuery {
  executionId?: string;
  workflowId?: string;
  userId?: string;
  status?: string[];
  dateFrom?: Date;
  dateTo?: Date;
  tags?: string[];
  limit?: number;
  offset?: number;
  sortBy?: 'startTime' | 'duration' | 'status';
  sortOrder?: 'asc' | 'desc';
}

export interface NodeExecutionQueryOptions {
  limit?: number;
  offset?: number;
}

interface ExecutionQueryResult {
  executions: WorkflowExecution[];
  total: number;
  hasMore: boolean;
  limit: number;
  offset: number;
}

interface NodeExecutionQueryResult {
  nodes: NodeExecution[];
  total: number;
  hasMore: boolean;
  limit: number;
  offset: number;
}

type ExecutionLogRow = typeof executionLogs.$inferSelect;
type NodeLogRow = typeof nodeLogs.$inferSelect;

type ExecutionLogInsert = typeof executionLogs.$inferInsert;
type NodeLogInsert = typeof nodeLogs.$inferInsert;

interface ExecutionLogStore {
  startExecution(
    executionId: string,
    workflow: NodeGraph,
    userId?: string,
    triggerType?: string,
    triggerData?: any
  ): Promise<WorkflowExecution>;
  startNodeExecution(
    executionId: string,
    node: GraphNode,
    input?: any,
    options?: { timeoutMs?: number; connectorId?: string }
  ): Promise<NodeExecution>;
  completeNodeExecution(
    executionId: string,
    nodeId: string,
    output: any,
    metadata?: Partial<NodeExecution['metadata']>
  ): Promise<void>;
  failNodeExecution(
    executionId: string,
    nodeId: string,
    error: string,
    metadata?: Partial<NodeExecution['metadata']>
  ): Promise<void>;
  completeExecution(executionId: string, finalOutput?: any, error?: string): Promise<void>;
  markExecutionWaiting(executionId: string, reason?: string, resumeAt?: Date): Promise<void>;
  getExecution(executionId: string): Promise<WorkflowExecution | undefined>;
  queryExecutions(query?: ExecutionQuery): Promise<ExecutionQueryResult>;
  getNodeExecutions(executionId: string, options?: NodeExecutionQueryOptions): Promise<NodeExecutionQueryResult>;
  getExecutionsByCorrelation(correlationId: string): Promise<WorkflowExecution[]>;
  getExecutionStats(timeframe?: 'hour' | 'day' | 'week'): Promise<{
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    averageDuration: number;
    successRate: number;
    totalCost: number;
    popularWorkflows: Array<{ workflowId: string; count: number }>;
  }>;
  cleanup(maxAge?: number): Promise<void>;
}

const mergeNodeMetadata = (
  existing: NodeExecution['metadata'],
  updates: Partial<NodeExecution['metadata']> = {}
): NodeExecution['metadata'] => {
  const merged: NodeExecution['metadata'] = { ...existing, ...updates };
  if (updates.metadataSnapshots && updates.metadataSnapshots.length > 0) {
    merged.metadataSnapshots = [
      ...(existing.metadataSnapshots ?? []),
      ...updates.metadataSnapshots,
    ];
  }
  return merged;
};

const mergeMetadataForStorage = (
  existing: any,
  updates: Partial<NodeExecution['metadata']> = {}
): NodeExecution['metadata'] => {
  const base: NodeExecution['metadata'] = {
    ...(existing && typeof existing === 'object' ? (existing as Record<string, any>) : {}),
  } as NodeExecution['metadata'];
  return mergeNodeMetadata(base, updates);
};

const DEFAULT_METADATA_BASE: WorkflowExecution['metadata'] = {
  retryCount: 0,
  totalCostUSD: 0,
  totalTokensUsed: 0,
  cacheHitRate: 0,
  averageNodeDuration: 0,
  openCircuitBreakers: [],
};

function createDefaultMetadata(): WorkflowExecution['metadata'] {
  return {
    ...DEFAULT_METADATA_BASE,
    openCircuitBreakers: [],
  };
}

function generateCorrelationId(): string {
  return `corr_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

class InMemoryExecutionLogStore implements ExecutionLogStore {
  private readonly executions = new Map<string, WorkflowExecution>();
  private readonly nodeExecutions = new Map<string, NodeExecution[]>();
  private readonly correlationIndex = new Map<string, string[]>();

  async startExecution(
    executionId: string,
    workflow: NodeGraph,
    userId?: string,
    triggerType?: string,
    triggerData?: any
  ): Promise<WorkflowExecution> {
    const correlationId = generateCorrelationId();
    const execution: WorkflowExecution = {
      executionId,
      workflowId: workflow.id,
      workflowName: workflow.name,
      userId,
      status: 'pending',
      startTime: new Date(),
      triggerType,
      triggerData,
      totalNodes: workflow.nodes.length,
      completedNodes: 0,
      failedNodes: 0,
      nodeExecutions: [],
      correlationId,
      tags: workflow.tags || [],
      metadata: createDefaultMetadata(),
    };

    this.executions.set(executionId, execution);
    this.nodeExecutions.set(executionId, []);

    if (!this.correlationIndex.has(correlationId)) {
      this.correlationIndex.set(correlationId, []);
    }
    this.correlationIndex.get(correlationId)!.push(executionId);

    logAction({ type: 'execution_start', executionId, workflowId: workflow.id, correlationId });
    return execution;
  }

  async startNodeExecution(
    executionId: string,
    node: GraphNode,
    input?: any,
    options: { timeoutMs?: number; connectorId?: string } = {}
  ): Promise<NodeExecution> {
    const execution = this.executions.get(executionId);
    if (!execution) {
      throw new Error(`Execution ${executionId} not found`);
    }

    const connectorId = options.connectorId ?? this.resolveConnectorId(node);
    const circuitState = connectorId ? retryManager.getCircuitState(connectorId, node.id) : undefined;

    const nodeExecution: NodeExecution = {
      nodeId: node.id,
      nodeType: node.type,
      nodeLabel: node.data.label || node.id,
      status: 'running',
      startTime: new Date(),
      attempt: 1,
      maxAttempts: 3,
      input,
      correlationId: execution.correlationId,
      retryHistory: [],
      metadata: {
        timeoutMs: options.timeoutMs,
        connectorId,
        circuitState,
      },
    };

    const retryStatus = retryManager.getRetryStatus(executionId, node.id);
    if (retryStatus) {
      nodeExecution.attempt = retryStatus.attempts.length + 1;
      nodeExecution.maxAttempts = retryStatus.policy.maxAttempts;
      nodeExecution.metadata.idempotencyKey = retryStatus.idempotencyKey;
      nodeExecution.retryHistory = retryStatus.attempts.map((attempt) => ({
        attempt: attempt.attempt,
        timestamp: attempt.timestamp,
        error: attempt.error,
        duration: 0,
      }));
    }

    const nodeExecutions = this.nodeExecutions.get(executionId)!;
    nodeExecutions.push(nodeExecution);

    execution.status = 'running';

    return nodeExecution;
  }

  async completeNodeExecution(
    executionId: string,
    nodeId: string,
    output: any,
    metadata: Partial<NodeExecution['metadata']> = {}
  ): Promise<void> {
    const nodeExecution = this.findNodeExecution(executionId, nodeId);
    if (!nodeExecution) return;

    nodeExecution.status = 'succeeded';
    nodeExecution.endTime = new Date();
    nodeExecution.duration = nodeExecution.endTime.getTime() - nodeExecution.startTime.getTime();
    nodeExecution.output = output;
    nodeExecution.metadata = mergeNodeMetadata(nodeExecution.metadata, metadata);

    const execution = this.executions.get(executionId)!;
    execution.completedNodes++;
    this.updateWorkflowMetadata(execution);
  }

  async failNodeExecution(
    executionId: string,
    nodeId: string,
    error: string,
    metadata: Partial<NodeExecution['metadata']> = {}
  ): Promise<void> {
    const nodeExecution = this.findNodeExecution(executionId, nodeId);
    if (!nodeExecution) return;

    nodeExecution.status = 'failed';
    nodeExecution.endTime = new Date();
    nodeExecution.duration = nodeExecution.endTime.getTime() - nodeExecution.startTime.getTime();
    nodeExecution.error = error;
    nodeExecution.metadata = mergeNodeMetadata(nodeExecution.metadata, metadata);

    const execution = this.executions.get(executionId)!;
    execution.failedNodes++;
  }

  async completeExecution(executionId: string, finalOutput?: any, error?: string): Promise<void> {
    const execution = this.executions.get(executionId);
    if (!execution) return;

    execution.endTime = new Date();
    execution.duration = execution.endTime.getTime() - execution.startTime.getTime();
    execution.finalOutput = finalOutput;
    execution.error = error;

    if (error) {
      execution.status = 'failed';
    } else if (execution.failedNodes > 0) {
      execution.status = 'partial';
    } else {
      execution.status = 'succeeded';
    }

    this.updateWorkflowMetadata(execution);
    logAction({ type: 'execution_complete', executionId, status: execution.status });
  }

  async markExecutionWaiting(executionId: string, reason?: string, resumeAt?: Date): Promise<void> {
    const execution = this.executions.get(executionId);
    if (!execution) return;

    execution.status = 'waiting';
    if (resumeAt) {
      execution.metadata.nextResumeAt = resumeAt;
    }
    if (reason) {
      execution.metadata.waitReason = reason;
    }
  }

  async getExecution(executionId: string): Promise<WorkflowExecution | undefined> {
    const execution = this.executions.get(executionId);
    if (!execution) return undefined;
    execution.nodeExecutions = this.nodeExecutions.get(executionId) || [];
    return execution;
  }

  async queryExecutions(query: ExecutionQuery = {}): Promise<ExecutionQueryResult> {
    let executions = Array.from(this.executions.values());

    if (query.executionId) {
      executions = executions.filter((e) => e.executionId === query.executionId);
    }
    if (query.workflowId) {
      executions = executions.filter((e) => e.workflowId === query.workflowId);
    }
    if (query.userId) {
      executions = executions.filter((e) => e.userId === query.userId);
    }
    if (query.status && query.status.length > 0) {
      executions = executions.filter((e) => query.status!.includes(e.status));
    }
    if (query.dateFrom) {
      executions = executions.filter((e) => e.startTime >= query.dateFrom!);
    }
    if (query.dateTo) {
      executions = executions.filter((e) => e.startTime <= query.dateTo!);
    }
    if (query.tags && query.tags.length > 0) {
      executions = executions.filter((e) => query.tags!.some((tag) => e.tags.includes(tag)));
    }

    const sortBy = query.sortBy || 'startTime';
    const sortOrder = query.sortOrder || 'desc';
    executions.sort((a, b) => {
      let aVal: any;
      let bVal: any;
      switch (sortBy) {
        case 'duration':
          aVal = a.duration || 0;
          bVal = b.duration || 0;
          break;
        case 'status':
          aVal = a.status;
          bVal = b.status;
          break;
        case 'startTime':
        default:
          aVal = a.startTime.getTime();
          bVal = b.startTime.getTime();
      }

      if (sortOrder === 'asc') {
        return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      }
      return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
    });

    const total = executions.length;
    const limit = query.limit || 50;
    const offset = query.offset || 0;
    const paginatedExecutions = executions.slice(offset, offset + limit);

    paginatedExecutions.forEach((execution) => {
      execution.nodeExecutions = this.nodeExecutions.get(execution.executionId) || [];
    });

    return {
      executions: paginatedExecutions,
      total,
      hasMore: offset + limit < total,
      limit,
      offset,
    };
  }

  async getNodeExecutions(executionId: string, options: NodeExecutionQueryOptions = {}): Promise<NodeExecutionQueryResult> {
    const nodes = this.nodeExecutions.get(executionId) || [];
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;
    const slice = nodes.slice(offset, offset + limit);
    return {
      nodes: slice,
      total: nodes.length,
      hasMore: offset + limit < nodes.length,
      limit,
      offset,
    };
  }

  async getExecutionsByCorrelation(correlationId: string): Promise<WorkflowExecution[]> {
    const executionIds = this.correlationIndex.get(correlationId) || [];
    return executionIds.map((id) => this.executions.get(id)).filter(Boolean) as WorkflowExecution[];
  }

  async getExecutionStats(timeframe: 'hour' | 'day' | 'week' = 'day'): Promise<{
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    averageDuration: number;
    successRate: number;
    totalCost: number;
    popularWorkflows: Array<{ workflowId: string; count: number }>;
  }> {
    const now = new Date();
    const timeframeMs = {
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
    }[timeframe];

    const cutoff = new Date(now.getTime() - timeframeMs);
    const recentExecutions = Array.from(this.executions.values()).filter((e) => e.startTime >= cutoff);

    const successful = recentExecutions.filter((e) => e.status === 'succeeded');
    const failed = recentExecutions.filter((e) => e.status === 'failed');

    const totalDuration = recentExecutions
      .filter((e) => e.duration)
      .reduce((sum, e) => sum + e.duration!, 0);

    const totalCost = recentExecutions.reduce((sum, e) => sum + (e.metadata.totalCostUSD || 0), 0);

    const workflowCounts = new Map<string, number>();
    recentExecutions.forEach((e) => {
      workflowCounts.set(e.workflowId, (workflowCounts.get(e.workflowId) || 0) + 1);
    });

    const popularWorkflows = Array.from(workflowCounts.entries())
      .map(([workflowId, count]) => ({ workflowId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalExecutions: recentExecutions.length,
      successfulExecutions: successful.length,
      failedExecutions: failed.length,
      averageDuration: recentExecutions.length > 0 ? totalDuration / recentExecutions.length : 0,
      successRate: recentExecutions.length > 0 ? successful.length / recentExecutions.length : 0,
      totalCost,
      popularWorkflows,
    };
  }

  async cleanup(maxAge: number = 30 * 24 * 60 * 60 * 1000): Promise<void> {
    const cutoff = new Date(Date.now() - maxAge);
    for (const [executionId, execution] of this.executions.entries()) {
      if (execution.startTime < cutoff) {
        this.executions.delete(executionId);
        this.nodeExecutions.delete(executionId);

        const correlationExecutions = this.correlationIndex.get(execution.correlationId);
        if (correlationExecutions) {
          const index = correlationExecutions.indexOf(executionId);
          if (index > -1) {
            correlationExecutions.splice(index, 1);
          }
          if (correlationExecutions.length === 0) {
            this.correlationIndex.delete(execution.correlationId);
          }
        }
      }
    }
  }

  private findNodeExecution(executionId: string, nodeId: string): NodeExecution | undefined {
    const nodeExecutions = this.nodeExecutions.get(executionId);
    return nodeExecutions?.find((ne) => ne.nodeId === nodeId);
  }

  private resolveConnectorId(node: GraphNode): string | undefined {
    const data = node.data || {};
    const metadata = node.metadata || {};
    const candidates = [
      (data as any)?.connectorId,
      (metadata as any)?.connectorId,
      (data as any)?.provider,
      (data as any)?.appKey,
      (data as any)?.app,
      node.app,
      node.connectionId,
      (data as any)?.connectionId,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate.trim();
      }
    }

    if (typeof node.type === 'string') {
      const parts = node.type.split('.');
      if (parts.length >= 2) {
        const [category, connector] = parts;
        if (category === 'action' || category === 'trigger') {
          return connector;
        }
      }
    }

    return undefined;
  }

  private updateWorkflowMetadata(execution: WorkflowExecution): void {
    const nodeExecutions = this.nodeExecutions.get(execution.executionId) || [];

    execution.metadata.retryCount = nodeExecutions.reduce((sum, ne) => sum + ne.retryHistory.length, 0);
    execution.metadata.totalCostUSD = nodeExecutions.reduce((sum, ne) => sum + (ne.metadata.costUSD || 0), 0);
    execution.metadata.totalTokensUsed = nodeExecutions.reduce((sum, ne) => sum + (ne.metadata.tokensUsed || 0), 0);

    const cacheableNodes = nodeExecutions.filter((ne) => ne.metadata.idempotencyKey);
    const cacheHits = cacheableNodes.filter((ne) => ne.metadata.cacheHit);
    execution.metadata.cacheHitRate = cacheableNodes.length > 0 ? cacheHits.length / cacheableNodes.length : 0;

    const completedNodes = nodeExecutions.filter((ne) => ne.duration);
    execution.metadata.averageNodeDuration = completedNodes.length > 0
      ? completedNodes.reduce((sum, ne) => sum + ne.duration!, 0) / completedNodes.length
      : 0;

    const breakerDetails = nodeExecutions
      .map((ne) => {
        const state = ne.metadata.circuitState;
        if (!state) {
          return null;
        }
        if (state.state === 'open' || state.state === 'half_open') {
          return {
            nodeId: ne.nodeId,
            nodeLabel: ne.nodeLabel,
            connectorId: ne.metadata.connectorId,
            state: state.state,
            consecutiveFailures: state.consecutiveFailures,
            openedAt: state.openedAt,
            lastFailureAt: state.lastFailureAt,
            cooldownMs: state.cooldownMs,
            failureThreshold: state.failureThreshold,
          };
        }
        return null;
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

    execution.metadata.openCircuitBreakers = breakerDetails;
  }
}

class DatabaseExecutionLogStore implements ExecutionLogStore {
  constructor(private readonly dbProvider: () => typeof db) {}

  isAvailable(): boolean {
    return Boolean(this.dbProvider());
  }

  private getDb() {
    return this.dbProvider();
  }

  async startExecution(
    executionId: string,
    workflow: NodeGraph,
    userId?: string,
    triggerType?: string,
    triggerData?: any
  ): Promise<WorkflowExecution> {
    const correlationId = generateCorrelationId();
    const now = new Date();

    const execution: WorkflowExecution = {
      executionId,
      workflowId: workflow.id,
      workflowName: workflow.name,
      userId,
      status: 'pending',
      startTime: now,
      triggerType,
      triggerData: sanitizeLogPayload(triggerData),
      totalNodes: workflow.nodes.length,
      completedNodes: 0,
      failedNodes: 0,
      nodeExecutions: [],
      correlationId,
      tags: workflow.tags || [],
      metadata: createDefaultMetadata(),
    };

    const row: ExecutionLogInsert = {
      executionId,
      workflowId: workflow.id,
      workflowName: workflow.name,
      userId,
      status: 'pending',
      startTime: now,
      triggerType,
      triggerData: sanitizeLogPayload(triggerData),
      totalNodes: workflow.nodes.length,
      completedNodes: 0,
      failedNodes: 0,
      correlationId,
      tags: workflow.tags || [],
      metadata: this.serializeExecutionMetadata(execution.metadata),
      timeline: appendTimelineEvent([], {
        type: 'execution.start',
        timestamp: now.toISOString(),
      }),
      createdAt: now,
      updatedAt: now,
    };

    const database = this.getDb();
    if (database) {
      await database
        .insert(executionLogs)
        .values(row)
        .onConflictDoUpdate({
          target: executionLogs.executionId,
          set: {
            workflowId: row.workflowId,
            workflowName: row.workflowName,
            userId: row.userId,
            status: row.status,
            startTime: row.startTime,
            triggerType: row.triggerType,
            triggerData: row.triggerData,
            totalNodes: row.totalNodes,
            completedNodes: row.completedNodes,
            failedNodes: row.failedNodes,
            correlationId: row.correlationId,
            tags: row.tags,
            metadata: row.metadata,
            timeline: row.timeline,
            updatedAt: now,
          },
        });
    }

    logAction({ type: 'execution_start', executionId, workflowId: workflow.id, correlationId });
    return execution;
  }

  async startNodeExecution(
    executionId: string,
    node: GraphNode,
    input?: any,
    options: { timeoutMs?: number; connectorId?: string } = {}
  ): Promise<NodeExecution> {
    const database = this.getDb();
    if (!database) {
      throw new Error('Database client not available');
    }

    const executionRow = await this.getExecutionRow(executionId);
    if (!executionRow) {
      throw new Error(`Execution ${executionId} not found`);
    }

    const connectorId = options.connectorId ?? this.resolveConnectorId(node);
    const circuitState = connectorId ? retryManager.getCircuitState(connectorId, node.id) : undefined;

    const nodeExecution: NodeExecution = {
      nodeId: node.id,
      nodeType: node.type,
      nodeLabel: node.data.label || node.id,
      status: 'running',
      startTime: new Date(),
      attempt: 1,
      maxAttempts: 3,
      input,
      correlationId: executionRow.correlationId || generateCorrelationId(),
      retryHistory: [],
      metadata: {
        timeoutMs: options.timeoutMs,
        connectorId,
        circuitState,
      },
    };

    const retryStatus = retryManager.getRetryStatus(executionId, node.id);
    if (retryStatus) {
      nodeExecution.attempt = retryStatus.attempts.length + 1;
      nodeExecution.maxAttempts = retryStatus.policy.maxAttempts;
      nodeExecution.metadata.idempotencyKey = retryStatus.idempotencyKey;
      nodeExecution.retryHistory = retryStatus.attempts.map((attempt) => ({
        attempt: attempt.attempt,
        timestamp: attempt.timestamp,
        error: attempt.error,
        duration: 0,
      }));
    }

    const existing = await this.getNodeRow(executionId, node.id);
    const now = nodeExecution.startTime;

    const timelineEvent = {
      type: existing ? 'node.restart' : 'node.start',
      timestamp: now.toISOString(),
      status: 'running',
      attempt: nodeExecution.attempt,
    };

    const sanitizedMetadata = sanitizeLogPayload({
      timeoutMs: nodeExecution.metadata.timeoutMs,
      connectorId: nodeExecution.metadata.connectorId,
      circuitState: nodeExecution.metadata.circuitState,
      idempotencyKey: nodeExecution.metadata.idempotencyKey,
    });

    if (!existing) {
      const row: NodeLogInsert = {
        executionId,
        nodeId: node.id,
        nodeType: node.type,
        nodeLabel: node.data.label || node.id,
        status: 'running',
        attempt: nodeExecution.attempt,
        maxAttempts: nodeExecution.maxAttempts,
        startTime: now,
        input: sanitizeLogPayload(input),
        correlationId: nodeExecution.correlationId,
        retryHistory: sanitizeLogPayload(nodeExecution.retryHistory),
        metadata: sanitizedMetadata,
        timeline: appendTimelineEvent([], timelineEvent),
        createdAt: now,
        updatedAt: now,
      };

      await database.insert(nodeLogs).values(row);
    } else {
      const mergedMetadata = sanitizeLogPayload(
        mergeMetadataForStorage(existing.metadata, sanitizedMetadata as any)
      );

      const mergedTimeline = appendTimelineEvent(existing.timeline, timelineEvent);

      await database
        .update(nodeLogs)
        .set({
          status: 'running',
          attempt: nodeExecution.attempt,
          maxAttempts: nodeExecution.maxAttempts,
          startTime: now,
          endTime: null,
          durationMs: null,
          input: sanitizeLogPayload(input),
          output: null,
          error: null,
          metadata: mergedMetadata,
          retryHistory: sanitizeLogPayload(nodeExecution.retryHistory),
          timeline: mergedTimeline,
          updatedAt: now,
        })
        .where(and(eq(nodeLogs.executionId, executionId), eq(nodeLogs.nodeId, node.id)));
    }

    await database
      .update(executionLogs)
      .set({ status: 'running', updatedAt: now })
      .where(eq(executionLogs.executionId, executionId));

    await this.updateExecutionAggregates(executionId);

    return nodeExecution;
  }

  async completeNodeExecution(
    executionId: string,
    nodeId: string,
    output: any,
    metadata: Partial<NodeExecution['metadata']> = {}
  ): Promise<void> {
    const database = this.getDb();
    if (!database) return;

    const existing = await this.getNodeRow(executionId, nodeId);
    if (!existing) return;

    const endTime = new Date();
    const durationMs = existing.startTime ? endTime.getTime() - existing.startTime.getTime() : null;

    const mergedMetadata = sanitizeLogPayload(
      mergeMetadataForStorage(existing.metadata, metadata)
    );

    const timeline = appendTimelineEvent(existing.timeline, {
      type: 'node.complete',
      timestamp: endTime.toISOString(),
      status: 'succeeded',
      durationMs,
    });

    await database
      .update(nodeLogs)
      .set({
        status: 'succeeded',
        endTime,
        durationMs: durationMs ?? undefined,
        output: sanitizeLogPayload(output),
        metadata: mergedMetadata,
        timeline,
        updatedAt: endTime,
      })
      .where(and(eq(nodeLogs.executionId, executionId), eq(nodeLogs.nodeId, nodeId)));

    await this.updateExecutionAggregates(executionId);
  }

  async failNodeExecution(
    executionId: string,
    nodeId: string,
    error: string,
    metadata: Partial<NodeExecution['metadata']> = {}
  ): Promise<void> {
    const database = this.getDb();
    if (!database) return;

    const existing = await this.getNodeRow(executionId, nodeId);
    if (!existing) return;

    const endTime = new Date();
    const durationMs = existing.startTime ? endTime.getTime() - existing.startTime.getTime() : null;

    const mergedMetadata = sanitizeLogPayload(
      mergeMetadataForStorage(existing.metadata, metadata)
    );

    const timeline = appendTimelineEvent(existing.timeline, {
      type: 'node.fail',
      timestamp: endTime.toISOString(),
      status: 'failed',
      durationMs,
      error,
    });

    await database
      .update(nodeLogs)
      .set({
        status: 'failed',
        endTime,
        durationMs: durationMs ?? undefined,
        error,
        metadata: mergedMetadata,
        timeline,
        updatedAt: endTime,
      })
      .where(and(eq(nodeLogs.executionId, executionId), eq(nodeLogs.nodeId, nodeId)));

    await this.updateExecutionAggregates(executionId);
  }

  async completeExecution(executionId: string, finalOutput?: any, error?: string): Promise<void> {
    const database = this.getDb();
    if (!database) return;

    const nodes = await this.fetchNodeExecutions(executionId);
    const executionRow = await this.getExecutionRow(executionId);
    if (!executionRow) return;

    const now = new Date();
    const completedNodes = nodes.filter((node) => node.status === 'succeeded').length;
    const failedNodes = nodes.filter((node) => node.status === 'failed').length;
    const status = error ? 'failed' : failedNodes > 0 ? 'partial' : 'succeeded';
    const durationMs = executionRow.startTime
      ? now.getTime() - executionRow.startTime.getTime()
      : executionRow.durationMs ?? undefined;

    const metadata = this.buildExecutionMetadata(nodes, executionRow.metadata);

    const timeline = appendTimelineEvent(executionRow.timeline, {
      type: 'execution.complete',
      timestamp: now.toISOString(),
      status,
    });

    await database
      .update(executionLogs)
      .set({
        status,
        endTime: now,
        durationMs,
        finalOutput: sanitizeLogPayload(finalOutput),
        error: error ? String(error) : null,
        completedNodes,
        failedNodes,
        metadata: this.serializeExecutionMetadata(metadata),
        timeline,
        updatedAt: now,
      })
      .where(eq(executionLogs.executionId, executionId));
  }

  async markExecutionWaiting(executionId: string, reason?: string, resumeAt?: Date): Promise<void> {
    const database = this.getDb();
    if (!database) return;

    const executionRow = await this.getExecutionRow(executionId);
    if (!executionRow) return;

    const now = new Date();
    const existingMetadata = this.normalizeExecutionMetadata(executionRow.metadata);

    const metadata = {
      ...existingMetadata,
      nextResumeAt: resumeAt ?? existingMetadata.nextResumeAt,
      waitReason: reason ?? existingMetadata.waitReason,
    };

    const timeline = appendTimelineEvent(executionRow.timeline, {
      type: 'execution.wait',
      timestamp: now.toISOString(),
      reason,
      resumeAt: resumeAt ? resumeAt.toISOString() : undefined,
    });

    await database
      .update(executionLogs)
      .set({
        status: 'waiting',
        metadata: this.serializeExecutionMetadata(metadata),
        timeline,
        updatedAt: now,
      })
      .where(eq(executionLogs.executionId, executionId));

    await this.updateExecutionAggregates(executionId);
  }

  async getExecution(executionId: string): Promise<WorkflowExecution | undefined> {
    const database = this.getDb();
    if (!database) return undefined;

    const executionRow = await this.getExecutionRow(executionId);
    if (!executionRow) return undefined;

    const nodes = await this.fetchNodeExecutions(executionId);
    return this.mapExecutionRow(executionRow, nodes);
  }

  async queryExecutions(query: ExecutionQuery = {}): Promise<ExecutionQueryResult> {
    const database = this.getDb();
    if (!database) {
      return { executions: [], total: 0, hasMore: false, limit: query.limit ?? 50, offset: query.offset ?? 0 };
    }

    const conditions = [] as any[];
    if (query.executionId) {
      conditions.push(eq(executionLogs.executionId, query.executionId));
    }
    if (query.workflowId) {
      conditions.push(eq(executionLogs.workflowId, query.workflowId));
    }
    if (query.userId) {
      conditions.push(eq(executionLogs.userId, query.userId));
    }
    if (query.status && query.status.length > 0) {
      conditions.push(inArray(executionLogs.status, query.status));
    }
    if (query.dateFrom) {
      conditions.push(gte(executionLogs.startTime, query.dateFrom));
    }
    if (query.dateTo) {
      conditions.push(lte(executionLogs.startTime, query.dateTo));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const sortBy = query.sortBy || 'startTime';
    const sortOrder = query.sortOrder || 'desc';
    const sortColumn =
      sortBy === 'duration'
        ? executionLogs.durationMs
        : sortBy === 'status'
        ? executionLogs.status
        : executionLogs.startTime;

    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;

    const rows = await database
      .select()
      .from(executionLogs)
      .where(whereClause)
      .orderBy(sortOrder === 'asc' ? asc(sortColumn) : desc(sortColumn))
      .limit(limit)
      .offset(offset);

    const [{ value: total = 0 } = { value: 0 }] = await database
      .select({ value: sql<number>`count(*)` })
      .from(executionLogs)
      .where(whereClause)
      .limit(1);

    const executionIds = rows.map((row) => row.executionId);
    const nodeRows = executionIds.length
      ? await database
          .select()
          .from(nodeLogs)
          .where(inArray(nodeLogs.executionId, executionIds))
          .orderBy(asc(nodeLogs.startTime))
      : [];

    const nodeMap = new Map<string, NodeExecution[]>();
    for (const row of nodeRows) {
      const executionNodes = nodeMap.get(row.executionId) ?? [];
      executionNodes.push(this.mapNodeRow(row));
      nodeMap.set(row.executionId, executionNodes);
    }

    const executions = rows.map((row) => this.mapExecutionRow(row, nodeMap.get(row.executionId) ?? []));

    return {
      executions,
      total,
      hasMore: offset + limit < total,
      limit,
      offset,
    };
  }

  async getNodeExecutions(
    executionId: string,
    options: NodeExecutionQueryOptions = {}
  ): Promise<NodeExecutionQueryResult> {
    const database = this.getDb();
    if (!database) {
      return { nodes: [], total: 0, hasMore: false, limit: options.limit ?? 50, offset: options.offset ?? 0 };
    }

    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;

    const [{ value: total = 0 } = { value: 0 }] = await database
      .select({ value: sql<number>`count(*)` })
      .from(nodeLogs)
      .where(eq(nodeLogs.executionId, executionId))
      .limit(1);

    const rows = await database
      .select()
      .from(nodeLogs)
      .where(eq(nodeLogs.executionId, executionId))
      .orderBy(asc(nodeLogs.startTime))
      .limit(limit)
      .offset(offset);

    const nodes = rows.map((row) => this.mapNodeRow(row));

    return {
      nodes,
      total,
      hasMore: offset + limit < total,
      limit,
      offset,
    };
  }

  async getExecutionsByCorrelation(correlationId: string): Promise<WorkflowExecution[]> {
    const database = this.getDb();
    if (!database) return [];

    const rows = await database
      .select()
      .from(executionLogs)
      .where(eq(executionLogs.correlationId, correlationId))
      .orderBy(desc(executionLogs.startTime));

    const executionIds = rows.map((row) => row.executionId);
    const nodeRows = executionIds.length
      ? await database
          .select()
          .from(nodeLogs)
          .where(inArray(nodeLogs.executionId, executionIds))
          .orderBy(asc(nodeLogs.startTime))
      : [];

    const nodeMap = new Map<string, NodeExecution[]>();
    for (const row of nodeRows) {
      const executionNodes = nodeMap.get(row.executionId) ?? [];
      executionNodes.push(this.mapNodeRow(row));
      nodeMap.set(row.executionId, executionNodes);
    }

    return rows.map((row) => this.mapExecutionRow(row, nodeMap.get(row.executionId) ?? []));
  }

  async getExecutionStats(timeframe: 'hour' | 'day' | 'week' = 'day'): Promise<{
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    averageDuration: number;
    successRate: number;
    totalCost: number;
    popularWorkflows: Array<{ workflowId: string; count: number }>;
  }> {
    const database = this.getDb();
    if (!database) {
      return {
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        averageDuration: 0,
        successRate: 0,
        totalCost: 0,
        popularWorkflows: [],
      };
    }

    const timeframeMs = {
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
    }[timeframe];

    const cutoff = new Date(Date.now() - timeframeMs);

    const rows = await database
      .select()
      .from(executionLogs)
      .where(gte(executionLogs.startTime, cutoff));

    const totalExecutions = rows.length;
    const successfulExecutions = rows.filter((row) => row.status === 'succeeded').length;
    const failedExecutions = rows.filter((row) => row.status === 'failed').length;

    const totalDuration = rows.reduce((sum, row) => sum + (row.durationMs ?? 0), 0);

    const totalCost = rows.reduce((sum, row) => {
      const metadata = this.normalizeExecutionMetadata(row.metadata);
      return sum + (metadata.totalCostUSD || 0);
    }, 0);

    const workflowCounts = new Map<string, number>();
    rows.forEach((row) => {
      workflowCounts.set(row.workflowId, (workflowCounts.get(row.workflowId) || 0) + 1);
    });

    const popularWorkflows = Array.from(workflowCounts.entries())
      .map(([workflowId, count]) => ({ workflowId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalExecutions,
      successfulExecutions,
      failedExecutions,
      averageDuration: totalExecutions > 0 ? totalDuration / totalExecutions : 0,
      successRate: totalExecutions > 0 ? successfulExecutions / totalExecutions : 0,
      totalCost,
      popularWorkflows,
    };
  }

  async cleanup(maxAge: number = 30 * 24 * 60 * 60 * 1000): Promise<void> {
    const database = this.getDb();
    if (!database) return;

    const cutoff = new Date(Date.now() - maxAge);
    await database.delete(executionLogs).where(lt(executionLogs.startTime, cutoff));
  }

  private async updateExecutionAggregates(executionId: string): Promise<void> {
    const database = this.getDb();
    if (!database) return;

    const executionRow = await this.getExecutionRow(executionId);
    if (!executionRow) return;

    const nodes = await this.fetchNodeExecutions(executionId);

    const completedNodes = nodes.filter((node) => node.status === 'succeeded').length;
    const failedNodes = nodes.filter((node) => node.status === 'failed').length;
    const metadata = this.buildExecutionMetadata(nodes, executionRow.metadata);

    await database
      .update(executionLogs)
      .set({
        completedNodes,
        failedNodes,
        metadata: this.serializeExecutionMetadata(metadata),
        updatedAt: new Date(),
      })
      .where(eq(executionLogs.executionId, executionId));
  }

  private buildExecutionMetadata(
    nodes: NodeExecution[],
    existingMetadata: ExecutionLogRow['metadata']
  ): WorkflowExecution['metadata'] {
    const base = this.normalizeExecutionMetadata(existingMetadata);

    const retryCount = nodes.reduce((sum, node) => sum + node.retryHistory.length, 0);
    const totalCostUSD = nodes.reduce((sum, node) => sum + (node.metadata.costUSD || 0), 0);
    const totalTokensUsed = nodes.reduce((sum, node) => sum + (node.metadata.tokensUsed || 0), 0);

    const cacheableNodes = nodes.filter((node) => node.metadata.idempotencyKey);
    const cacheHits = cacheableNodes.filter((node) => node.metadata.cacheHit);
    const cacheHitRate = cacheableNodes.length > 0 ? cacheHits.length / cacheableNodes.length : 0;

    const durationValues = nodes.filter((node) => typeof node.duration === 'number');
    const averageNodeDuration =
      durationValues.length > 0
        ? durationValues.reduce((sum, node) => sum + (node.duration || 0), 0) / durationValues.length
        : 0;

    const openCircuitBreakers = nodes
      .map((node) => {
        const state = node.metadata.circuitState;
        if (!state) return null;
        if (state.state === 'open' || state.state === 'half_open') {
          return {
            nodeId: node.nodeId,
            nodeLabel: node.nodeLabel,
            connectorId: node.metadata.connectorId,
            state: state.state,
            consecutiveFailures: state.consecutiveFailures,
            openedAt: state.openedAt ? new Date(state.openedAt) : undefined,
            lastFailureAt: state.lastFailureAt ? new Date(state.lastFailureAt) : undefined,
            cooldownMs: state.cooldownMs,
            failureThreshold: state.failureThreshold,
          };
        }
        return null;
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

    return {
      ...base,
      retryCount,
      totalCostUSD,
      totalTokensUsed,
      cacheHitRate,
      averageNodeDuration,
      openCircuitBreakers,
    };
  }

  private serializeExecutionMetadata(metadata: WorkflowExecution['metadata']): any {
    const serialized = {
      ...metadata,
      nextResumeAt: metadata.nextResumeAt ? metadata.nextResumeAt.toISOString() : undefined,
      openCircuitBreakers: metadata.openCircuitBreakers.map((breaker) => ({
        ...breaker,
        openedAt: breaker.openedAt ? breaker.openedAt.toISOString() : undefined,
        lastFailureAt: breaker.lastFailureAt ? breaker.lastFailureAt.toISOString() : undefined,
      })),
    };

    return sanitizeLogPayload(serialized);
  }

  private normalizeExecutionMetadata(metadata: ExecutionLogRow['metadata']): WorkflowExecution['metadata'] {
    if (!metadata || typeof metadata !== 'object') {
      return createDefaultMetadata();
    }

    const nextResumeAt = metadata.nextResumeAt ? new Date(metadata.nextResumeAt as string) : undefined;
    const waitReason = metadata.waitReason as string | undefined;

    const openCircuitBreakers = Array.isArray(metadata.openCircuitBreakers)
      ? metadata.openCircuitBreakers.map((breaker: any) => ({
          nodeId: breaker.nodeId,
          nodeLabel: breaker.nodeLabel,
          connectorId: breaker.connectorId,
          state: breaker.state,
          consecutiveFailures: breaker.consecutiveFailures ?? 0,
          openedAt: breaker.openedAt ? new Date(breaker.openedAt) : undefined,
          lastFailureAt: breaker.lastFailureAt ? new Date(breaker.lastFailureAt) : undefined,
          cooldownMs: breaker.cooldownMs ?? 0,
          failureThreshold: breaker.failureThreshold ?? 0,
        }))
      : [];

    return {
      retryCount: metadata.retryCount ?? 0,
      totalCostUSD: metadata.totalCostUSD ?? 0,
      totalTokensUsed: metadata.totalTokensUsed ?? 0,
      cacheHitRate: metadata.cacheHitRate ?? 0,
      averageNodeDuration: metadata.averageNodeDuration ?? 0,
      openCircuitBreakers,
      nextResumeAt,
      waitReason,
    };
  }

  private async getExecutionRow(executionId: string): Promise<ExecutionLogRow | undefined> {
    const database = this.getDb();
    if (!database) return undefined;

    const rows = await database
      .select()
      .from(executionLogs)
      .where(eq(executionLogs.executionId, executionId))
      .limit(1);

    return rows[0];
  }

  private async getNodeRow(executionId: string, nodeId: string): Promise<NodeLogRow | undefined> {
    const database = this.getDb();
    if (!database) return undefined;

    const rows = await database
      .select()
      .from(nodeLogs)
      .where(and(eq(nodeLogs.executionId, executionId), eq(nodeLogs.nodeId, nodeId)))
      .limit(1);

    return rows[0];
  }

  private async fetchNodeExecutions(executionId: string): Promise<NodeExecution[]> {
    const database = this.getDb();
    if (!database) return [];

    const rows = await database
      .select()
      .from(nodeLogs)
      .where(eq(nodeLogs.executionId, executionId))
      .orderBy(asc(nodeLogs.startTime));

    return rows.map((row) => this.mapNodeRow(row));
  }

  private mapExecutionRow(row: ExecutionLogRow, nodes: NodeExecution[]): WorkflowExecution {
    const metadata = this.normalizeExecutionMetadata(row.metadata);

    return {
      executionId: row.executionId,
      workflowId: row.workflowId,
      workflowName: row.workflowName ?? row.workflowId,
      userId: row.userId ?? undefined,
      status: row.status as WorkflowExecution['status'],
      startTime: row.startTime ?? new Date(),
      endTime: row.endTime ?? undefined,
      duration: row.durationMs ?? undefined,
      triggerType: row.triggerType ?? undefined,
      triggerData: row.triggerData ?? undefined,
      totalNodes: row.totalNodes ?? nodes.length,
      completedNodes: row.completedNodes ?? nodes.filter((node) => node.status === 'succeeded').length,
      failedNodes: row.failedNodes ?? nodes.filter((node) => node.status === 'failed').length,
      nodeExecutions: nodes,
      finalOutput: row.finalOutput ?? undefined,
      error: row.error ?? undefined,
      correlationId: row.correlationId ?? '',
      tags: row.tags ?? [],
      metadata,
    };
  }

  private mapNodeRow(row: NodeLogRow): NodeExecution {
    const retryHistory = Array.isArray(row.retryHistory)
      ? row.retryHistory.map((attempt: any) => ({
          attempt: attempt.attempt ?? 0,
          timestamp: attempt.timestamp ? new Date(attempt.timestamp) : row.startTime,
          error: attempt.error ?? undefined,
          duration: attempt.duration ?? 0,
        }))
      : [];

    return {
      nodeId: row.nodeId,
      nodeType: row.nodeType ?? '',
      nodeLabel: row.nodeLabel ?? row.nodeId,
      status: row.status as NodeExecution['status'],
      startTime: row.startTime ?? new Date(),
      endTime: row.endTime ?? undefined,
      duration: row.durationMs ?? undefined,
      attempt: row.attempt ?? 1,
      maxAttempts: row.maxAttempts ?? 1,
      input: row.input ?? undefined,
      output: row.output ?? undefined,
      error: row.error ?? undefined,
      correlationId: row.correlationId ?? '',
      retryHistory,
      metadata: {
        ...(row.metadata || {}),
      },
    };
  }

  private resolveConnectorId(node: GraphNode): string | undefined {
    const data = node.data || {};
    const metadata = node.metadata || {};
    const candidates = [
      (data as any)?.connectorId,
      (metadata as any)?.connectorId,
      (data as any)?.provider,
      (data as any)?.appKey,
      (data as any)?.app,
      node.app,
      node.connectionId,
      (data as any)?.connectionId,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate.trim();
      }
    }

    if (typeof node.type === 'string') {
      const parts = node.type.split('.');
      if (parts.length >= 2) {
        const [category, connector] = parts;
        if (category === 'action' || category === 'trigger') {
          return connector;
        }
      }
    }

    return undefined;
  }
}

class RunExecutionManager {
  private readonly databaseStore = new DatabaseExecutionLogStore(() => db);
  private readonly memoryStore = new InMemoryExecutionLogStore();

  private get store(): ExecutionLogStore {
    return this.databaseStore.isAvailable() ? this.databaseStore : this.memoryStore;
  }

  async startExecution(
    executionId: string,
    workflow: NodeGraph,
    userId?: string,
    triggerType?: string,
    triggerData?: any
  ): Promise<WorkflowExecution> {
    return this.store.startExecution(executionId, workflow, userId, triggerType, triggerData);
  }

  async startNodeExecution(
    executionId: string,
    node: GraphNode,
    input?: any,
    options: { timeoutMs?: number; connectorId?: string } = {}
  ): Promise<NodeExecution> {
    return this.store.startNodeExecution(executionId, node, input, options);
  }

  async completeNodeExecution(
    executionId: string,
    nodeId: string,
    output: any,
    metadata: Partial<NodeExecution['metadata']> = {}
  ): Promise<void> {
    await this.store.completeNodeExecution(executionId, nodeId, output, metadata);
  }

  async failNodeExecution(
    executionId: string,
    nodeId: string,
    error: string,
    metadata: Partial<NodeExecution['metadata']> = {}
  ): Promise<void> {
    await this.store.failNodeExecution(executionId, nodeId, error, metadata);
  }

  async completeExecution(executionId: string, finalOutput?: any, error?: string): Promise<void> {
    await this.store.completeExecution(executionId, finalOutput, error);
  }

  async markExecutionWaiting(executionId: string, reason?: string, resumeAt?: Date): Promise<void> {
    await this.store.markExecutionWaiting(executionId, reason, resumeAt);
  }

  async getExecution(executionId: string): Promise<WorkflowExecution | undefined> {
    return this.store.getExecution(executionId);
  }

  async queryExecutions(query: ExecutionQuery = {}): Promise<ExecutionQueryResult> {
    return this.store.queryExecutions(query);
  }

  async getNodeExecutions(
    executionId: string,
    options: NodeExecutionQueryOptions = {}
  ): Promise<NodeExecutionQueryResult> {
    return this.store.getNodeExecutions(executionId, options);
  }

  async getExecutionsByCorrelation(correlationId: string): Promise<WorkflowExecution[]> {
    return this.store.getExecutionsByCorrelation(correlationId);
  }

  async getExecutionStats(timeframe: 'hour' | 'day' | 'week' = 'day') {
    return this.store.getExecutionStats(timeframe);
  }

  async cleanup(maxAge?: number): Promise<void> {
    await this.store.cleanup(maxAge);
  }
}

export const runExecutionManager = new RunExecutionManager();

setInterval(() => {
  runExecutionManager.cleanup().catch((error) => {
    console.error('Failed to cleanup execution logs', error);
  });
}, 2 * 60 * 60 * 1000);
