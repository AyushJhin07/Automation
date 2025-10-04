import { Router } from 'express';

import { runExecutionManager } from '../core/RunExecutionManager.js';
import { retryManager } from '../core/RetryManager.js';

const router = Router();

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
    // TODO: wire to workflow runtime when retry orchestration is implemented
    res.json({ success: true, message: 'Retry scheduled' });
  } catch (error) {
    console.error('Failed to schedule execution retry', error);
    res.status(500).json({ success: false, error: 'Failed to schedule execution retry' });
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

    await retryManager.replayFromDLQ(req.params.executionId, req.params.nodeId);
    res.json({ success: true, message: 'Node retry scheduled' });
  } catch (error) {
    console.error('Failed to retry node execution', error);
    res.status(500).json({ success: false, error: 'Failed to retry node execution' });
  }
});

export default router;
