import { Router } from 'express';
import { z } from 'zod';

import { runExecutionManager } from '../core/RunExecutionManager.js';
import { retryManager } from '../core/RetryManager.js';
import { executionReplayService } from '../services/ExecutionReplayService.js';
import { executionQueueService } from '../services/ExecutionQueueService.js';
import { WorkflowRepository } from '../workflow/WorkflowRepository.js';
import { auditLogService } from '../services/AuditLogService.js';
import { logAction } from '../utils/actionLog.js';
import { getErrorMessage } from '../types/common.js';
import { requirePermission } from '../middleware/auth.js';
import { ConnectorConcurrencyExceededError } from '../services/ConnectorConcurrencyService.js';
import { ExecutionQuotaExceededError } from '../services/ExecutionQuotaService.js';
import { productionGraphCompiler } from '../core/ProductionGraphCompiler.js';
import { productionDeployer } from '../core/ProductionDeployer.js';
import { workflowRuntimeService, WorkflowNodeExecutionError } from '../workflow/WorkflowRuntimeService.js';
import { computeExecutionOrder, sanitizeGraphForExecution, summarizeDryRunError } from '../utils/workflowExecution.js';

const router = Router();

const manualRunSchema = z.object({
  workflowId: z.string().min(1, 'workflowId is required'),
  triggerType: z.string().min(1).optional(),
  triggerData: z.record(z.any()).optional(),
  initialData: z.any().optional(),
});

const dryRunSchema = z.object({
  workflowId: z.string().min(1, 'workflowId is required'),
  graph: z.any().optional(),
  options: z
    .object({
      stopOnError: z.boolean().optional(),
      timezone: z.string().min(1).optional(),
    })
    .optional(),
});

type EnqueueErrorResponse = {
  status: number;
  body: {
    success: false;
    error: string;
    message?: string;
    details?: Record<string, any>;
  };
};

function mapEnqueueError(error: unknown, fallbackMessage: string): EnqueueErrorResponse {
  if (error instanceof ExecutionQuotaExceededError) {
    return {
      status: 429,
      body: {
        success: false,
        error: 'EXECUTION_QUOTA_EXCEEDED',
        details: {
          reason: error.reason,
          limit: error.limit,
          current: error.current,
          windowCount: error.windowCount,
          windowStart: error.windowStart?.toISOString?.() ?? null,
        },
        message: error.message,
      },
    };
  }

  if (error instanceof ConnectorConcurrencyExceededError) {
    return {
      status: 429,
      body: {
        success: false,
        error: 'CONNECTOR_CONCURRENCY_EXCEEDED',
        details: {
          connectorId: error.connectorId,
          scope: error.scope,
          limit: error.limit,
          active: error.active,
        },
        message: error.message,
      },
    };
  }

  if (error && typeof error === 'object' && 'quota' in (error as any)) {
    const quota = (error as any).quota ?? {};
    return {
      status: 429,
      body: {
        success: false,
        error: 'USAGE_QUOTA_EXCEEDED',
        message: getErrorMessage(error),
        details: {
          quotaType: quota.quotaType ?? null,
          current: quota.current ?? null,
          limit: quota.limit ?? null,
          remaining: quota.remaining ?? null,
          resetDate: quota.resetDate ?? null,
        },
      },
    };
  }

  return {
    status: 500,
    body: {
      success: false,
      error: fallbackMessage,
      message: getErrorMessage(error),
    },
  };
}

function formatValidationError(error: z.ZodError<any>) {
  const { fieldErrors, formErrors } = error.flatten();
  return { fieldErrors, formErrors };
}

