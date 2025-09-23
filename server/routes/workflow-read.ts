/**
 * ChatGPT Fix 1: Workflow Read Routes for Graph Editor Handoff
 */

import { Router } from 'express';
import { WorkflowStoreService } from '../workflow/workflow-store.js';
import { productionGraphCompiler } from '../core/ProductionGraphCompiler.js';
import { productionDeployer } from '../core/ProductionDeployer.js';

export const workflowReadRouter = Router();

const stripExecutionState = (data: any) => {
  if (!data || typeof data !== 'object') {
    return data;
  }

  const sanitized = { ...data };
  delete sanitized.executionStatus;
  delete sanitized.executionError;
  delete sanitized.lastExecution;
  delete sanitized.isRunning;
  delete sanitized.isCompleted;

  if (sanitized.parameters === undefined && sanitized.params !== undefined) {
    sanitized.parameters = sanitized.params;
  } else if (sanitized.params === undefined && sanitized.parameters !== undefined) {
    sanitized.params = sanitized.parameters;
  }

  return sanitized;
};

const sanitizeGraphForExecution = (graph: any) => {
  if (!graph || typeof graph !== 'object') {
    return graph;
  }

  const cloned: any = typeof globalThis.structuredClone === 'function'
    ? globalThis.structuredClone(graph)
    : JSON.parse(JSON.stringify(graph));

  const nodes = Array.isArray(cloned.nodes) ? cloned.nodes : [];
  const sanitizedNodes = nodes.map((node: any, index: number) => {
    const baseData = stripExecutionState(node.data || {});
    const params = node.params || baseData?.parameters || baseData?.params || {};
    if (baseData) {
      baseData.parameters = params;
      baseData.params = params;
    }

    return {
      ...node,
      id: String(node.id ?? `node-${index}`),
      type: node.type || node.nodeType || 'action',
      label: node.label || baseData?.label || `Node ${index + 1}`,
      params,
      data: baseData,
      app: node.app || baseData?.app,
    };
  });

  const edges = Array.isArray(cloned.edges) ? cloned.edges : [];
  const sanitizedEdges = edges
    .map((edge: any) => {
      const from = edge.from ?? edge.source;
      const to = edge.to ?? edge.target;
      if (!from || !to) {
        return null;
      }

      return {
        ...edge,
        from: String(from),
        to: String(to),
        label: edge.label ?? edge.data?.label ?? '',
      };
    })
    .filter(Boolean);

  return {
    ...cloned,
    id: cloned.id,
    name: cloned.name,
    version: cloned.version ?? 1,
    nodes: sanitizedNodes,
    edges: sanitizedEdges,
    scopes: Array.isArray(cloned.scopes) ? cloned.scopes : [],
    secrets: Array.isArray(cloned.secrets) ? cloned.secrets : [],
    metadata: cloned.metadata ?? {},
  };
};

const computeExecutionOrder = (nodes: any[], edges: any[]) => {
  const adjacency = new Map<string, string[]>();
  const indegree = new Map<string, number>();

  nodes.forEach((node: any) => {
    adjacency.set(node.id, []);
    indegree.set(node.id, 0);
  });

  edges.forEach((edge: any) => {
    const from = edge.from;
    const to = edge.to;
    if (!adjacency.has(from) || !indegree.has(to)) {
      return;
    }
    adjacency.get(from)!.push(to);
    indegree.set(to, (indegree.get(to) ?? 0) + 1);
  });

  const queue: string[] = [];
  nodes.forEach((node: any) => {
    if ((indegree.get(node.id) ?? 0) === 0) {
      queue.push(node.id);
    }
  });

  const order: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    order.push(current);

    for (const neighbor of adjacency.get(current) ?? []) {
      const nextDegree = (indegree.get(neighbor) ?? 0) - 1;
      indegree.set(neighbor, nextDegree);
      if (nextDegree === 0) {
        queue.push(neighbor);
      }
    }
  }

  const visited = new Set(order);
  nodes.forEach((node: any) => {
    if (!visited.has(node.id)) {
      order.push(node.id);
    }
  });

  return order;
};

const summarizeNodeExecution = (node: any, index: number) => {
  const now = new Date();
  const params = node.params || {};
  const app = node.app || node.data?.app || 'core';
  const operation =
    node.data?.function ||
    node.data?.operation ||
    node.op ||
    (typeof node.type === 'string' ? node.type.split('.').pop() : 'operation');

  const preview = {
    app,
    operation,
    parameters: params,
    sample: node.data?.metadata?.sample || node.data?.metadata?.sampleRow,
  };

  const logs = [
    `Validated ${Object.keys(params).length} parameter${Object.keys(params).length === 1 ? '' : 's'}`,
    `Simulated ${app}.${operation}`,
  ];

  if (node.data?.metadata?.description) {
    logs.push(`Description: ${node.data.metadata.description}`);
  }

  return {
    status: 'success',
    finishedAt: now.toISOString(),
    durationMs: 45 + index * 20,
    preview,
    summary: `Completed ${app}.${operation}`,
    logs,
  };
};

// Get specific workflow for Graph Editor loading
workflowReadRouter.get('/workflows/:id', (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Workflow ID is required'
      });
    }

    const workflow = WorkflowStoreService.retrieve(id);
    
    if (!workflow) {
      return res.status(404).json({
        success: false,
        error: `Workflow not found: ${id}`,
        hint: 'Workflow may have expired or was never created'
      });
    }

    console.log(`📋 Serving workflow ${id} for Graph Editor handoff`);
    
    res.json({
      success: true,
      graph: workflow,
      metadata: {
        retrievedAt: new Date().toISOString(),
        workflowId: id
      }
    });

  } catch (error) {
    console.error('❌ Error retrieving workflow:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve workflow'
    });
  }
});

