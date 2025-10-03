/**
 * RUN EXECUTION MANAGER - Comprehensive execution tracking and observability
 * Tracks workflow executions with detailed timeline, inputs/outputs, and debugging info
 */

import { NodeGraph, GraphNode } from '../../shared/nodeGraphSchema';
import { retryManager, CircuitBreakerSnapshot } from './RetryManager';
import { db, executionLogs, nodeLogs } from '../database/schema.js';
import { isDatabaseAvailable } from '../database/status.js';
import {
  sanitizeExecutionPayload,
  createTimelineEvent,
  TimelineEvent,
} from '../utils/executionRedaction';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  lte,
  lt,
  sql,
} from 'drizzle-orm';

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
    httpStatusCode?: number;
    headers?: Record<string, string>;
    timeoutMs?: number;
    connectorId?: string;
    circuitState?: CircuitBreakerSnapshot;
  };
  timeline: TimelineEvent[];
}

export interface WorkflowExecution {
  executionId: string;
  workflowId: string;
  workflowName: string;
  organizationId?: string;
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
  timeline: TimelineEvent[];
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

type ExecutionLogRow = typeof executionLogs.$inferSelect;
type NodeLogRow = typeof nodeLogs.$inferSelect;

class RunExecutionManager {
  private executions = new Map<string, WorkflowExecution>();
  private nodeExecutions = new Map<string, NodeExecution[]>(); // executionId -> NodeExecution[]
  private correlationIndex = new Map<string, string[]>(); // correlationId -> executionIds[]
  private executionLogIdCache = new Map<string, string | null>();

  /**
   * Start tracking a new workflow execution
   */
  startExecution(
    executionId: string,
    workflow: NodeGraph,
    userId?: string,
    triggerType?: string,
    triggerData?: any,
    organizationId?: string
  ): WorkflowExecution {
    const correlationId = this.generateCorrelationId();

    const execution: WorkflowExecution = {
      executionId,
      workflowId: workflow.id,
      workflowName: workflow.name,
      organizationId,
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
      timeline: [
        createTimelineEvent('execution_started', {
          workflowId: workflow.id,
          workflowName: workflow.name,
          triggerType,
          userId,
        }),
      ],
      metadata: {
        retryCount: 0,
        totalCostUSD: 0,
        totalTokensUsed: 0,
        cacheHitRate: 0,
        averageNodeDuration: 0,
        openCircuitBreakers: []
      }
    };

    this.executions.set(executionId, execution);
    this.nodeExecutions.set(executionId, []);
    void this.persistExecutionSnapshot(execution).catch(error => {
      console.error('Failed to persist execution start', error);
    });
    
    // Index by correlation ID
    if (!this.correlationIndex.has(correlationId)) {
      this.correlationIndex.set(correlationId, []);
    }
    this.correlationIndex.get(correlationId)!.push(executionId);

    console.log(`📊 Started tracking execution ${executionId} with correlation ${correlationId}`);
    return execution;
  }

  /**
   * Start tracking a node execution
   */
  startNodeExecution(
    executionId: string,
    node: GraphNode,
    input?: any,
    options: { timeoutMs?: number; connectorId?: string } = {}
  ): NodeExecution {
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
      maxAttempts: 3, // Will be updated based on retry policy
      input,
      correlationId: execution.correlationId,
      retryHistory: [],
      metadata: {
        timeoutMs: options.timeoutMs,
        connectorId,
        circuitState,
      },
      timeline: [
        createTimelineEvent('node_started', {
          nodeId: node.id,
          nodeLabel: node.data.label || node.id,
          attempt: 1,
          connectorId,
        }),
      ],
    };