router.post('/', requirePermission('workflow:deploy'), async (req, res) => {
  const organizationId = (req as any)?.organizationId;
  if (!organizationId) {
    return res.status(400).json({ success: false, error: 'ORGANIZATION_REQUIRED' });
  }

  const parsed = manualRunSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: 'INVALID_REQUEST', details: formatValidationError(parsed.error) });
  }

  const payload = parsed.data;

  try {
    const workflowRecord = await WorkflowRepository.getWorkflowById(payload.workflowId, organizationId);
    if (!workflowRecord || !workflowRecord.graph) {
      return res.status(404).json({ success: false, error: 'WORKFLOW_NOT_FOUND' });
    }

    const { executionId } = await executionQueueService.enqueue({
      workflowId: payload.workflowId,
      organizationId,
      userId: (req as any)?.user?.id,
      triggerType: payload.triggerType ?? 'manual',
      triggerData: payload.triggerData ?? null,
      initialData: payload.initialData,
    });

    auditLogService.record({
      action: 'execution.manual.run',
      route: '/executions',
      organizationId,
      userId: (req as any)?.user?.id ?? null,
      metadata: {
        workflowId: payload.workflowId,
        executionId,
        triggerType: payload.triggerType ?? 'manual',
      },
    });

    logAction({
      type: 'execution_manual_run_enqueued',
      organizationId,
      userId: (req as any)?.user?.id ?? undefined,
      workflowId: payload.workflowId,
      executionId,
      triggerType: payload.triggerType ?? 'manual',
    });

    return res.status(202).json({ success: true, executionId, workflowId: payload.workflowId });
  } catch (error) {
    console.error('Failed to enqueue manual workflow execution:', getErrorMessage(error));
    const mapped = mapEnqueueError(error, 'FAILED_TO_ENQUEUE_EXECUTION');
    return res.status(mapped.status).json(mapped.body);
  }
});

router.post('/dry-run', async (req, res) => {
  const organizationId = (req as any)?.organizationId;
  if (!organizationId) {
    return res.status(400).json({ success: false, error: 'ORGANIZATION_REQUIRED' });
  }

  const parsed = dryRunSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: 'INVALID_REQUEST', details: formatValidationError(parsed.error) });
  }

  const payload = parsed.data;

  try {
    let graphSource: any;

    if (payload.graph) {
      graphSource = sanitizeGraphForExecution(payload.graph);
      graphSource.id = graphSource.id || payload.workflowId;
    } else {
      const workflowRecord = await WorkflowRepository.getWorkflowById(payload.workflowId, organizationId);
      if (!workflowRecord || !workflowRecord.graph) {
        return res.status(404).json({ success: false, error: 'WORKFLOW_NOT_FOUND' });
      }
      graphSource = sanitizeGraphForExecution(workflowRecord.graph);
    }

    if (!graphSource || !Array.isArray(graphSource.nodes) || graphSource.nodes.length === 0) {
      return res.status(400).json({ success: false, error: 'WORKFLOW_GRAPH_EMPTY' });
    }

    const timezone = payload.options?.timezone ?? 'UTC';
    const compilation = productionGraphCompiler.compile(graphSource, {
      includeLogging: true,
      includeErrorHandling: true,
      timezone,
    });

    if (!compilation.success) {
      return res.status(422).json({
        success: false,
        error: 'WORKFLOW_COMPILATION_FAILED',
        details: compilation,
      });
    }

    let deploymentPreview: { success: boolean; logs: string[]; error?: string | null } = {
      success: true,
      logs: [],
      error: null,
    };

    try {
      const previewResult = await productionDeployer.deploy(compilation.files, {
        projectName: graphSource.name || payload.workflowId,
        description: `Dry run preview for workflow ${graphSource.id || payload.workflowId}`,
        dryRun: true,
      });

      deploymentPreview = {
        success: previewResult.success,
        logs: previewResult.logs ?? [],
        error: previewResult.error ?? null,
      };
    } catch (previewError) {
      deploymentPreview = {
        success: false,
        logs: [],
        error: getErrorMessage(previewError),
      };
    }

    const nodes = Array.isArray(graphSource.nodes) ? graphSource.nodes : [];
    const edges = Array.isArray(graphSource.edges) ? graphSource.edges : [];
    const nodeMap = new Map(nodes.map((node: any) => [String(node.id), node]));
    const order = computeExecutionOrder(nodes, edges);
    const runtimeContext = {
      workflowId: graphSource.id || payload.workflowId,
      executionId: `dryrun-${Date.now()}`,
      userId: (req as any)?.user?.id,
      organizationId,
      timezone,
      nodeOutputs: {} as Record<string, any>,
      edges,
    };

    const startedAt = Date.now();
    const results: Record<string, any> = {};
    const nodeSummaries: Array<{ nodeId: string; status: string; label: string }> = [];
    let encounteredError = false;
    const stopOnError = payload.options?.stopOnError ?? false;

    for (const nodeId of order) {
      const node = nodeMap.get(nodeId);
      if (!node) {
        continue;
      }

      const label = node.label || node.data?.label || nodeId;

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
          finishedAt,
        };

        results[nodeId] = {
          status: 'success',
          label,
          result: eventResult,
        };
        nodeSummaries.push({ nodeId, status: 'success', label });
      } catch (error: any) {
        encounteredError = true;
        const isWorkflowError = error instanceof WorkflowNodeExecutionError;
        const summarized = summarizeDryRunError(error);
        const errorPayload = {
          message: summarized.message,
          details: isWorkflowError ? (error as WorkflowNodeExecutionError).details ?? summarized.details : summarized.details,
        };

        results[nodeId] = {
          status: 'error',
          label,
          error: errorPayload,
        };
        nodeSummaries.push({ nodeId, status: 'error', label });

        if (stopOnError) {
          break;
        }
      }
    }

    const completedAt = new Date();
    const finalStatus = encounteredError ? 'failed' : 'completed';
    const summaryMessage = encounteredError ? 'Dry run completed with errors' : 'Dry run completed successfully';

    auditLogService.record({
      action: 'execution.dry_run',
      route: '/executions/dry-run',
      organizationId,
      userId: (req as any)?.user?.id ?? null,
      metadata: {
        workflowId: runtimeContext.workflowId,
        status: finalStatus,
        encounteredError,
      },
    });

    logAction({
      type: 'execution_dry_run_completed',
      workflowId: runtimeContext.workflowId,
      organizationId,
      userId: (req as any)?.user?.id ?? undefined,
      status: finalStatus,
      encounteredError,
    });

    return res.json({
      success: true,
      workflowId: runtimeContext.workflowId,
      execution: {
        executionId: runtimeContext.executionId,
        status: finalStatus,
        summary: summaryMessage,
        startedAt: new Date(startedAt).toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: completedAt.getTime() - startedAt,
        nodes: results,
        order,
      },
      preview: deploymentPreview,
      requiredScopes: compilation.requiredScopes ?? [],
      encounteredError,
      nodes: nodeSummaries,
    });
  } catch (error) {
    console.error('Failed to perform workflow dry run:', getErrorMessage(error));
    return res.status(500).json({ success: false, error: 'FAILED_TO_EXECUTE_DRY_RUN', message: getErrorMessage(error) });
  }
});

