import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import webhookAdminRoutes from '../webhooks-admin.js';
import { webhookManager } from '../../webhooks/WebhookManager.js';

const organizationId = 'org-webhook-admin';
const userId = 'user-webhook-admin';

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (req as any).organizationId = organizationId;
  (req as any).organizationStatus = 'active';
  (req as any).user = { id: userId };
  (req as any).permissions = ['workflow:view', 'workflow:deploy'];
  next();
});
app.use('/api/webhooks/admin', webhookAdminRoutes);

const server: Server = await new Promise((resolve) => {
  const listener = app.listen(0, () => resolve(listener));
});
server.unref();

try {
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const original = {
    listWebhooks: webhookManager.listWebhooks,
    listPollingTriggers: webhookManager.listPollingTriggers,
    getWebhook: webhookManager.getWebhook,
    deactivateWebhook: webhookManager.deactivateWebhook,
    removeWebhook: webhookManager.removeWebhook,
    getInitializationError: webhookManager.getInitializationError,
    getStats: webhookManager.getStats,
    getWorkerRegion: webhookManager.getWorkerRegion,
    getSupportedRegions: webhookManager.getSupportedRegions,
  } as Record<string, any>;

  try {
    (webhookManager as any).listWebhooks = () => [
      {
        id: 'whk-1',
        workflowId: 'wf-1',
        appId: 'slack',
        triggerId: 'event',
        endpoint: '/api/webhooks/whk-1',
        isActive: true,
        region: 'us',
        lastTriggered: new Date('2024-04-10T00:00:00Z'),
        organizationId,
      },
      {
        id: 'whk-ignored',
        workflowId: 'wf-2',
        appId: 'gmail',
        triggerId: 'event',
        endpoint: '/api/webhooks/whk-ignored',
        isActive: true,
        organizationId: 'someone-else',
      },
    ];

    (webhookManager as any).listPollingTriggers = () => [
      {
        id: 'poll-1',
        workflowId: 'wf-1',
        appId: 'sheets',
        triggerId: 'check_updates',
        interval: 300,
        nextPoll: new Date('2024-04-11T00:00:00Z'),
        lastPoll: null,
        isActive: true,
        region: 'us',
        lastStatus: null,
        organizationId,
      },
      {
        id: 'poll-ignored',
        workflowId: 'wf-2',
        appId: 'sheets',
        triggerId: 'ignored',
        interval: 300,
        nextPoll: new Date(),
        lastPoll: null,
        isActive: true,
        organizationId: 'other-org',
      },
    ];

    (webhookManager as any).getWebhook = (id: string) => {
      if (id === 'whk-1') {
        return {
          id: 'whk-1',
          workflowId: 'wf-1',
          organizationId,
        };
      }
      return undefined;
    };

    (webhookManager as any).deactivateWebhook = async () => true;
    (webhookManager as any).removeWebhook = async () => true;
    (webhookManager as any).getInitializationError = () => null;
    (webhookManager as any).getStats = () => ({
      activeWebhooks: 1,
      pollingTriggers: 1,
      dedupeEntries: null,
      webhooks: [],
    });
    (webhookManager as any).getWorkerRegion = () => 'us';
    (webhookManager as any).getSupportedRegions = () => ['us', 'eu'];

    const listResponse = await fetch(`${baseUrl}/api/webhooks/admin/listeners`);
    assert.equal(listResponse.status, 200, 'listeners endpoint should respond with 200');
    const listBody = await listResponse.json();
    assert.equal(listBody.success, true);
    assert.equal(listBody.listeners.webhooks.length, 1, 'should include only org webhooks');
    assert.equal(listBody.listeners.polling.length, 1, 'should include only org polling triggers');

    const deactivateResponse = await fetch(`${baseUrl}/api/webhooks/admin/listeners/whk-1/deactivate`, {
      method: 'POST',
    });
    assert.equal(deactivateResponse.status, 200, 'deactivate should succeed');
    const deactivateBody = await deactivateResponse.json();
    assert.equal(deactivateBody.success, true);
    assert.equal(deactivateBody.deactivated, true);

    const removeResponse = await fetch(`${baseUrl}/api/webhooks/admin/listeners/whk-1`, {
      method: 'DELETE',
    });
    assert.equal(removeResponse.status, 200, 'remove should succeed');
    const removeBody = await removeResponse.json();
    assert.equal(removeBody.success, true);
    assert.equal(removeBody.removed, true);

    const healthResponse = await fetch(`${baseUrl}/api/webhooks/admin/health`);
    assert.equal(healthResponse.status, 200, 'health endpoint should respond with 200');
    const healthBody = await healthResponse.json();
    assert.equal(healthBody.success, true);
    assert.equal(healthBody.region, 'us');
    assert.deepEqual(healthBody.supportedRegions, ['us', 'eu']);
  } finally {
    Object.entries(original).forEach(([key, value]) => {
      (webhookManager as any)[key] = value;
    });
  }
} finally {
  server.close();
}

console.log('Webhook admin routes tests passed.');
process.exit(0);
