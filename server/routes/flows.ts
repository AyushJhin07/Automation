/**
 * ChatGPT Fix: Flow Storage API for AI Builder → Graph Editor Flow
 * 
 * Simple in-memory flow storage to persist generated workflows
 * for seamless handoff between AI Builder and Graph Editor.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

import { WorkflowRepository } from '../workflow/WorkflowRepository.js';
import {
  applyResolvedOrganizationToRequest,
  resolveOrganizationContext,
} from '../utils/organizationContext.js';

const router = Router();

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const persistFlow = async (req: Request, res: Response) => {
  try {
    const organizationContext = resolveOrganizationContext(req, res);
    if (!organizationContext.organizationId) {
      return;
    }

    applyResolvedOrganizationToRequest(req, organizationContext);

    const payload = req.body ?? {};
    const graph = payload.graph ?? payload;
    const providedId =
      typeof payload.id === 'string'
        ? payload.id
        : typeof payload.workflowId === 'string'
          ? payload.workflowId
          : undefined;
    const resolvedId = providedId && uuidRegex.test(providedId) ? providedId : randomUUID();

    if (payload && typeof payload === 'object') {
      payload.id = resolvedId;
      payload.workflowId = resolvedId;
    }

    if (graph && typeof graph === 'object') {
      graph.id = resolvedId;
    }

    const saved = await WorkflowRepository.saveWorkflowGraph({
      id: resolvedId,
      userId: (req as any)?.user?.id ?? payload.userId,
      organizationId: organizationContext.organizationId,
      name: payload.name ?? graph?.name ?? 'Untitled Workflow',
      description: payload.description ?? graph?.description ?? payload?.metadata?.description ?? null,
      graph,
      metadata: payload.metadata ?? graph?.metadata ?? null,
      category: payload.category ?? graph?.category ?? null,
      tags: payload.tags ?? graph?.tags ?? null,
    });

    res.json({
      success: true,
      id: saved.id,
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
    const organizationContext = resolveOrganizationContext(req, res);
    if (!organizationContext.organizationId) {
      return;
    }

    applyResolvedOrganizationToRequest(req, organizationContext);

    const workflow = await WorkflowRepository.getWorkflowById(
      req.params.id,
      organizationContext.organizationId,
    );

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
    const organizationContext = resolveOrganizationContext(req, res);
    if (!organizationContext.organizationId) {
      return;
    }

    applyResolvedOrganizationToRequest(req, organizationContext);

    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
    const offset = typeof req.query.offset === 'string' ? Number(req.query.offset) : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const userId = typeof req.query.userId === 'string' ? req.query.userId : (req as any)?.user?.id;

    const { workflows, total, limit: resolvedLimit, offset: resolvedOffset } = await WorkflowRepository.listWorkflows({
      limit,
      offset,
      search,
      userId,
      organizationId: organizationContext.organizationId,
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
    const organizationContext = resolveOrganizationContext(req, res);
    if (!organizationContext.organizationId) {
      return;
    }

    applyResolvedOrganizationToRequest(req, organizationContext);

    const deleted = await WorkflowRepository.deleteWorkflow(
      req.params.id,
      organizationContext.organizationId,
    );

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