// List all stored workflows (for debugging)
workflowReadRouter.get('/workflows', (req, res) => {
  try {
    const stats = WorkflowStoreService.getStats();
    
    res.json({
      success: true,
      stats,
      message: `${stats.totalWorkflows} workflows in store`
    });
  } catch (error) {
    console.error('Error getting workflow stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get workflow statistics'
    });
  }
});

// Clear specific workflow
workflowReadRouter.delete('/workflows/:id', (req, res) => {
  try {
    const { id } = req.params;
    const existed = WorkflowStoreService.clear(id);

    res.json({
      success: true,
      cleared: existed,
      message: existed ? `Workflow ${id} cleared` : `Workflow ${id} was not found`
    });
  } catch (error) {
    console.error('Error clearing workflow:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear workflow'
    });
  }
});

workflowReadRouter.post('/workflows/:id/execute', async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ success: false, error: 'Workflow ID is required' });
    }

    console.log(`▶️ Received execution request for workflow ${id}`);

    const providedGraph = req.body?.graph;
    let graphSource: any = null;

    if (providedGraph) {
      const sanitizedProvided = sanitizeGraphForExecution(providedGraph);
      sanitizedProvided.id = sanitizedProvided.id || id;
      WorkflowStoreService.store(id, sanitizedProvided);
      graphSource = sanitizedProvided;
      console.log(`💾 Stored provided graph for workflow ${id} before execution preview`);
    } else {
      const stored = WorkflowStoreService.retrieve(id);
      if (!stored) {
        return res.status(404).json({ success: false, error: `Workflow not found: ${id}` });
      }

      graphSource = sanitizeGraphForExecution(stored.graph ?? stored);
    }

    if (!graphSource || !Array.isArray(graphSource.nodes) || graphSource.nodes.length === 0) {
      return res.status(400).json({ success: false, error: 'Workflow graph is empty' });
    }

    const compilation = productionGraphCompiler.compile(graphSource, {
      includeLogging: true,
      includeErrorHandling: true,
      timezone: req.body?.timezone || 'UTC'
    });

    if (!compilation.success) {
      console.warn(`⚠️ Compilation failed for workflow ${id}:`, compilation.error);
      return res.status(422).json({
        success: false,
        error: compilation.error || 'Graph compilation failed',
        details: compilation
      });
    }

    let deploymentPreview = { success: true, logs: [] as string[], error: undefined as string | undefined };
    try {
      const previewResult = await productionDeployer.deploy(compilation.files, {
        projectName: graphSource.name || id,
        description: `Dry run preview for workflow ${id}`,
        dryRun: true
      });

      deploymentPreview = {
        success: previewResult.success,
        logs: previewResult.logs || [],
        error: previewResult.error
      };
    } catch (error: any) {
      deploymentPreview = {
        success: false,
        logs: [],
        error: error?.message || 'Deployment preview failed'
      };
    }

    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    const sendEvent = (event: Record<string, any>) => {
      const payload = { timestamp: new Date().toISOString(), ...event };
      res.write(JSON.stringify(payload) + '\n');
    };

    const nodes = graphSource.nodes;
    const edges = graphSource.edges ?? [];
    const nodeMap = new Map(nodes.map((node: any) => [String(node.id), node]));
    const order = computeExecutionOrder(nodes, edges);
    const results: Record<string, any> = {};
    let encounteredError = !deploymentPreview.success;

    sendEvent({
      type: 'start',
      workflowId: id,
      nodeCount: nodes.length,
      requiredScopes: compilation.requiredScopes,
      estimatedSize: compilation.estimatedSize
    });

    if (deploymentPreview.logs.length > 0) {
      sendEvent({
        type: 'deployment',
        workflowId: id,
        success: deploymentPreview.success,
        logs: deploymentPreview.logs.slice(0, 25),
        error: deploymentPreview.error
      });
    }

    let stepIndex = 0;
    for (const nodeId of order) {
      const node = nodeMap.get(nodeId);
      if (!node) {
        continue;
      }
      stepIndex += 1;

      const label = node.label || node.data?.label || nodeId;

      console.log(`⏱️ [${id}] Running node ${nodeId} (${label})`);
      sendEvent({
        type: 'node-start',
        workflowId: id,
        nodeId,
        label
      });

      try {
        const result = summarizeNodeExecution(node, stepIndex);
        results[nodeId] = { status: 'success', label, result };

        sendEvent({
          type: 'node-complete',
          workflowId: id,
          nodeId,
          label,
          result
        });

        console.log(`✅ [${id}] Completed node ${nodeId}`);
      } catch (error: any) {
        encounteredError = true;
        const errorPayload = {
          message: error?.message || 'Node execution failed',
          stack: process.env.NODE_ENV === 'development' ? error?.stack : undefined
        };

        results[nodeId] = { status: 'error', label, error: errorPayload };

        console.error(`❌ [${id}] Node ${nodeId} failed:`, error?.message || error);
        sendEvent({
          type: 'node-error',
          workflowId: id,
          nodeId,
          label,
          error: errorPayload
        });
      }
    }

    const summaryMessage = encounteredError
      ? `Workflow ${id} completed with errors`
      : `Workflow ${id} executed successfully`;

    sendEvent({
      type: 'summary',
      workflowId: id,
      success: !encounteredError,
      message: summaryMessage,
      requiredScopes: compilation.requiredScopes,
      estimatedSize: compilation.estimatedSize,
      nodeCount: nodes.length,
      results,
      deployment: deploymentPreview
    });

    res.end();
  } catch (error: any) {
    console.error('❌ Error executing workflow preview:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: error?.message || 'Failed to execute workflow'
      });
    } else {
      res.end();
    }
  }
});

export default workflowReadRouter;