    // Get retry info from retry manager
    const retryStatus = retryManager.getRetryStatus(executionId, node.id);
    if (retryStatus) {
      nodeExecution.attempt = retryStatus.attempts.length + 1;
      nodeExecution.maxAttempts = retryStatus.policy.maxAttempts;
      nodeExecution.metadata.idempotencyKey = retryStatus.idempotencyKey;

      // Build retry history
      nodeExecution.retryHistory = retryStatus.attempts.map(attempt => ({
        attempt: attempt.attempt,
        timestamp: attempt.timestamp,
        error: attempt.error,
        duration: 0 // We don't track individual attempt duration yet
      }));
    }

    nodeExecution.timeline[0] = createTimelineEvent('node_started', {
      nodeId: node.id,
      nodeLabel: nodeExecution.nodeLabel,
      attempt: nodeExecution.attempt,
      connectorId,
    });

    const nodeExecutions = this.nodeExecutions.get(executionId)!;
    nodeExecutions.push(nodeExecution);

    // Update workflow status
    execution.status = 'running';
    execution.timeline.push(
      createTimelineEvent('node_started', {
        nodeId: node.id,
        nodeLabel: node.data.label || node.id,
        attempt: nodeExecution.attempt,
      })
    );

    void this.persistExecutionSnapshot(execution).catch(error => {
      console.error('Failed to persist execution update', error);
    });
    void this.persistNodeSnapshot(execution.executionId, nodeExecution).catch(error => {
      console.error(`Failed to persist node start for ${node.id}`, error);
    });

    console.log(`🔍 Started node execution: ${node.id} (${node.type})`);
    return nodeExecution;
  }

  /**
   * Complete a node execution successfully
   */
  completeNodeExecution(
    executionId: string,
    nodeId: string,
    output: any,
    metadata: Partial<NodeExecution['metadata']> = {}
  ): void {
    const nodeExecution = this.findNodeExecution(executionId, nodeId);
    if (!nodeExecution) return;

    nodeExecution.status = 'succeeded';
    nodeExecution.endTime = new Date();
    nodeExecution.duration = nodeExecution.endTime.getTime() - nodeExecution.startTime.getTime();
    nodeExecution.output = output;
    nodeExecution.metadata = { ...nodeExecution.metadata, ...metadata };
    nodeExecution.timeline.push(
      createTimelineEvent('node_completed', {
        nodeId,
        duration: nodeExecution.duration,
        status: 'succeeded',
        attempt: nodeExecution.attempt,
      })
    );

    // Update workflow progress
    const execution = this.executions.get(executionId)!;
    execution.completedNodes++;
    execution.timeline.push(
      createTimelineEvent('node_completed', {
        nodeId,
        duration: nodeExecution.duration,
        status: 'succeeded',
        attempt: nodeExecution.attempt,
      })
    );

    // Update workflow metadata
    this.updateWorkflowMetadata(execution);

    void this.persistNodeSnapshot(executionId, nodeExecution).catch(error => {
      console.error(`Failed to persist node completion for ${nodeId}`, error);
    });
    void this.persistExecutionSnapshot(execution).catch(error => {
      console.error('Failed to persist execution after node completion', error);
    });

    console.log(`✅ Completed node execution: ${nodeId} in ${nodeExecution.duration}ms`);
  }

  /**
   * Fail a node execution
   */
  failNodeExecution(
    executionId: string,
    nodeId: string,
    error: string,
    metadata: Partial<NodeExecution['metadata']> = {}
  ): void {
    const nodeExecution = this.findNodeExecution(executionId, nodeId);
    if (!nodeExecution) return;

    nodeExecution.status = 'failed';
    nodeExecution.endTime = new Date();
    nodeExecution.duration = nodeExecution.endTime.getTime() - nodeExecution.startTime.getTime();
    nodeExecution.error = error;
    nodeExecution.metadata = { ...nodeExecution.metadata, ...metadata };
    nodeExecution.timeline.push(
      createTimelineEvent('node_failed', {
        nodeId,
        error,
        duration: nodeExecution.duration,
        attempt: nodeExecution.attempt,
      })
    );

    // Update workflow progress
    const execution = this.executions.get(executionId)!;
    execution.failedNodes++;
    execution.timeline.push(
      createTimelineEvent('node_failed', {
        nodeId,
        error,
        attempt: nodeExecution.attempt,
      })
    );

    void this.persistNodeSnapshot(executionId, nodeExecution).catch(nodeError => {
      console.error(`Failed to persist node failure for ${nodeId}`, nodeError);
    });
    void this.persistExecutionSnapshot(execution).catch(execError => {
      console.error('Failed to persist execution after node failure', execError);
    });

    console.error(`❌ Failed node execution: ${nodeId} - ${error}`);
  }