router.get('/', async (req, res) => {
  try {
    const organizationId = (req as any)?.organizationId;
    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'ORGANIZATION_REQUIRED' });
    }

    const statusParam = req.query.status;
    const status = Array.isArray(statusParam)
      ? statusParam.map((value) => String(value))
      : statusParam
      ? [String(statusParam)]
      : undefined;

    const tagsParam = req.query.tags;
    const tags = Array.isArray(tagsParam)
      ? tagsParam.map((value) => String(value))
      : typeof tagsParam === 'string'
      ? tagsParam.split(',').map((value) => value.trim()).filter(Boolean)
      : undefined;

    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
    const offset = req.query.offset ? parseInt(String(req.query.offset), 10) : undefined;
    const dateFrom = req.query.dateFrom ? new Date(String(req.query.dateFrom)) : undefined;
    const dateTo = req.query.dateTo ? new Date(String(req.query.dateTo)) : undefined;

    const result = await runExecutionManager.queryExecutions({
      executionId: req.query.executionId ? String(req.query.executionId) : undefined,
      workflowId: req.query.workflowId ? String(req.query.workflowId) : undefined,
      userId: req.query.userId ? String(req.query.userId) : undefined,
      status,
      tags,
      dateFrom: dateFrom && !isNaN(dateFrom.getTime()) ? dateFrom : undefined,
      dateTo: dateTo && !isNaN(dateTo.getTime()) ? dateTo : undefined,
      limit,
      offset,
      sortBy: req.query.sortBy ? (String(req.query.sortBy) as 'startTime' | 'duration' | 'status') : undefined,
      sortOrder: req.query.sortOrder ? (String(req.query.sortOrder) as 'asc' | 'desc') : undefined,
      organizationId,
    });

    res.json({
      success: true,
      executions: result.executions,
      pagination: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        hasMore: result.hasMore,
      },
    });
  } catch (error) {
    console.error('Failed to query executions', error);
    res.status(500).json({ success: false, error: 'Failed to query executions' });
  }
});

