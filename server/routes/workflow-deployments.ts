import { Router } from 'express';
import type { Request, Response } from 'express';

import { WorkflowRepository } from '../workflow/WorkflowRepository.js';

const router = Router();

const requireOrganizationContext = (req: Request, res: Response): string | null => {
  const organizationId = (req as any)?.organizationId;
  const organizationStatus = (req as any)?.organizationStatus;

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

router.post('/:workflowId/publish', async (req, res) => {
  try {
    const organizationId = requireOrganizationContext(req, res);
    if (!organizationId) {
      return;
    }

    const environment = typeof req.body?.environment === 'string' ? req.body.environment : 'prod';
    const versionId = typeof req.body?.versionId === 'string' ? req.body.versionId : undefined;
    const metadata = req.body?.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : null;

    const result = await WorkflowRepository.publishWorkflowVersion({
      workflowId: req.params.workflowId,
      organizationId,
      environment,
      versionId,
      userId: (req as any)?.user?.id,
      metadata,
    });

    res.json({ success: true, deployment: result.deployment, version: result.version });
  } catch (error: any) {
    console.error('❌ Failed to publish workflow version:', error);
    res.status(400).json({ success: false, error: error?.message || 'Failed to publish workflow version' });
  }
});

router.get('/:workflowId/diff/:environment', async (req, res) => {
  try {
    const organizationId = requireOrganizationContext(req, res);
    if (!organizationId) {
      return;
    }

    const diff = await WorkflowRepository.getWorkflowDiff({
      workflowId: req.params.workflowId,
      organizationId,
      environment: req.params.environment,
    });

    res.json({ success: true, diff });
  } catch (error: any) {
    console.error('❌ Failed to compute workflow diff:', error);
    res.status(400).json({ success: false, error: error?.message || 'Failed to compute workflow diff' });
  }
});

router.post('/:workflowId/rollback', async (req, res) => {
  try {
    const organizationId = requireOrganizationContext(req, res);
    if (!organizationId) {
      return;
    }

    const environment = typeof req.body?.environment === 'string' ? req.body.environment : undefined;
    if (!environment) {
      return res.status(400).json({ success: false, error: 'Environment is required for rollback' });
    }

    const deploymentId = typeof req.body?.deploymentId === 'string' ? req.body.deploymentId : undefined;
    const metadata = req.body?.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : null;

    const result = await WorkflowRepository.rollbackDeployment({
      workflowId: req.params.workflowId,
      organizationId,
      environment,
      userId: (req as any)?.user?.id,
      deploymentId,
      metadata,
    });

    if (!result) {
      return res.status(404).json({ success: false, error: 'No deployment history available to rollback' });
    }

    res.json({ success: true, deployment: result.deployment, version: result.version });
  } catch (error: any) {
    console.error('❌ Failed to rollback workflow deployment:', error);
    res.status(400).json({ success: false, error: error?.message || 'Failed to rollback workflow deployment' });
  }
});

export default router;
