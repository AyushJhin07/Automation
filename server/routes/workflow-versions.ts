import { Router } from 'express';
import type { Request, Response } from 'express';

import { WorkflowRepository } from '../workflow/WorkflowRepository.js';
import {
  applyResolvedOrganizationToRequest,
  resolveOrganizationContext,
} from '../utils/organizationContext.js';

const router = Router();

router.post('/:workflowId/versions/:versionId/promote', async (req, res) => {
  try {
    const organizationContext = resolveOrganizationContext(req, res);
    if (!organizationContext.organizationId) {
      return;
    }

    applyResolvedOrganizationToRequest(req, organizationContext);

    const target = typeof req.body?.target === 'string' ? req.body.target : 'test';
    const metadata = req.body?.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : null;
    const allowBreakingChanges = req.body?.allowBreakingChanges === true;

    const promotion = await WorkflowRepository.promoteVersionToEnvironment({
      workflowId: req.params.workflowId,
      organizationId: organizationContext.organizationId!,
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
    const organizationContext = resolveOrganizationContext(req, res);
    if (!organizationContext.organizationId) {
      return;
    }

    applyResolvedOrganizationToRequest(req, organizationContext);

    const targetEnvironment = typeof req.body?.targetEnvironment === 'string' ? req.body.targetEnvironment : 'test';

    const result = await WorkflowRepository.getVersionDiffAgainstEnvironment({
      workflowId: req.params.workflowId,
      organizationId: organizationContext.organizationId!,
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
