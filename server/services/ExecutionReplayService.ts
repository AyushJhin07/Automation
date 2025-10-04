import { runExecutionManager } from '../core/RunExecutionManager.js';
import { executionQueueService } from './ExecutionQueueService.js';
import { WorkflowRepository } from '../workflow/WorkflowRepository.js';
import type { NodeGraph } from '../../shared/nodeGraphSchema';
import type { WorkflowResumeState } from '../types/workflowTimers.js';
import { auditLogService } from './AuditLogService.js';
import { logAction } from '../utils/actionLog.js';
import { sanitizeLogPayload } from '../utils/executionLogRedaction.js';

interface ReplayExecutionParams {
  executionId: string;
  organizationId: string;
  nodeId?: string;
  userId?: string;
  reason?: string;
}

interface ResumePlan {
  initialData: any;
  resumeState: WorkflowResumeState;
}

class ExecutionReplayService {
  async replayExecution(params: ReplayExecutionParams): Promise<{ executionId: string }> {
    const execution = await runExecutionManager.getExecution(params.executionId, params.organizationId);
    if (!execution) {
      throw new Error(`Execution ${params.executionId} not found`);
    }

    const workflow = await WorkflowRepository.getWorkflowById(execution.workflowId, params.organizationId);
    if (!workflow || !workflow.graph) {
      throw new Error(`Workflow ${execution.workflowId} not found or missing graph for organization ${params.organizationId}`);
    }

    const graph = workflow.graph as NodeGraph;
    const orderedNodeIds = this.computeExecutionOrder(graph);
    if (orderedNodeIds.length === 0) {
      throw new Error('Workflow has no nodes to execute');
    }

    const startNodeId = params.nodeId ?? orderedNodeIds[0];
    if (!orderedNodeIds.includes(startNodeId)) {
      throw new Error(`Node ${startNodeId} does not belong to workflow ${execution.workflowId}`);
    }

    const plan = this.buildResumePlan({
      execution,
      orderedNodeIds,
      startNodeId,
    });

    const trimmedReason = typeof params.reason === 'string' ? params.reason.trim() : undefined;
    const normalizedReason = trimmedReason && trimmedReason.length > 0 ? trimmedReason : undefined;

    const { executionId } = await executionQueueService.enqueue({
      workflowId: execution.workflowId,
      organizationId: params.organizationId,
      userId: params.userId,
      triggerType: 'replay',
      triggerData: execution.triggerData ?? null,
      initialData: plan.initialData,
      resumeState: plan.resumeState,
      replay: {
        sourceExecutionId: execution.executionId,
        mode: params.nodeId ? 'node' : 'full',
        nodeId: params.nodeId ?? null,
        reason: normalizedReason ?? null,
        triggeredBy: params.userId ?? null,
      },
    });

    auditLogService.record({
      action: params.nodeId ? 'execution.node.replay' : 'execution.replay',
      route: params.nodeId
        ? '/executions/:executionId/nodes/:nodeId/retry'
        : '/executions/:executionId/retry',
      userId: params.userId ?? null,
      organizationId: params.organizationId,
      metadata: {
        sourceExecutionId: execution.executionId,
        replayExecutionId: executionId,
        nodeId: params.nodeId ?? null,
        reason: normalizedReason ?? null,
      },
    });

    logAction({
      type: 'execution_replay_queued',
      sourceExecutionId: execution.executionId,
      replayExecutionId: executionId,
      nodeId: params.nodeId ?? undefined,
      reason: normalizedReason ?? undefined,
      userId: params.userId ?? undefined,
      organizationId: params.organizationId,
      mode: params.nodeId ? 'node' : 'full',
    });

    return { executionId };
  }

