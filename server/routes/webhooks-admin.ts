import { Router } from 'express';

import { webhookManager } from '../webhooks/WebhookManager.js';
import { getActiveQueueDriver } from '../queue/index.js';
import { requirePermission } from '../middleware/auth.js';
import { auditLogService } from '../services/AuditLogService.js';
import { logAction } from '../utils/actionLog.js';
import { getErrorMessage } from '../types/common.js';

const router = Router();

router.get('/listeners', async (req, res) => {
  const organizationId = (req as any)?.organizationId;
  if (!organizationId) {
    return res.status(400).json({ success: false, error: 'ORGANIZATION_REQUIRED' });
  }

  try {
    const webhooks = webhookManager
      .listWebhooks()
      .filter((entry) => !entry.organizationId || entry.organizationId === organizationId)
      .map((entry) => ({
        id: entry.id,
        workflowId: entry.workflowId,
        appId: entry.appId,
        triggerId: entry.triggerId,
        endpoint: entry.endpoint,
        isActive: entry.isActive !== false,
        region: entry.region ?? null,
        lastTriggered: entry.lastTriggered ? entry.lastTriggered.toISOString() : null,
      }));

    const polling = webhookManager
      .listPollingTriggers()
      .filter((entry) => !entry.organizationId || entry.organizationId === organizationId)
      .map((entry) => ({
        id: entry.id,
        workflowId: entry.workflowId,
        appId: entry.appId,
        triggerId: entry.triggerId,
        interval: entry.interval,
        nextPoll: entry.nextPoll?.toISOString?.() ?? null,
        lastPoll: entry.lastPoll ? entry.lastPoll.toISOString() : null,
        isActive: entry.isActive !== false,
        region: entry.region ?? null,
        status: entry.lastStatus ?? null,
      }));

    return res.json({
      success: true,
      listeners: {
        webhooks,
        polling,
      },
    });
  } catch (error) {
    console.error('Failed to list webhook listeners:', getErrorMessage(error));
    return res.status(500).json({ success: false, error: 'FAILED_TO_LIST_LISTENERS', message: getErrorMessage(error) });
  }
});

router.post('/listeners/:webhookId/deactivate', requirePermission('workflow:deploy'), async (req, res) => {
  const organizationId = (req as any)?.organizationId;
  if (!organizationId) {
    return res.status(400).json({ success: false, error: 'ORGANIZATION_REQUIRED' });
  }

  const webhook = webhookManager.getWebhook(req.params.webhookId);
  if (!webhook || (webhook.organizationId && webhook.organizationId !== organizationId)) {
    return res.status(404).json({ success: false, error: 'WEBHOOK_NOT_FOUND' });
  }

  try {
    const deactivated = await webhookManager.deactivateWebhook(req.params.webhookId);

    auditLogService.record({
      action: 'webhook.deactivate',
      route: '/webhooks/admin/listeners/:webhookId/deactivate',
      organizationId,
      userId: (req as any)?.user?.id ?? null,
      metadata: {
        webhookId: req.params.webhookId,
        workflowId: webhook.workflowId,
        deactivated,
      },
    });

    logAction({
      type: 'webhook_deactivated',
      organizationId,
      userId: (req as any)?.user?.id ?? undefined,
      workflowId: webhook.workflowId,
      webhookId: req.params.webhookId,
      deactivated,
    });

    return res.json({ success: true, webhookId: req.params.webhookId, deactivated });
  } catch (error) {
    console.error('Failed to deactivate webhook listener:', getErrorMessage(error));
    return res.status(500).json({ success: false, error: 'FAILED_TO_DEACTIVATE_WEBHOOK', message: getErrorMessage(error) });
  }
});

router.delete('/listeners/:webhookId', requirePermission('workflow:deploy'), async (req, res) => {
  const organizationId = (req as any)?.organizationId;
  if (!organizationId) {
    return res.status(400).json({ success: false, error: 'ORGANIZATION_REQUIRED' });
  }

  const webhook = webhookManager.getWebhook(req.params.webhookId);
  if (!webhook || (webhook.organizationId && webhook.organizationId !== organizationId)) {
    return res.status(404).json({ success: false, error: 'WEBHOOK_NOT_FOUND' });
  }

  try {
    const removed = await webhookManager.removeWebhook(req.params.webhookId);

    auditLogService.record({
      action: 'webhook.remove',
      route: '/webhooks/admin/listeners/:webhookId',
      organizationId,
      userId: (req as any)?.user?.id ?? null,
      metadata: {
        webhookId: req.params.webhookId,
        workflowId: webhook.workflowId,
        removed,
      },
    });

    logAction({
      type: 'webhook_removed',
      organizationId,
      userId: (req as any)?.user?.id ?? undefined,
      workflowId: webhook.workflowId,
      webhookId: req.params.webhookId,
      removed,
    });

    return res.json({ success: true, webhookId: req.params.webhookId, removed });
  } catch (error) {
    console.error('Failed to remove webhook listener:', getErrorMessage(error));
    return res.status(500).json({ success: false, error: 'FAILED_TO_REMOVE_WEBHOOK', message: getErrorMessage(error) });
  }
});

router.get('/health', async (req, res) => {
  const organizationId = (req as any)?.organizationId;
  if (!organizationId) {
    return res.status(400).json({ success: false, error: 'ORGANIZATION_REQUIRED' });
  }

  try {
    const initializationError = webhookManager.getInitializationError?.();
    const stats = webhookManager.getStats();
    const queueDriver = getActiveQueueDriver();
    const region = webhookManager.getWorkerRegion();
    const supportedRegions = webhookManager.getSupportedRegions();

    const status = initializationError ? 'degraded' : 'healthy';

    return res.json({
      success: true,
      status,
      initializationError: initializationError ?? null,
      stats,
      queueDriver,
      region,
      supportedRegions,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Failed to compute webhook health:', getErrorMessage(error));
    return res.status(500).json({ success: false, error: 'FAILED_TO_COMPUTE_HEALTH', message: getErrorMessage(error) });
  }
});

export default router;
