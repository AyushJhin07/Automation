import { Router } from 'express';
import { runExecutionManager } from '../core/RunExecutionManager';
import type { ExecutionQuery } from '../core/RunExecutionManager';
import { retryManager } from '../core/RetryManager';

const executionsRouter = Router();

executionsRouter.get('/', async (req, res) => {
  try {
    const {
      executionId,
      workflowId,
      userId,
      status,
      dateFrom,
      dateTo,
      tags,
      limit,
      offset,
      sortBy,
      sortOrder,
    } = req.query;

    const result = await runExecutionManager.queryExecutions({
      executionId: executionId as string | undefined,
      workflowId: workflowId as string | undefined,
      userId: userId as string | undefined,
      status: typeof status === 'string' && status.length > 0 ? status.split(',') : undefined,
      dateFrom: typeof dateFrom === 'string' ? new Date(dateFrom) : undefined,
      dateTo: typeof dateTo === 'string' ? new Date(dateTo) : undefined,
      tags: typeof tags === 'string' && tags.length > 0 ? tags.split(',') : undefined,
      limit: typeof limit === 'string' ? Number.parseInt(limit, 10) : undefined,
      offset: typeof offset === 'string' ? Number.parseInt(offset, 10) : undefined,
      sortBy: sortBy as ExecutionQuery['sortBy'],
      sortOrder: sortOrder as ExecutionQuery['sortOrder'],
    });

    res.json(result);
  } catch (error) {
    console.error('Failed to query executions', error);
    res.status(500).json({ error: 'Failed to query executions' });
  }
});

executionsRouter.get('/stats/:timeframe', async (req, res) => {
  try {
    const stats = await runExecutionManager.getExecutionStats(req.params.timeframe as 'hour' | 'day' | 'week');
    res.json(stats);
  } catch (error) {
    console.error('Failed to load execution stats', error);
    res.status(500).json({ error: 'Failed to load execution stats' });
  }
});

executionsRouter.get('/dlq', async (_req, res) => {
  try {
    const items = retryManager.getDLQItems();
    res.json({ items });
  } catch (error) {
    console.error('Failed to load DLQ items', error);
    res.status(500).json({ error: 'Failed to load DLQ items' });
  }
});

executionsRouter.get('/:executionId', async (req, res) => {
  try {
    const execution = await runExecutionManager.getExecution(req.params.executionId);
    if (!execution) {
      return res.status(404).json({ error: 'Execution not found' });
    }

    res.json(execution);
  } catch (error) {
    console.error('Failed to load execution', error);
    res.status(500).json({ error: 'Failed to load execution' });
  }
});

executionsRouter.get('/:executionId/nodes', async (req, res) => {
  try {
    const execution = await runExecutionManager.getExecution(req.params.executionId);
    if (!execution) {
      return res.status(404).json({ error: 'Execution not found' });
    }

    res.json({ nodes: execution.nodeExecutions });
  } catch (error) {
    console.error('Failed to load node executions', error);
    res.status(500).json({ error: 'Failed to load node executions' });
  }
});

executionsRouter.get('/:executionId/timeline', async (req, res) => {
  try {
    const execution = await runExecutionManager.getExecution(req.params.executionId);
    if (!execution) {
      return res.status(404).json({ error: 'Execution not found' });
    }

    res.json({ timeline: execution.timeline });
  } catch (error) {
    console.error('Failed to load execution timeline', error);
    res.status(500).json({ error: 'Failed to load execution timeline' });
  }
});

executionsRouter.post('/:executionId/retry', async (req, res) => {
  try {
    const execution = await runExecutionManager.getExecution(req.params.executionId);
    if (!execution) {
      return res.status(404).json({ error: 'Execution not found' });
    }

    // TODO: implement full retry semantics
    res.json({ success: true, message: 'Retry scheduled' });
  } catch (error) {
    console.error('Failed to schedule execution retry', error);
    res.status(500).json({ error: 'Failed to schedule execution retry' });
  }
});

executionsRouter.post('/:executionId/nodes/:nodeId/retry', async (req, res) => {
  try {
    await retryManager.replayFromDLQ(req.params.executionId, req.params.nodeId);
    res.json({ success: true, message: 'Node retry scheduled' });
  } catch (error) {
    console.error('Failed to schedule node retry', error);
    res.status(500).json({ error: 'Failed to schedule node retry' });
  }
});

export default executionsRouter;