  private buildResumePlan(params: {
    execution: NonNullable<Awaited<ReturnType<typeof runExecutionManager.getExecution>>>;
    orderedNodeIds: string[];
    startNodeId: string;
  }): ResumePlan {
    const { execution, orderedNodeIds, startNodeId } = params;
    if (!execution) {
      throw new Error('Execution context is required');
    }

    const startIndex = orderedNodeIds.indexOf(startNodeId);
    if (startIndex < 0) {
      throw new Error(`Unable to locate node ${startNodeId} in execution order`);
    }

    const remainingNodeIds = orderedNodeIds.slice(startIndex);
    if (remainingNodeIds.length === 0) {
      throw new Error('No nodes remaining to execute for replay');
    }

    const initialData = this.cloneInitialData(execution);
    const nodeLookup = new Map(execution.nodeExecutions.map((node) => [node.nodeId, node]));

    const nodeOutputs: Record<string, any> = {};
    const idempotencyKeys: Record<string, string> = {};
    const requestHashes: Record<string, string> = {};

    for (const nodeId of orderedNodeIds.slice(0, startIndex)) {
      const node = nodeLookup.get(nodeId);
      if (!node) continue;

      if (node.output !== undefined) {
        nodeOutputs[nodeId] = sanitizeLogPayload(node.output);
      }

      const metadata = (node.metadata ?? {}) as Record<string, any>;
      if (typeof metadata.idempotencyKey === 'string' && metadata.idempotencyKey.trim()) {
        idempotencyKeys[nodeId] = metadata.idempotencyKey;
      }
      if (typeof metadata.requestHash === 'string' && metadata.requestHash.trim()) {
        requestHashes[nodeId] = metadata.requestHash;
      }
    }

    let prevOutput: any = initialData;
    for (let index = startIndex - 1; index >= 0; index--) {
      const node = nodeLookup.get(orderedNodeIds[index]);
      if (node && node.output !== undefined) {
        prevOutput = sanitizeLogPayload(node.output);
        break;
      }
    }

    const resumeState: WorkflowResumeState = {
      nodeOutputs,
      prevOutput,
      remainingNodeIds,
      nextNodeId: remainingNodeIds[0] ?? null,
    };

    if (Object.keys(idempotencyKeys).length > 0) {
      resumeState.idempotencyKeys = idempotencyKeys;
    }

    if (Object.keys(requestHashes).length > 0) {
      resumeState.requestHashes = requestHashes;
    }

    return {
      initialData,
      resumeState: sanitizeLogPayload(resumeState),
    };
  }

  private computeExecutionOrder(graph: NodeGraph): string[] {
    const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
    const edges = Array.isArray(graph?.edges) ? graph.edges : [];

    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    for (const node of nodes) {
      inDegree.set(node.id, 0);
      adjacency.set(node.id, []);
    }

    for (const edge of edges) {
      const source = edge.source;
      const target = edge.target;
      if (typeof source !== 'string' || typeof target !== 'string') {
        continue;
      }
      if (!adjacency.has(source)) {
        adjacency.set(source, []);
      }
      adjacency.get(source)!.push(target);
      inDegree.set(target, (inDegree.get(target) ?? 0) + 1);
    }

    const queue: string[] = [];
    for (const node of nodes) {
      if ((inDegree.get(node.id) ?? 0) === 0) {
        queue.push(node.id);
      }
    }

    const result: string[] = [];
    const seen = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (seen.has(current)) {
        continue;
      }
      seen.add(current);
      result.push(current);

      for (const neighbor of adjacency.get(current) ?? []) {
        const nextDegree = (inDegree.get(neighbor) ?? 0) - 1;
        inDegree.set(neighbor, nextDegree);
        if (nextDegree <= 0) {
          queue.push(neighbor);
        }
      }
    }

    for (const node of nodes) {
      if (!seen.has(node.id)) {
        result.push(node.id);
      }
    }

    return result;
  }

  private cloneInitialData(execution: NonNullable<Awaited<ReturnType<typeof runExecutionManager.getExecution>>>) {
    const baseData = execution.triggerData ?? {
      trigger: {
        id: 'replay',
        source: 'replay',
        timestamp: new Date().toISOString(),
      },
    };

    return sanitizeLogPayload(baseData);
  }
}

export const executionReplayService = new ExecutionReplayService();
