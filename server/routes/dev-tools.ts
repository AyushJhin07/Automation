import { Router } from 'express';
import { randomUUID } from 'crypto';
import { optionalAuth } from '../middleware/auth.js';
import { getErrorMessage } from '../types/common.js';
import { WorkflowRepository } from '../workflow/WorkflowRepository.js';
import { workflowRuntime } from '../core/WorkflowRuntime.js';

export const devToolsRouter = Router();

devToolsRouter.post('/run-direct', optionalAuth, async (req, res) => {
  if ((process.env.NODE_ENV || 'development') !== 'development') {
    return res.status(404).json({ success: false, error: 'Not available outside development' });
  }

  const body = req.body ?? {};
  const workflowId = typeof body.workflowId === 'string' ? body.workflowId.trim() : '';
  const organizationId = (req as any)?.organizationId || (req.user?.organizationId ?? req.user?.activeOrganization?.id);

  if (!workflowId && !body.graph) {
    return res.status(400).json({ success: false, error: 'Provide workflowId or graph' });
  }
  if (!organizationId) {
    return res.status(400).json({ success: false, error: 'Organization context required' });
  }

  try {
    const graph = body.graph || (await WorkflowRepository.getWorkflowById(workflowId, organizationId))?.graph;
    if (!graph) {
      return res.status(404).json({ success: false, error: 'Workflow graph not found' });
    }

    const executionId = randomUUID();
    const result = await workflowRuntime.executeWorkflow(
      graph,
      body.initialData ?? {},
      req.user?.id ?? 'dev-runner',
      {
        executionId,
        triggerType: typeof body.triggerType === 'string' ? body.triggerType : 'manual',
        organizationId,
        mode: 'workflow',
      }
    );

    return res.json({ success: result.success, status: result.status, executionId, result });
  } catch (error) {
    return res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

export default devToolsRouter;