  /**
   * Complete a workflow execution
   */
  completeExecution(executionId: string, finalOutput?: any, error?: string): void {
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

    // Final metadata update
    this.updateWorkflowMetadata(execution);
    execution.timeline.push(
      createTimelineEvent('execution_completed', {
        status: execution.status,
        duration: execution.duration,
        error,
      })
    );

    void this.persistExecutionSnapshot(execution).catch(persistError => {
      console.error('Failed to persist completed execution', persistError);
    });

    console.log(`🏁 Completed execution ${executionId}: ${execution.status} in ${execution.duration}ms`);
  }

  /**
   * Mark execution as waiting for external signal
   */
  markExecutionWaiting(executionId: string, reason?: string, resumeAt?: Date): void {
    const execution = this.executions.get(executionId);
    if (!execution) {
      return;
    }

    execution.status = 'waiting';
    if (resumeAt) {
      execution.metadata.nextResumeAt = resumeAt;
    }
    if (reason) {
      execution.metadata.waitReason = reason;
    }

    execution.timeline.push(
      createTimelineEvent('execution_waiting', {
        reason,
        resumeAt: resumeAt?.toISOString(),
      })
    );

    void this.persistExecutionSnapshot(execution).catch(error => {
      console.error('Failed to persist waiting execution', error);
    });

    console.log(
      `⏸️ Execution ${executionId} paused${resumeAt ? ` until ${resumeAt.toISOString()}` : ''}${reason ? ` (${reason})` : ''}`
    );
  }

  /**
   * Get execution by ID with full details
   */
  async getExecution(executionId: string): Promise<WorkflowExecution | undefined> {
    if (this.shouldUseDatabase() && db) {
      const execution = await this.loadExecutionFromDatabase(executionId);
      if (execution) {
        return execution;
      }
    }

    return this.getExecutionFromMemory(executionId);
  }

  /**
   * Query executions with filtering and pagination
   */
  async queryExecutions(query: ExecutionQuery = {}): Promise<{
    executions: WorkflowExecution[];
    total: number;
    hasMore: boolean;
  }> {
    if (this.shouldUseDatabase() && db) {
      return this.queryExecutionsFromDatabase(query);
    }

    return this.queryExecutionsFromMemory(query);
  }

  /**
   * Get executions by correlation ID
   */
  async getExecutionsByCorrelation(correlationId: string): Promise<WorkflowExecution[]> {
    if (this.shouldUseDatabase() && db) {
      const rows = await db
        .select()
        .from(executionLogs)
        .where(eq(executionLogs.correlationId, correlationId))
        .orderBy(desc(executionLogs.startedAt));

      if (rows.length === 0) {
        return [];
      }

      const nodeMap = await this.fetchNodeLogs(rows.map(row => row.executionId));
      return rows.map(row => this.mapExecutionRow(row, nodeMap.get(row.executionId) ?? []));
    }

    const executionIds = this.correlationIndex.get(correlationId) || [];
    return executionIds
      .map(id => this.getExecutionFromMemory(id))
      .filter((value): value is WorkflowExecution => Boolean(value));
  }

  /**
   * Get execution statistics
   */
  async getExecutionStats(timeframe: 'hour' | 'day' | 'week' = 'day'): Promise<{
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    averageDuration: number;
    successRate: number;
    totalCost: number;
    popularWorkflows: Array<{ workflowId: string; count: number }>;
  }> {
    if (this.shouldUseDatabase() && db) {
      return this.getExecutionStatsFromDatabase(timeframe);
    }

    return this.getExecutionStatsFromMemory(timeframe);
  }

