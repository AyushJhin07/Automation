/**
 * ChatGPT Fix 1: Workflow Read Routes for Graph Editor Handoff
 */

import { Router } from 'express';
import { WorkflowRepository } from '../workflow/WorkflowRepository.js';
import { productionGraphCompiler } from '../core/ProductionGraphCompiler.js';
import { productionDeployer } from '../core/ProductionDeployer.js';
import { workflowRuntimeService, WorkflowNodeExecutionError } from '../workflow/WorkflowRuntimeService.js';
import { getErrorMessage } from '../types/common.js';

export const workflowReadRouter = Router();

const requireOrganizationContext = (req: any, res: any): string | null => {
  const organizationId = req?.organizationId;
  const organizationStatus = req?.organizationStatus;

  if (!organizationId) {
    res.status(403).json({ success: false, error: 'Organization context is required' });
    return null;
  }

  if (organizationStatus && organizationStatus !== 'active') {
    res.status(403).json({ success: false, error: 'Organization is not active' });
    return null;
  }

  return organizationId;
};

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

    const candidateTypes: Array<string | undefined> = [
      node.nodeType,
      baseData?.nodeType,
      baseData?.type,
      typeof node.type === 'string' ? node.type : undefined,
      baseData?.kind ? `${baseData.kind}.custom` : undefined,
    ];
    const canonicalType = candidateTypes.find((value) => typeof value === 'string' && value.includes('.'))
      || candidateTypes.find((value) => typeof value === 'string' && value.trim().length > 0)
      || 'action.custom';

    if (baseData && typeof baseData === 'object') {
      baseData.nodeType = canonicalType;
      baseData.type = canonicalType;
    }

    const position = (node.position && typeof node.position.x === 'number' && typeof node.position.y === 'number')
      ? node.position
      : { x: Number(node.position?.x) || 0, y: Number(node.position?.y) || 0 };

    const appId = node.app || baseData?.app || baseData?.application;

    return {
      ...node,
      id: String(node.id ?? `node-${index}`),
      type: canonicalType,
      nodeType: canonicalType,
      label: node.label || baseData?.label || `Node ${index + 1}`,
      params,
      data: baseData,
      app: appId,
      position,
    };
  });

  const edges = Array.isArray(cloned.edges) ? cloned.edges : [];
  const sanitizedEdges = edges
    .map((edge: any, index: number) => {
      const from = edge.from ?? edge.source;
      const to = edge.to ?? edge.target;
      if (!from || !to) {
        return null;
      }

      const source = String(from);
      const target = String(to);
      const edgeId =
        typeof edge.id === 'string' && edge.id.trim().length > 0
          ? edge.id
          : `edge-${index}-${source}-${target}`;

      return {
        ...edge,
        id: edgeId,
        source,
        target,
        from: source,
        to: target,
        label: edge.label ?? edge.data?.label ?? '',
      };
    })
    .filter(Boolean);

  const nowIso = new Date().toISOString();
  const metadataSource = (cloned.metadata && typeof cloned.metadata === 'object') ? cloned.metadata : {};
  const createdAt =
    (typeof (metadataSource as any).createdAt === 'string' && (metadataSource as any).createdAt) ||
    (typeof (metadataSource as any).created_at === 'string' && (metadataSource as any).created_at) ||
    (typeof cloned.createdAt === 'string' && cloned.createdAt) ||
    nowIso;
  const metadataVersion =
    (typeof (metadataSource as any).version === 'string' && (metadataSource as any).version?.trim()?.length > 0)
      ? (metadataSource as any).version.trim()
      : '1.0.0';

  const metadata = {
    ...metadataSource,
    version: metadataVersion,
    createdAt,
    updatedAt: (metadataSource as any).updatedAt && typeof (metadataSource as any).updatedAt === 'string'
      ? (metadataSource as any).updatedAt
      : nowIso,
  };

  return {
    ...cloned,
    id: String(cloned.id ?? ''),
    name: cloned.name,
    version: typeof cloned.version === 'number' ? cloned.version : 1,
    nodes: sanitizedNodes,
    edges: sanitizedEdges,
    scopes: Array.isArray(cloned.scopes) ? cloned.scopes : [],
    secrets: Array.isArray(cloned.secrets) ? cloned.secrets : [],
    metadata,
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

// Get specific workflow for Graph Editor loading
workflowReadRouter.get('/workflows/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Workflow ID is required'
      });
    }

    const organizationId = requireOrganizationContext(req as any, res);
    if (!organizationId) {
      return;
    }

    const workflowRecord = await WorkflowRepository.getWorkflowById(id, organizationId);

    if (!workflowRecord) {
      return res.status(404).json({
        success: false,
        error: `Workflow not found: ${id}`,
        hint: 'Workflow may have expired or was never created'
      });
    }

    console.log(`📋 Serving workflow ${id} for Graph Editor handoff`);

    const storedGraph = (workflowRecord as any)?.graph ?? workflowRecord;
    const sanitizedGraph = sanitizeGraphForExecution(storedGraph);

    res.json({
      success: true,
      graph: sanitizedGraph,
      metadata: {
        retrievedAt: new Date().toISOString(),
        workflowId: id,
        updatedAt: workflowRecord.updatedAt
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

workflowReadRouter.get('/workflows/:id/versions', async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = requireOrganizationContext(req as any, res);
    if (!organizationId) {
      return;
    }

    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;

    const history = await WorkflowRepository.listWorkflowVersions({
      workflowId: id,
      organizationId,
      limit,
    });

    res.json({ success: true, history });
  } catch (error: any) {
    console.error('❌ Failed to list workflow versions:', error);
    res.status(400).json({
      success: false,
      error: error?.message ?? 'Failed to list workflow versions',
    });
  }
});

// List all stored workflows (for debugging)
workflowReadRouter.get('/workflows', async (req, res) => {
  try {
    const organizationId = requireOrganizationContext(req as any, res);
    if (!organizationId) {
      return;
    }

    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
    const offset = typeof req.query.offset === 'string' ? Number(req.query.offset) : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const userIdQuery = typeof req.query.userId === 'string' ? req.query.userId : undefined;

    const { workflows, total, limit: resolvedLimit, offset: resolvedOffset } = await WorkflowRepository.listWorkflows({
      limit,
      offset,
      search,
      userId: userIdQuery ?? (req as any)?.user?.id,
      organizationId,
    });

    res.json({
      success: true,
      workflows,
      pagination: {
        total,
        limit: resolvedLimit,
        offset: resolvedOffset,
      }
    });
  } catch (error) {
    console.error('Error getting workflow statistics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get workflow statistics'
    });
  }
});

