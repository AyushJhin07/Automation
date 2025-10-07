/**
 * ChatGPT Fix 1: Workflow Read Routes for Graph Editor Handoff
 */

import { Router } from 'express';
import { WorkflowRepository } from '../workflow/WorkflowRepository.js';
import { productionGraphCompiler } from '../core/ProductionGraphCompiler.js';
import { productionDeployer } from '../core/ProductionDeployer.js';
import { workflowRuntimeService, WorkflowNodeExecutionError } from '../workflow/WorkflowRuntimeService.js';
import { getErrorMessage } from '../types/common.js';
import { simpleGraphValidator } from '../core/SimpleGraphValidator.js';
import { computeExecutionOrder, sanitizeGraphForExecution } from '../utils/workflowExecution.js';
import {
  applyResolvedOrganizationToRequest,
  resolveOrganizationContext,
} from '../utils/organizationContext.js';

export const workflowReadRouter = Router();



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

    const organizationContext = resolveOrganizationContext(req as any, res);
    if (!organizationContext.organizationId) {
      return;
    }

    applyResolvedOrganizationToRequest(req as any, organizationContext);

    const workflowRecord = await WorkflowRepository.getWorkflowById(
      id,
      organizationContext.organizationId,
    );

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
    const organizationContext = resolveOrganizationContext(req as any, res);
    if (!organizationContext.organizationId) {
      return;
    }

    applyResolvedOrganizationToRequest(req as any, organizationContext);

    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;

    const history = await WorkflowRepository.listWorkflowVersions({
      workflowId: id,
      organizationId: organizationContext.organizationId,
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
    const organizationContext = resolveOrganizationContext(req as any, res);
    if (!organizationContext.organizationId) {
      return;
    }

    applyResolvedOrganizationToRequest(req as any, organizationContext);

    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
    const offset = typeof req.query.offset === 'string' ? Number(req.query.offset) : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const userIdQuery = typeof req.query.userId === 'string' ? req.query.userId : undefined;

    const { workflows, total, limit: resolvedLimit, offset: resolvedOffset } = await WorkflowRepository.listWorkflows({
      limit,
      offset,
      search,
      userId: userIdQuery ?? (req as any)?.user?.id,
      organizationId: organizationContext.organizationId,
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
    const organizationContext = resolveOrganizationContext(req as any, res);
    if (!organizationContext.organizationId) {
      return;
    }

    applyResolvedOrganizationToRequest(req as any, organizationContext);

    const deleted = await WorkflowRepository.deleteWorkflow(
      id,
      organizationContext.organizationId,
    );

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

    const organizationContext = resolveOrganizationContext(req as any, res);
    if (!organizationContext.organizationId) {
      return;
    }

    applyResolvedOrganizationToRequest(req as any, organizationContext);
    organizationId = organizationContext.organizationId;

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

workflowReadRouter.post('/workflows/validate', async (req, res) => {
  const organizationContext = resolveOrganizationContext(req as any, res);
  if (!organizationContext.organizationId) {
    return;
  }

  applyResolvedOrganizationToRequest(req as any, organizationContext);

  const graphPayload = (req.body && typeof req.body === 'object' && 'graph' in req.body)
    ? (req.body as any).graph
    : req.body;

  if (!graphPayload || typeof graphPayload !== 'object') {
    return res.status(400).json({ success: false, error: 'Workflow graph payload is required' });
  }

  try {
    const sanitizedGraph = sanitizeGraphForExecution(graphPayload);
    const validation = simpleGraphValidator.validate(sanitizedGraph as any);
    const errors = Array.isArray(validation.errors) ? validation.errors : [];
    const warnings = Array.isArray(validation.warnings) ? validation.warnings : [];
    const securityWarnings = Array.isArray(validation.securityWarnings)
      ? validation.securityWarnings
      : [];

    return res.json({
      success: true,
      validation: {
        valid: validation.valid,
        errors,
        warnings: [...warnings, ...securityWarnings],
        requiredScopes: Array.isArray(validation.requiredScopes) ? validation.requiredScopes : [],
        estimatedComplexity: validation.estimatedComplexity ?? 'unknown',
      },
    });
  } catch (error) {
    console.error('Failed to validate workflow graph:', error);
    return res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

export default workflowReadRouter;