  /**
   * Clean up old executions
   */
  async cleanup(maxAge: number = 30 * 24 * 60 * 60 * 1000): Promise<void> { // 30 days default
    const cutoff = new Date(Date.now() - maxAge);

    if (this.shouldUseDatabase() && db) {
      try {
        await db.delete(nodeLogs).where(lt(nodeLogs.startedAt, cutoff));
        await db.delete(executionLogs).where(lt(executionLogs.startedAt, cutoff));
      } catch (error) {
        console.error('Failed to clean up execution logs from database', error);
      }
    }

    let cleanedCount = 0;

    for (const [executionId, execution] of this.executions.entries()) {
      if (execution.startTime < cutoff) {
        this.executions.delete(executionId);
        this.nodeExecutions.delete(executionId);
        this.executionLogIdCache.delete(executionId);

        // Clean up correlation index
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

        cleanedCount++;
      }
    }

    console.log(`🧹 Cleaned up ${cleanedCount} old executions`);
  }

  // Private helper methods
  private shouldUseDatabase(): boolean {
    return Boolean(db) && isDatabaseAvailable();
  }

  private getExecutionFromMemory(executionId: string): WorkflowExecution | undefined {
    const execution = this.executions.get(executionId);
    if (!execution) {
      return undefined;
    }

    execution.nodeExecutions = this.nodeExecutions.get(executionId) || [];
    return execution;
  }