// Clear specific workflow
workflowReadRouter.delete('/workflows/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = requireOrganizationContext(req as any, res);
    if (!organizationId) {
      return;
    }

    const deleted = await WorkflowRepository.deleteWorkflow(id, organizationId);

    res.json({
      success: true,
      cleared: deleted,
      message: deleted ? `Workflow ${id} cleared` : `Workflow ${id} was not found`
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
  let organizationId: string | null = null;
  let executionRecordId: string | null = null;
  let executionStart = Date.now();
  let executionMetadata: Record<string, any> | null = null;

  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ success: false, error: 'Workflow ID is required' });
    }

    organizationId = requireOrganizationContext(req as any, res);
    if (!organizationId) {
      return;
    }

    console.log(`▶️ Received execution request for workflow ${id}`);

    const providedGraph = req.body?.graph;
    let graphSource: any = null;

    if (providedGraph) {
      const sanitizedProvided = sanitizeGraphForExecution(providedGraph);
      sanitizedProvided.id = sanitizedProvided.id || id;
      await WorkflowRepository.saveWorkflowGraph({
        id,
        userId: (req as any)?.user?.id,
        organizationId,
        name: sanitizedProvided?.name ?? sanitizedProvided?.graph?.name,
        description: sanitizedProvided?.description ?? sanitizedProvided?.metadata?.description ?? null,
        graph: sanitizedProvided,
        metadata: sanitizedProvided?.metadata ?? null,
      });
      graphSource = sanitizedProvided;
      console.log(`💾 Stored provided graph for workflow ${id} before execution preview`);
    } else {
      const stored = await WorkflowRepository.getWorkflowById(id, organizationId);
      if (!stored) {
        return res.status(404).json({ success: false, error: `Workflow not found: ${id}` });
      }

      graphSource = sanitizeGraphForExecution((stored as any).graph ?? stored);
    }

    if (!graphSource || !Array.isArray(graphSource.nodes) || graphSource.nodes.length === 0) {
      return res.status(400).json({ success: false, error: 'Workflow graph is empty' });
    }

    const requestOptions = (req.body?.options && typeof req.body.options === 'object') ? req.body.options : {};
    executionStart = Date.now();
    const executionRecord = await WorkflowRepository.createWorkflowExecution({
      workflowId: id,
      userId: (req as any)?.user?.id,
      organizationId,
      status: 'started',
      triggerType: typeof requestOptions.triggerType === 'string' ? requestOptions.triggerType : 'manual',
      triggerData: {
        ...(requestOptions || {}),
        preview: true,
      },
      metadata: {
        preview: true,
        requestedAt: new Date().toISOString(),
      },
    });
    executionRecordId = executionRecord.id;
    executionMetadata = (executionRecord.metadata as Record<string, any> | null) ?? null;
    let executionFailed = false;

    if (process.env.NODE_ENV !== 'production') {
      try {
        const firstNode = Array.isArray(graphSource.nodes) ? graphSource.nodes[0] : null;
        console.log('🧩 Workflow execution debug: node sample', firstNode ? {
          id: firstNode.id,
          app: firstNode.app,
          connectionId: firstNode.connectionId || firstNode?.data?.connectionId || firstNode?.params?.connectionId,
          hasInlineCredentials: Boolean(firstNode?.data?.credentials || firstNode?.params?.credentials)
        } : null);
      } catch (debugError) {
        console.warn('Workflow debug logging failed:', debugError);
      }
    }

    const compilation = productionGraphCompiler.compile(graphSource, {
      includeLogging: true,
      includeErrorHandling: true,
      timezone: req.body?.timezone || 'UTC'
    });

    if (!compilation.success) {
      console.warn(`⚠️ Compilation failed for workflow ${id}:`, compilation.error);
      executionFailed = true;
      if (executionRecordId) {
        await WorkflowRepository.updateWorkflowExecution(executionRecordId, {
          status: 'failed',
          completedAt: new Date(),
          duration: Date.now() - executionStart,
          errorDetails: {
            error: compilation.error,
            stage: 'compile'
          },
          nodeResults: {},
        }, organizationId);
      }
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
    const nodeOutputs: Record<string, any> = {};
    const executionId = `${id}-${Date.now()}`;
    const runtimeContext = {
      workflowId: id,
      executionId,
      userId: (req as any)?.user?.id,
      organizationId: (req as any)?.organizationId,
      timezone: req.body?.timezone || 'UTC',
      nodeOutputs,
      edges
    };
    const nodeResultsForStorage: Record<string, any> = {};
    const stopOnError = Boolean(requestOptions.stopOnError);
    let encounteredError = !deploymentPreview.success;

    sendEvent({
      type: 'start',
      workflowId: id,
      executionId,
      nodeCount: nodes.length,
      requiredScopes: compilation.requiredScopes,
      estimatedSize: compilation.estimatedSize,
      mode: 'live-run'
    });

    if (deploymentPreview.logs.length > 0) {
      sendEvent({
        type: 'deployment',
        workflowId: id,
        executionId,
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
        const nodeResult = await workflowRuntimeService.executeNode(node, runtimeContext);
        const finishedAt = new Date().toISOString();

        const eventResult = {
          summary: nodeResult.summary,
          output: nodeResult.output,
          preview: nodeResult.preview,
          logs: nodeResult.logs,
          diagnostics: nodeResult.diagnostics,
          parameters: nodeResult.parameters,
          finishedAt
        };

        results[nodeId] = {
          status: 'success',
          label,
          result: eventResult
        };
        nodeResultsForStorage[nodeId] = {
          status: 'success',
          ...eventResult,
        };

        sendEvent({
          type: 'node-complete',
          workflowId: id,
          executionId,
          nodeId,
          label,
          result: eventResult
        });

        console.log(`✅ [${id}] Completed node ${nodeId}`);
      } catch (error: any) {
        encounteredError = true;

        const isWorkflowError = error instanceof WorkflowNodeExecutionError;
        const message = isWorkflowError ? error.message : getErrorMessage(error);
        const errorPayload = {
          message,
          details: isWorkflowError ? error.details : undefined,
          stack: process.env.NODE_ENV === 'development' ? error?.stack : undefined
        };

        results[nodeId] = { status: 'error', label, error: errorPayload };
        nodeResultsForStorage[nodeId] = {
          status: 'error',
          error: errorPayload,
        };

        console.error(`❌ [${id}] Node ${nodeId} failed:`, message);
        sendEvent({
          type: 'node-error',
          workflowId: id,
          executionId,
          nodeId,
          label,
          error: errorPayload
        });

        if (stopOnError) {
          break;
        }
      }
    }

    const summaryMessage = encounteredError
      ? `Workflow ${id} completed with errors`
      : `Workflow ${id} executed successfully`;

    const finalStatus = encounteredError ? 'failed' : 'completed';
    const completionTime = new Date();
    const durationMs = Date.now() - executionStart;

    if (!executionFailed && executionRecordId) {
      const firstError = Object.values(nodeResultsForStorage).find((result: any) => result.status === 'error');
      await WorkflowRepository.updateWorkflowExecution(executionRecordId, {
        status: finalStatus,
        completedAt: completionTime,
        duration: durationMs,
        nodeResults: nodeResultsForStorage,
        errorDetails: encounteredError && firstError ? firstError.error : null,
        metadata: {
          ...(executionMetadata || {}),
          preview: true,
          finishedAt: completionTime.toISOString(),
        },
      }, organizationId);
    }

    sendEvent({
      type: 'summary',
      workflowId: id,
      executionId,
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
    if (executionRecordId) {
      try {
        if (organizationId) {
          await WorkflowRepository.updateWorkflowExecution(executionRecordId, {
            status: 'failed',
            completedAt: new Date(),
            duration: executionStart ? Date.now() - executionStart : null,
            errorDetails: {
              error: error?.message || 'Unknown execution error',
              stack: process.env.NODE_ENV === 'development' ? error?.stack : undefined,
            },
          }, organizationId);
        }
      } catch (updateError) {
        console.error('⚠️ Failed to update execution record after error:', updateError);
      }
    }
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
