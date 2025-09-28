/**
 * ChatGPT Fix: Flow Storage API for AI Builder → Graph Editor Flow
 * 
 * Simple in-memory flow storage to persist generated workflows
 * for seamless handoff between AI Builder and Graph Editor.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';

import { WorkflowRepository } from '../workflow/WorkflowRepository.js';

const router = Router();

const persistFlow = async (req: Request, res: Response) => {
  try {
    const payload = req.body ?? {};
    const graph = payload.graph ?? payload;
    const providedId = typeof payload.id === 'string' ? payload.id : (typeof payload.workflowId === 'string' ? payload.workflowId : undefined);

    const saved = await WorkflowRepository.saveWorkflowGraph({
      id: providedId,
      userId: payload.userId ?? (req as any)?.user?.id,
      name: payload.name ?? graph?.name ?? 'Untitled Workflow',
      description: payload.description ?? graph?.description ?? payload?.metadata?.description ?? null,
      graph,
      metadata: payload.metadata ?? graph?.metadata ?? null,
      category: payload.category ?? graph?.category ?? null,
      tags: payload.tags ?? graph?.tags ?? null,
    });

    res.json({
      success: true,
      workflowId: saved.id,
      workflow: saved,
    });
  } catch (error: any) {
    console.error('❌ Failed to persist flow:', error);
    res.status(500).json({
      success: false,
      error: error?.message || 'Failed to persist flow',
    });
  }
};

router.post('/', persistFlow);
router.post('/save', persistFlow);

router.put('/:id', async (req, res) => {
  try {
    req.body = { ...(req.body ?? {}), id: req.params.id };
    await persistFlow(req, res);
  } catch (error: any) {
    console.error('❌ Failed to update flow:', error);
    res.status(500).json({
      success: false,
      error: error?.message || 'Failed to update flow',
    });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const workflow = await WorkflowRepository.getWorkflowById(req.params.id);

    if (!workflow) {
      return res.status(404).json({
        success: false,
        error: 'Flow not found',
      });
    }

    console.log(`📋 Flow retrieved: ${req.params.id}`);

    res.json({
      success: true,
      workflow,
    });
  } catch (error: any) {
    console.error('❌ Failed to retrieve flow:', error);
    res.status(500).json({
      success: false,
      error: error?.message || 'Failed to retrieve flow',
    });
  }
});

router.get('/', async (req, res) => {
  try {
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
    const offset = typeof req.query.offset === 'string' ? Number(req.query.offset) : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const userId = typeof req.query.userId === 'string' ? req.query.userId : (req as any)?.user?.id;

    const { workflows, total, limit: resolvedLimit, offset: resolvedOffset } = await WorkflowRepository.listWorkflows({
      limit,
      offset,
      search,
      userId,
    });

    const flows = workflows.map((workflow) => ({
      id: workflow.id,
      name: (workflow as any)?.graph?.name ?? workflow.name,
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
      nodeCount: Array.isArray((workflow as any)?.graph?.nodes)
        ? (workflow as any).graph.nodes.length
        : Array.isArray((workflow as any)?.nodes)
          ? (workflow as any).nodes.length
          : 0,
      workflow,
    }));

    res.json({
      success: true,
      flows,
      pagination: {
        total,
        limit: resolvedLimit,
        offset: resolvedOffset,
      },
    });
  } catch (error: any) {
    console.error('❌ Failed to list flows:', error);
    res.status(500).json({
      success: false,
      error: error?.message || 'Failed to list flows',
    });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const deleted = await WorkflowRepository.deleteWorkflow(req.params.id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Flow not found',
      });
    }

    console.log(`🗑️ Flow deleted: ${req.params.id}`);

    res.json({
      success: true,
      message: 'Flow deleted successfully',
    });
  } catch (error: any) {
    console.error('❌ Failed to delete flow:', error);
    res.status(500).json({
      success: false,
      error: error?.message || 'Failed to delete flow',
    });
  }
});

export default router;