router.get('/stats/:timeframe', async (req, res) => {
  try {
    const organizationId = (req as any)?.organizationId;
    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'ORGANIZATION_REQUIRED' });
    }

    const timeframe = req.params.timeframe as 'hour' | 'day' | 'week';
    const stats = await runExecutionManager.getExecutionStats(timeframe, organizationId);
    res.json({ success: true, stats });
  } catch (error) {
    console.error('Failed to get execution stats', error);
    res.status(500).json({ success: false, error: 'Failed to get execution stats' });
  }
});

router.get('/correlation/:correlationId', async (req, res) => {
  try {
    const organizationId = (req as any)?.organizationId;
    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'ORGANIZATION_REQUIRED' });
    }

    const executions = await runExecutionManager.getExecutionsByCorrelation(req.params.correlationId, organizationId);
    res.json({ success: true, executions });
  } catch (error) {
    console.error('Failed to fetch executions by correlation', error);
    res.status(500).json({ success: false, error: 'Failed to fetch executions by correlation' });
  }
});

router.get('/:executionId/nodes', async (req, res) => {
  try {
    const organizationId = (req as any)?.organizationId;
    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'ORGANIZATION_REQUIRED' });
    }

    const execution = await runExecutionManager.getExecution(req.params.executionId, organizationId);
    if (!execution) {
      return res.status(404).json({ success: false, error: 'Execution not found' });
    }

    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
    const offset = req.query.offset ? parseInt(String(req.query.offset), 10) : undefined;
    const result = await runExecutionManager.getNodeExecutions(req.params.executionId, { limit, offset });
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Failed to fetch node executions', error);
    res.status(500).json({ success: false, error: 'Failed to fetch node executions' });
  }
});

router.get('/:executionId', async (req, res) => {
  try {
    const organizationId = (req as any)?.organizationId;
    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'ORGANIZATION_REQUIRED' });
    }

    const execution = await runExecutionManager.getExecution(req.params.executionId, organizationId);
    if (!execution) {
      return res.status(404).json({ success: false, error: 'Execution not found' });
    }
    res.json({ success: true, execution });
  } catch (error) {
    console.error('Failed to get execution', error);
    res.status(500).json({ success: false, error: 'Failed to get execution' });
  }
});

router.post('/:executionId/retry', async (req, res) => {
  try {
    const organizationId = (req as any)?.organizationId;
    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'ORGANIZATION_REQUIRED' });
    }

    const execution = await runExecutionManager.getExecution(req.params.executionId, organizationId);
    if (!execution) {
      return res.status(404).json({ success: false, error: 'Execution not found' });
    }

    const reason = typeof (req.body as any)?.reason === 'string' ? String((req.body as any).reason) : undefined;
    const userId = (req as any)?.user?.id ? String((req as any).user.id) : undefined;

    const { executionId: replayExecutionId } = await executionReplayService.replayExecution({
      executionId: req.params.executionId,
      organizationId,
      userId,
      reason,
    });

    res.json({ success: true, executionId: replayExecutionId });
  } catch (error) {
    console.error('Failed to schedule execution retry', error);
    const mapped = mapEnqueueError(error, 'FAILED_TO_SCHEDULE_RETRY');
    res.status(mapped.status).json(mapped.body);
  }
});

router.post('/:executionId/nodes/:nodeId/retry', async (req, res) => {
  try {
    const organizationId = (req as any)?.organizationId;
    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'ORGANIZATION_REQUIRED' });
    }

    const execution = await runExecutionManager.getExecution(req.params.executionId, organizationId);
    if (!execution) {
      return res.status(404).json({ success: false, error: 'Execution not found' });
    }

    const reason = typeof (req.body as any)?.reason === 'string' ? String((req.body as any).reason) : undefined;
    const userId = (req as any)?.user?.id ? String((req as any).user.id) : undefined;

    const { executionId: replayExecutionId } = await executionReplayService.replayExecution({
      executionId: req.params.executionId,
      organizationId,
      nodeId: req.params.nodeId,
      userId,
      reason,
    });

    try {
      await retryManager.replayFromDLQ(req.params.executionId, req.params.nodeId);
    } catch (dlqError) {
      console.warn('Failed to clear DLQ item after scheduling node replay', dlqError);
    }

    res.json({ success: true, executionId: replayExecutionId });
  } catch (error) {
    console.error('Failed to retry node execution', error);
    const mapped = mapEnqueueError(error, 'FAILED_TO_RETRY_NODE');
    res.status(mapped.status).json(mapped.body);
  }
});

export default router;
