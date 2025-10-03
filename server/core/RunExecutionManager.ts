/**
 * RUN EXECUTION MANAGER - Comprehensive execution tracking and observability
 * Tracks workflow executions with detailed timeline, inputs/outputs, and debugging info
 */

import { NodeGraph, GraphNode } from '../../shared/nodeGraphSchema';
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
    httpStatusCode?: number;
    headers?: Record<string, string>;
    timeoutMs?: number;
    connectorId?: string;
    circuitState?: CircuitBreakerSnapshot;
  };
}

export interface WorkflowExecution {
  executionId: string;
  workflowId: string;
  workflowName: string;
  userId?: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'partial';
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

class RunExecutionManager {
  private executions = new Map<string, WorkflowExecution>();
  private nodeExecutions = new Map<string, NodeExecution[]>(); // executionId -> NodeExecution[]
  private correlationIndex = new Map<string, string[]>(); // correlationId -> executionIds[]

  /**
   * Start tracking a new workflow execution
   */
  startExecution(
    executionId: string,
    workflow: NodeGraph,
    userId?: string,
    triggerType?: string,
    triggerData?: any
  ): WorkflowExecution {
    const correlationId = this.generateCorrelationId();
    
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
        circuitState
      }
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

    const nodeExecutions = this.nodeExecutions.get(executionId)!;
    nodeExecutions.push(nodeExecution);

    // Update workflow status
    execution.status = 'running';

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

    // Update workflow progress
    const execution = this.executions.get(executionId)!;
    execution.completedNodes++;
    
    // Update workflow metadata
    this.updateWorkflowMetadata(execution);

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

    // Update workflow progress
    const execution = this.executions.get(executionId)!;
    execution.failedNodes++;
    
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

    console.log(`🏁 Completed execution ${executionId}: ${execution.status} in ${execution.duration}ms`);
  }

  /**
   * Get execution by ID with full details
   */
  getExecution(executionId: string): WorkflowExecution | undefined {
    const execution = this.executions.get(executionId);
    if (!execution) return undefined;

    // Attach node executions
    execution.nodeExecutions = this.nodeExecutions.get(executionId) || [];
    
    return execution;
  }

  /**
   * Query executions with filtering and pagination
   */
  queryExecutions(query: ExecutionQuery = {}): {
    executions: WorkflowExecution[];
    total: number;
    hasMore: boolean;
  } {
    let executions = Array.from(this.executions.values());

    // Apply filters
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
      executions = executions.filter(e => e.startTime >= query.dateFrom!);
    }
    if (query.dateTo) {
      executions = executions.filter(e => e.startTime <= query.dateTo!);
    }
    if (query.tags && query.tags.length > 0) {
      executions = executions.filter(e => 
        query.tags!.some(tag => e.tags.includes(tag))
      );
    }

    // Sort
    const sortBy = query.sortBy || 'startTime';
    const sortOrder = query.sortOrder || 'desc';
    executions.sort((a, b) => {
      let aVal: any, bVal: any;
      switch (sortBy) {
        case 'startTime':
          aVal = a.startTime.getTime();
          bVal = b.startTime.getTime();
          break;
        case 'duration':
          aVal = a.duration || 0;
          bVal = b.duration || 0;
          break;
        case 'status':
          aVal = a.status;
          bVal = b.status;
          break;
        default:
          aVal = a.startTime.getTime();
          bVal = b.startTime.getTime();
      }
      
      if (sortOrder === 'asc') {
        return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      } else {
        return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
      }
    });

    const total = executions.length;
    const limit = query.limit || 50;
    const offset = query.offset || 0;
    
    // Paginate
    const paginatedExecutions = executions.slice(offset, offset + limit);
    
    // Attach node executions to each
    paginatedExecutions.forEach(execution => {
      execution.nodeExecutions = this.nodeExecutions.get(execution.executionId) || [];
    });

    return {
      executions: paginatedExecutions,
      total,
      hasMore: offset + limit < total
    };
  }

  /**
   * Get executions by correlation ID
   */
  getExecutionsByCorrelation(correlationId: string): WorkflowExecution[] {
    const executionIds = this.correlationIndex.get(correlationId) || [];
    return executionIds.map(id => this.getExecution(id)).filter(Boolean) as WorkflowExecution[];
  }

  /**
   * Get execution statistics
   */
  getExecutionStats(timeframe: 'hour' | 'day' | 'week' = 'day'): {
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
      week: 7 * 24 * 60 * 60 * 1000
    }[timeframe];
    
    const cutoff = new Date(now.getTime() - timeframeMs);
    const recentExecutions = Array.from(this.executions.values())
      .filter(e => e.startTime >= cutoff);

    const successful = recentExecutions.filter(e => e.status === 'succeeded');
    const failed = recentExecutions.filter(e => e.status === 'failed');
    
    const totalDuration = recentExecutions
      .filter(e => e.duration)
      .reduce((sum, e) => sum + e.duration!, 0);
    
    const totalCost = recentExecutions
      .reduce((sum, e) => sum + e.metadata.totalCostUSD, 0);

    // Popular workflows
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
      popularWorkflows
    };
  }

  /**
   * Clean up old executions
   */
  cleanup(maxAge: number = 30 * 24 * 60 * 60 * 1000): void { // 30 days default
    const cutoff = new Date(Date.now() - maxAge);
    let cleanedCount = 0;

    for (const [executionId, execution] of this.executions.entries()) {
      if (execution.startTime < cutoff) {
        this.executions.delete(executionId);
        this.nodeExecutions.delete(executionId);
        
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
  runExecutionManager.cleanup();
}, 2 * 60 * 60 * 1000); // Every 2 hours