  private queryExecutionsFromMemory(query: ExecutionQuery): {
    executions: WorkflowExecution[];
    total: number;
    hasMore: boolean;
  } {
    let executions = Array.from(this.executions.values());

    if (query.executionId) {
      executions = executions.filter(e => e.executionId === query.executionId);
    }
    if (query.workflowId) {
      executions = executions.filter(e => e.workflowId === query.workflowId);
    }
    if (query.userId) {
      executions = executions.filter(e => e.userId === query.userId);
    }
    if (query.status && query.status.length > 0) {
      executions = executions.filter(e => query.status!.includes(e.status));
    }
    if (query.dateFrom) {
      executions = executions.filter(e => e.startTime >= query.dateFrom);
    }
    if (query.dateTo) {
      executions = executions.filter(e => e.startTime <= query.dateTo);
    }
    if (query.tags && query.tags.length > 0) {
      executions = executions.filter(e => query.tags!.some(tag => e.tags.includes(tag)));
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
          break;
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

    paginatedExecutions.forEach(execution => {
      execution.nodeExecutions = this.nodeExecutions.get(execution.executionId) || [];
    });

    return {
      executions: paginatedExecutions,
      total,
      hasMore: offset + limit < total,
    };
  }

  private getExecutionStatsFromMemory(timeframe: 'hour' | 'day' | 'week'): {
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    averageDuration: number;
    successRate: number;
    totalCost: number;
    popularWorkflows: Array<{ workflowId: string; count: number }>;
  } {
    const now = new Date();
    const timeframeMs = {
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
    }[timeframe];

    const cutoff = new Date(now.getTime() - timeframeMs);
    const recentExecutions = Array.from(this.executions.values()).filter(e => e.startTime >= cutoff);

    const successful = recentExecutions.filter(e => e.status === 'succeeded');
    const failed = recentExecutions.filter(e => e.status === 'failed');
    const totalDuration = recentExecutions.reduce((sum, e) => sum + (e.duration || 0), 0);
    const totalCost = recentExecutions.reduce((sum, e) => sum + (e.metadata.totalCostUSD || 0), 0);

    const workflowCounts = new Map<string, number>();
    recentExecutions.forEach(e => {
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

  private async queryExecutionsFromDatabase(query: ExecutionQuery): Promise<{
    executions: WorkflowExecution[];
    total: number;
    hasMore: boolean;
  }> {
    if (!this.shouldUseDatabase() || !db) {
      return this.queryExecutionsFromMemory(query);
    }

    const filters: any[] = [];
    if (query.executionId) {
      filters.push(eq(executionLogs.executionId, query.executionId));
    }
    if (query.workflowId) {
      filters.push(eq(executionLogs.workflowId, query.workflowId));
    }
    if (query.userId) {
      filters.push(eq(executionLogs.userId, query.userId));
    }
    if (query.status && query.status.length > 0) {
      filters.push(inArray(executionLogs.status, query.status));
    }
    if (query.dateFrom) {
      filters.push(gte(executionLogs.startedAt, query.dateFrom));
    }
    if (query.dateTo) {
      filters.push(lte(executionLogs.startedAt, query.dateTo));
    }
    if (query.tags && query.tags.length > 0) {
      const tagsArray = sql.join(query.tags.map(tag => sql`${tag}`), sql`, `);
      filters.push(sql`${executionLogs.tags} && ARRAY[${tagsArray}]::text[]`);
    }

    const whereClause = filters.length > 0 ? and(...filters) : undefined;

    const sortBy = query.sortBy || 'startTime';
    const sortOrder = query.sortOrder || 'desc';
    const orderExpression = (() => {
      switch (sortBy) {
        case 'duration':
          return sortOrder === 'asc' ? asc(executionLogs.durationMs) : desc(executionLogs.durationMs);
        case 'status':
          return sortOrder === 'asc' ? asc(executionLogs.status) : desc(executionLogs.status);
        case 'startTime':
        default:
          return sortOrder === 'asc' ? asc(executionLogs.startedAt) : desc(executionLogs.startedAt);
      }
    })();

    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;

    let selectQuery = db.select().from(executionLogs);
    if (whereClause) {
      selectQuery = selectQuery.where(whereClause);
    }
    const rows = await selectQuery.orderBy(orderExpression).limit(limit).offset(offset);

    let countQuery = db.select({ count: count(executionLogs.id) }).from(executionLogs);
    if (whereClause) {
      countQuery = countQuery.where(whereClause);
    }
    const totalResult = await countQuery;
    const total = Number(totalResult[0]?.count ?? 0);

    const nodeMap = await this.fetchNodeLogs(rows.map(row => row.executionId));
    const executions = rows.map(row => this.mapExecutionRow(row, nodeMap.get(row.executionId) ?? []));

    return {
      executions,
      total,
      hasMore: offset + limit < total,
    };
  }

  private async getExecutionStatsFromDatabase(timeframe: 'hour' | 'day' | 'week') {
    if (!this.shouldUseDatabase() || !db) {
      return this.getExecutionStatsFromMemory(timeframe);
    }

    const timeframeMs = {
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
    }[timeframe];

    const cutoff = new Date(Date.now() - timeframeMs);
    const rows = await db
      .select({
        executionId: executionLogs.executionId,
        status: executionLogs.status,
        duration: executionLogs.durationMs,
        metadata: executionLogs.metadata,
        workflowId: executionLogs.workflowId,
      })
      .from(executionLogs)
      .where(gte(executionLogs.startedAt, cutoff));

    const totalExecutions = rows.length;
    const successfulExecutions = rows.filter(row => row.status === 'succeeded').length;
    const failedExecutions = rows.filter(row => row.status === 'failed').length;
    const totalDuration = rows.reduce((sum, row) => sum + (row.duration ?? 0), 0);
    const totalCost = rows.reduce((sum, row) => {
      const metadata = (row.metadata as Record<string, any>) ?? {};
      const value = typeof metadata.totalCostUSD === 'number' ? metadata.totalCostUSD : Number(metadata.totalCostUSD ?? 0);
      return sum + (Number.isFinite(value) ? value : 0);
    }, 0);

    const workflowCounts = new Map<string, number>();
    rows.forEach(row => {
      if (row.workflowId) {
        workflowCounts.set(row.workflowId, (workflowCounts.get(row.workflowId) || 0) + 1);
      }
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

  private async loadExecutionFromDatabase(executionId: string): Promise<WorkflowExecution | undefined> {
    if (!this.shouldUseDatabase() || !db) {
      return undefined;
    }

    const rows = await db
      .select()
      .from(executionLogs)
      .where(eq(executionLogs.executionId, executionId))
      .limit(1);

    const row = rows[0];
    if (!row) {
      return undefined;
    }

    const nodeMap = await this.fetchNodeLogs([executionId]);
    return this.mapExecutionRow(row, nodeMap.get(executionId) ?? []);
  }

  private async fetchNodeLogs(executionIds: string[]): Promise<Map<string, NodeLogRow[]>> {
    const map = new Map<string, NodeLogRow[]>();
    if (!this.shouldUseDatabase() || !db || executionIds.length === 0) {
      return map;
    }

    const rows = await db
      .select()
      .from(nodeLogs)
      .where(inArray(nodeLogs.executionId, executionIds))
      .orderBy(asc(nodeLogs.startedAt), asc(nodeLogs.attempt));

    for (const row of rows) {
      const list = map.get(row.executionId) ?? [];
      list.push(row);
      map.set(row.executionId, list);
    }

    return map;
  }

  private mapExecutionRow(row: ExecutionLogRow, nodes: NodeLogRow[]): WorkflowExecution {
    const metadataRaw = (row.metadata as Record<string, any>) ?? {};
    const nodeExecutions = nodes.map(node => this.mapNodeRow(row, node));
    const completedNodes = nodeExecutions.filter(ne => ne.status === 'succeeded').length;
    const failedNodes = nodeExecutions.filter(ne => ne.status === 'failed').length;
    const metadata: WorkflowExecution['metadata'] = {
      retryCount: Number(metadataRaw.retryCount ?? 0),
      totalCostUSD: Number(metadataRaw.totalCostUSD ?? 0),
      totalTokensUsed: Number(metadataRaw.totalTokensUsed ?? 0),
      cacheHitRate: Number(metadataRaw.cacheHitRate ?? 0),
      averageNodeDuration: Number(metadataRaw.averageNodeDuration ?? 0),
      openCircuitBreakers: (metadataRaw.openCircuitBreakers as any[]) ?? [],
      nextResumeAt: metadataRaw.nextResumeAt ? new Date(metadataRaw.nextResumeAt) : undefined,
      waitReason: metadataRaw.waitReason,
    };

    return {
      executionId: row.executionId,
      workflowId: row.workflowId ?? row.executionId,
      workflowName: row.workflowName ?? row.workflowId ?? row.executionId,
      organizationId: row.organizationId ?? undefined,
      userId: row.userId ?? undefined,
      status: row.status as WorkflowExecution['status'],
      startTime: row.startedAt,
      endTime: row.completedAt ?? undefined,
      duration: row.durationMs ?? undefined,
      triggerType: row.triggerType ?? undefined,
      triggerData: row.triggerData ?? undefined,
      totalNodes: metadataRaw.totalNodes ?? nodeExecutions.length,
      completedNodes,
      failedNodes,
      nodeExecutions,
      finalOutput: row.outputs ?? undefined,
      error: row.error ?? undefined,
      correlationId: row.correlationId,
      tags: row.tags ?? [],
      timeline: (row.timeline as TimelineEvent[]) ?? [],
      metadata,
    };
  }

  private async persistExecutionSnapshot(execution: WorkflowExecution): Promise<void> {
    if (!this.shouldUseDatabase() || !db) {
      return;
    }

    const sanitizedTrigger = sanitizeExecutionPayload(execution.triggerData ?? null);
    const sanitizedMetadata = sanitizeExecutionPayload(execution.metadata);
    const sanitizedTimeline = sanitizeExecutionPayload(execution.timeline);
    const sanitizedOutput = sanitizeExecutionPayload(execution.finalOutput ?? null);

    try {
      const [record] = await db
        .insert(executionLogs)
        .values({
          executionId: execution.executionId,
          workflowId: execution.workflowId,
          workflowName: execution.workflowName,
          organizationId: execution.organizationId ?? null,
          userId: execution.userId ?? null,
          status: execution.status,
          startedAt: execution.startTime,
          completedAt: execution.endTime ?? null,
          durationMs: execution.duration ?? null,
          triggerType: execution.triggerType ?? null,
          triggerData: sanitizedTrigger as any,
          inputs: sanitizeExecutionPayload(execution.triggerData ?? null) as any,
          outputs: sanitizedOutput as any,
          error: execution.error ?? null,
          metadata: sanitizedMetadata as any,
          timeline: sanitizedTimeline as any,
          correlationId: execution.correlationId,
          tags: execution.tags,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: executionLogs.executionId,
          set: {
            workflowId: execution.workflowId,
            workflowName: execution.workflowName,
            organizationId: execution.organizationId ?? null,
            userId: execution.userId ?? null,
            status: execution.status,
            completedAt: execution.endTime ?? null,
            durationMs: execution.duration ?? null,
            triggerType: execution.triggerType ?? null,
            triggerData: sanitizedTrigger as any,
            inputs: sanitizeExecutionPayload(execution.triggerData ?? null) as any,
            outputs: sanitizedOutput as any,
            error: execution.error ?? null,
            metadata: sanitizedMetadata as any,
            timeline: sanitizedTimeline as any,
            tags: execution.tags,
            updatedAt: new Date(),
          },
        })
        .returning({ id: executionLogs.id });

      if (record?.id) {
        this.executionLogIdCache.set(execution.executionId, record.id);
      }
    } catch (error) {
      console.error(`Failed to persist execution ${execution.executionId}`, error);
    }
  }

  private async persistNodeSnapshot(executionId: string, nodeExecution: NodeExecution): Promise<void> {
    if (!this.shouldUseDatabase() || !db) {
      return;
    }

    const executionLogId = await this.getExecutionLogId(executionId);
    if (!executionLogId) {
      return;
    }

    const sanitizedInput = sanitizeExecutionPayload(nodeExecution.input ?? null);
    const sanitizedOutput = sanitizeExecutionPayload(nodeExecution.output ?? null);
    const sanitizedMetadata = sanitizeExecutionPayload(nodeExecution.metadata ?? {});
    const sanitizedTimeline = sanitizeExecutionPayload(nodeExecution.timeline ?? []);

    try {
      await db
        .insert(nodeLogs)
        .values({
          executionLogId,
          executionId,
          nodeId: nodeExecution.nodeId,
          nodeType: nodeExecution.nodeType,
          nodeLabel: nodeExecution.nodeLabel,
          status: nodeExecution.status,
          startedAt: nodeExecution.startTime,
          completedAt: nodeExecution.endTime ?? null,
          durationMs: nodeExecution.duration ?? null,
          attempt: nodeExecution.attempt,
          maxAttempts: nodeExecution.maxAttempts,
          input: sanitizedInput as any,
          output: sanitizedOutput as any,
          error: nodeExecution.error ?? null,
          metadata: sanitizedMetadata as any,
          timeline: sanitizedTimeline as any,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [nodeLogs.executionId, nodeLogs.nodeId, nodeLogs.attempt],
          set: {
            nodeType: nodeExecution.nodeType,
            nodeLabel: nodeExecution.nodeLabel,
            status: nodeExecution.status,
            startedAt: nodeExecution.startTime,
            completedAt: nodeExecution.endTime ?? null,
            durationMs: nodeExecution.duration ?? null,
            maxAttempts: nodeExecution.maxAttempts,
            input: sanitizedInput as any,
            output: sanitizedOutput as any,
            error: nodeExecution.error ?? null,
            metadata: sanitizedMetadata as any,
            timeline: sanitizedTimeline as any,
            updatedAt: new Date(),
          },
        });
    } catch (error) {
      console.error(`Failed to persist node execution ${nodeExecution.nodeId}`, error);
    }
  }

  private async getExecutionLogId(executionId: string): Promise<string | null> {
    if (this.executionLogIdCache.has(executionId)) {
      return this.executionLogIdCache.get(executionId) ?? null;
    }

    if (!this.shouldUseDatabase() || !db) {
      return null;
    }

    try {
      const result = await db
        .select({ id: executionLogs.id })
        .from(executionLogs)
        .where(eq(executionLogs.executionId, executionId))
        .limit(1);

      const id = result[0]?.id ?? null;
      this.executionLogIdCache.set(executionId, id);
      return id;
    } catch (error) {
      console.error(`Failed to resolve execution log id for ${executionId}`, error);
      this.executionLogIdCache.set(executionId, null);
      return null;
    }
  }

  private mapNodeRow(row: ExecutionLogRow, node: NodeLogRow): NodeExecution {
    const metadata = (node.metadata as NodeExecution['metadata']) ?? {};
    const timeline = (node.timeline as TimelineEvent[]) ?? [];

    return {
      nodeId: node.nodeId,
      nodeType: node.nodeType ?? 'unknown',
      nodeLabel: node.nodeLabel ?? node.nodeId,
      status: (node.status as NodeExecution['status']) ?? 'succeeded',
      startTime: node.startedAt ?? row.startedAt,
      endTime: node.completedAt ?? undefined,
      duration: node.durationMs ?? undefined,
      attempt: node.attempt ?? 1,
      maxAttempts: node.maxAttempts ?? 0,
      input: node.input ?? undefined,
      output: node.output ?? undefined,
      error: node.error ?? undefined,
      correlationId: row.correlationId,
      retryHistory: [],
      metadata,
      timeline,
    };
  }

  private findNodeExecution(executionId: string, nodeId: string): NodeExecution | undefined {
    const nodeExecutions = this.nodeExecutions.get(executionId);
    return nodeExecutions?.find(ne => ne.nodeId === nodeId);
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
      (data as any)?.connectionId
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

    // Calculate retry count
    execution.metadata.retryCount = nodeExecutions.reduce((sum, ne) => sum + ne.retryHistory.length, 0);
    
    // Calculate total cost and tokens
    execution.metadata.totalCostUSD = nodeExecutions.reduce((sum, ne) => sum + (ne.metadata.costUSD || 0), 0);
    execution.metadata.totalTokensUsed = nodeExecutions.reduce((sum, ne) => sum + (ne.metadata.tokensUsed || 0), 0);
    
    // Calculate cache hit rate
    const cacheableNodes = nodeExecutions.filter(ne => ne.metadata.idempotencyKey);
    const cacheHits = cacheableNodes.filter(ne => ne.metadata.cacheHit);
    execution.metadata.cacheHitRate = cacheableNodes.length > 0 ? cacheHits.length / cacheableNodes.length : 0;
    
    // Calculate average node duration
    const completedNodes = nodeExecutions.filter(ne => ne.duration);
    execution.metadata.averageNodeDuration = completedNodes.length > 0
      ? completedNodes.reduce((sum, ne) => sum + ne.duration!, 0) / completedNodes.length
      : 0;

    const breakerDetails = nodeExecutions
      .map(ne => {
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
            failureThreshold: state.failureThreshold
          };
        }
        return null;
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

    execution.metadata.openCircuitBreakers = breakerDetails;
  }

  private generateCorrelationId(): string {
    return `corr_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }
}

export const runExecutionManager = new RunExecutionManager();

// Start cleanup interval
setInterval(() => {
  runExecutionManager.cleanup().catch(error => {
    console.error('Failed to clean up execution logs', error);
  });
}, 2 * 60 * 60 * 1000); // Every 2 hours