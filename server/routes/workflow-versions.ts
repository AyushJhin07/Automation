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

router.post('/:workflowId/versions/:versionId/promote', async (req, res) => {
  try {
    const organizationId = requireOrganizationContext(req, res);
    if (!organizationId) {
      return;
    }

    const target = typeof req.body?.target === 'string' ? req.body.target : 'test';
    const metadata = req.body?.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : null;
    const allowBreakingChanges = req.body?.allowBreakingChanges === true;

    const promotion = await WorkflowRepository.promoteVersionToEnvironment({
      workflowId: req.params.workflowId,
      organizationId,
      versionId: req.params.versionId,
      targetEnvironment: target,
      userId: (req as any)?.user?.id,
      metadata,
      allowBreakingChanges,
    });

    res.json({ success: true, deployment: promotion.deployment, version: promotion.version });
  } catch (error: any) {
    console.error('❌ Failed to promote workflow version:', error);
    res.status(400).json({ success: false, error: error?.message ?? 'Failed to promote workflow version' });
  }
});

router.post('/:workflowId/versions/:versionId/validate', async (req, res) => {
  try {
    const organizationId = requireOrganizationContext(req, res);
    if (!organizationId) {
      return;
    }

    const targetEnvironment = typeof req.body?.targetEnvironment === 'string' ? req.body.targetEnvironment : 'test';

    const result = await WorkflowRepository.getVersionDiffAgainstEnvironment({
      workflowId: req.params.workflowId,
      organizationId,
      versionId: req.params.versionId,
      targetEnvironment,
    });

    res.json({
      success: true,
      diff: result.summary,
      environment: result.environment,
      activeDeployment: result.activeDeployment,
      activeVersion: result.activeVersion,
      version: result.version,
    });
  } catch (error: any) {
    console.error('❌ Failed to validate workflow migration:', error);
    res.status(400).json({ success: false, error: error?.message ?? 'Failed to validate workflow migration' });
  }
});

export default router;
