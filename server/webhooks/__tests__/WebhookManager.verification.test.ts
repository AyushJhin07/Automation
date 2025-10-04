import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { TriggerPersistenceService } from '../../services/TriggerPersistenceService.js';

process.env.NODE_ENV = 'test';

class InMemoryTriggerPersistenceDb {
  public workflowTriggers = new Map<string, any>();
  public pollingTriggers = new Map<string, any>();
  public webhookLogs = new Map<string, any>();
  public dedupeTokens = new Map<string, { token: string; createdAt: Date; expiresAt?: Date }[]>();

  async getActiveWebhookTriggers() {
    return Array.from(this.workflowTriggers.values()).filter((row) => row.type === 'webhook' && row.isActive);
  }

  async getActivePollingTriggers() {
    return Array.from(this.pollingTriggers.values()).filter((row) => row.isActive);
  }

  async upsertWorkflowTrigger(record: any) {
    const existing = this.workflowTriggers.get(record.id) ?? {};
    const next = {
      ...existing,
      ...record,
      metadata: record.metadata ?? existing.metadata ?? {},
      dedupeState: record.dedupeState ?? existing.dedupeState ?? null,
      isActive: record.isActive ?? existing.isActive ?? true,
      updatedAt: new Date(),
      createdAt: existing.createdAt ?? new Date(),
    };
    this.workflowTriggers.set(record.id, next);
  }

  async upsertPollingTrigger(record: any) {
    const existing = this.pollingTriggers.get(record.id) ?? {};
    const next = {
      ...existing,
      ...record,
      metadata: record.metadata ?? existing.metadata ?? {},
      isActive: record.isActive ?? existing.isActive ?? true,
      nextPollAt:
        record.nextPollAt ??
        existing.nextPollAt ??
        (record.nextPoll ? new Date(record.nextPoll) : new Date(Date.now() + (record.interval ?? existing.interval ?? 60) * 1000)),
      updatedAt: new Date(),
      createdAt: existing.createdAt ?? new Date(),
    };
    this.pollingTriggers.set(record.id, next);
  }

  async updatePollingRuntimeState(_: any) {}

  async deactivateTrigger(id: string) {
    const workflow = this.workflowTriggers.get(id);
    if (workflow) {
      workflow.isActive = false;
      workflow.updatedAt = new Date();
      this.workflowTriggers.set(id, workflow);
    }
  }

  async logWebhookEvent(event: any) {
    const id = event.id ?? crypto.randomUUID();
    this.webhookLogs.set(id, {
      ...event,
      processed: event.processed ?? false,
      executionId: event.executionId ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return id;
  }

  async markWebhookEventProcessed(id: string | null, result: { success: boolean; error?: string }) {
    if (!id) {
      return;
    }
    const existing = this.webhookLogs.get(id);
    if (!existing) {
      return;
    }
    existing.processed = result.success;
    existing.error = result.success ? null : result.error ?? null;
    existing.updatedAt = new Date();
    this.webhookLogs.set(id, existing);
  }

  async getDedupeTokens() {
    return {};
  }

  async persistDedupeTokens() {}

  async recordWebhookDedupeEntry({
    webhookId,
    providerId,
    token,
    ttlMs,
    createdAt,
  }: {
    webhookId: string;
    providerId?: string;
    token: string;
    ttlMs: number;
    createdAt?: Date;
  }): Promise<'recorded' | 'duplicate'> {
    const key = providerId ? `${webhookId}::${providerId}` : webhookId;
    const now = createdAt instanceof Date && !Number.isNaN(createdAt.getTime()) ? createdAt : new Date();
    const ttl = ttlMs > 0 ? ttlMs : TriggerPersistenceService.DEFAULT_DEDUPE_TOKEN_TTL_MS;
    const cutoff = ttl > 0 ? now.getTime() - ttl : null;

    const existing = this.dedupeTokens.get(key) ?? [];
    const filtered = existing.filter((entry) => {
      if (entry.expiresAt) {
        return entry.expiresAt.getTime() >= now.getTime();
      }
      if (cutoff === null) {
        return true;
      }
      return entry.createdAt.getTime() >= cutoff;
    });

    if (filtered.some((entry) => entry.token === token)) {
      this.dedupeTokens.set(key, filtered);
      return 'duplicate';
    }

    filtered.push({ token, createdAt: now, expiresAt: ttl > 0 ? new Date(now.getTime() + ttl) : undefined });
    filtered.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    if (filtered.length > 500) {
      filtered.splice(0, filtered.length - 500);
    }

    this.dedupeTokens.set(key, filtered);
    return 'recorded';
  }

  async listDuplicateWebhookEvents(): Promise<Array<{ id: string; webhookId: string; timestamp: Date; error: string }>> {
    return [];
  }

  reset(): void {
    this.workflowTriggers.clear();
    this.pollingTriggers.clear();
    this.webhookLogs.clear();
    this.dedupeTokens.clear();
  }
}

const dbStub = new InMemoryTriggerPersistenceDb();

const { setDatabaseClientForTests } = await import('../../database/schema.js');
const {
  setDatabaseAvailabilityForTests,
  resetDatabaseAvailabilityOverrideForTests,
} = await import('../../database/status.js');

setDatabaseClientForTests(dbStub);
setDatabaseAvailabilityForTests(true);

const { WebhookManager } = await import('../WebhookManager.js');

const organizationId = 'org-signature-tests';
const userId = 'user-signature-tests';

type TestQueueResult = { manager: InstanceType<typeof WebhookManager>; queueCalls: any[] };

async function createManager(options: { allowQueue?: boolean } = {}): Promise<TestQueueResult> {
  WebhookManager.resetForTests();

  const queueCalls: any[] = [];
  WebhookManager.setQueueServiceForTests({
    enqueue: async (request: any) => {
      queueCalls.push(request);
      if (!options.allowQueue) {
        throw new Error('Queue should not be invoked during this test');
      }
      return { executionId: `exec-${queueCalls.length}` };
    },
  });

  const manager = WebhookManager.getInstance();
  return { manager, queueCalls };
}

function extractWebhookId(endpoint: string): string {
  const parts = endpoint.split('/');
  const id = parts.at(-1);
  if (!id) {
    throw new Error(`Unable to parse webhook id from endpoint: ${endpoint}`);
  }
  return id;
}

async function runSlackSignatureRejectionTests(): Promise<void> {
  dbStub.reset();
  const { manager } = await createManager({ allowQueue: false });

  const secret = 'super-secret';
  const endpoint = await manager.registerWebhook({
    id: '',
    appId: 'slack',
    triggerId: 'message_received',
    workflowId: 'wf-slack-signature',
    secret,
    isActive: true,
    metadata: { organizationId, userId },
    organizationId,
    userId,
  });

  const webhookId = extractWebhookId(endpoint);

  dbStub.webhookLogs.clear();
  const unsignedHandled = await manager.handleWebhook(
    webhookId,
    { text: 'hello world' },
    { 'content-type': 'application/json' }
  );

  assert.equal(unsignedHandled, false, 'unsigned webhook should be rejected');
  const unsignedLogs = Array.from(dbStub.webhookLogs.values());
  assert.equal(unsignedLogs.length, 1, 'unsigned webhook should produce a log entry');
  assert.equal(unsignedLogs[0].processed, false, 'unsigned webhook log should be marked as failed');
  assert.ok(unsignedLogs[0].error && /missing/i.test(unsignedLogs[0].error), 'error should mention missing signature');

  dbStub.webhookLogs.clear();

  const staleTimestamp = Math.floor(Date.now() / 1000) - 1000;
  const stalePayload = { text: 'stale message' };
  const rawBody = JSON.stringify(stalePayload);
  const baseString = `v0:${staleTimestamp}:${rawBody}`;
  const slackSignature = 'v0=' + crypto.createHmac('sha256', secret).update(baseString).digest('hex');

  const expiredHandled = await manager.handleWebhook(
    webhookId,
    stalePayload,
    {
      'x-slack-signature': slackSignature,
      'x-slack-request-timestamp': String(staleTimestamp),
      'content-type': 'application/json',
    },
    rawBody
  );

  assert.equal(expiredHandled, false, 'expired webhook should be rejected');
  const expiredLogs = Array.from(dbStub.webhookLogs.values());
  assert.equal(expiredLogs.length, 1, 'expired webhook should produce a log entry');
  assert.equal(expiredLogs[0].processed, false, 'expired webhook log should be marked as failed');
  assert.ok(expiredLogs[0].error && /tolerance/i.test(expiredLogs[0].error), 'error should reference tolerance window');
}

async function runStripeSignatureAcceptanceTest(): Promise<void> {
  dbStub.reset();
  const { manager, queueCalls } = await createManager({ allowQueue: true });

  const secret = 'stripe-secret';
  const endpoint = await manager.registerWebhook({
    id: '',
    appId: 'stripe',
    triggerId: 'invoice_payment_succeeded',
    workflowId: 'wf-stripe-signature',
    secret,
    isActive: true,
    metadata: { organizationId, userId },
    organizationId,
    userId,
  });

  const webhookId = extractWebhookId(endpoint);
  const payload = { id: 'evt_123', type: 'invoice.payment_succeeded' };
  const rawBody = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  const stripeHeader = `t=${timestamp},v1=${signature}`;

  const handled = await manager.handleWebhook(
    webhookId,
    payload,
    { 'stripe-signature': stripeHeader },
    rawBody
  );

  assert.equal(handled, true, 'valid Stripe webhook should be accepted');
  assert.equal(queueCalls.length, 1, 'Stripe webhook should enqueue a workflow execution');
  assert.equal(queueCalls[0].triggerType, 'webhook');
  assert.equal(queueCalls[0].organizationId, organizationId);
}

async function runGithubSignatureAcceptanceTest(): Promise<void> {
  dbStub.reset();
  const { manager, queueCalls } = await createManager({ allowQueue: true });

  const secret = 'github-secret';
  const endpoint = await manager.registerWebhook({
    id: '',
    appId: 'github',
    triggerId: 'issue_opened',
    workflowId: 'wf-github-signature',
    secret,
    isActive: true,
    metadata: { organizationId, userId },
    organizationId,
    userId,
  });

  const webhookId = extractWebhookId(endpoint);
  const payload = { action: 'opened', issue: { id: 42 }, repository: { full_name: 'acme/repo' } };
  const rawBody = JSON.stringify(payload);
  const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const githubHeader = `sha256=${signature}`;

  const handled = await manager.handleWebhook(
    webhookId,
    payload,
    { 'x-hub-signature-256': githubHeader },
    rawBody
  );

  assert.equal(handled, true, 'valid GitHub webhook should be accepted');
  assert.equal(queueCalls.length, 1, 'GitHub webhook should enqueue a workflow execution');
  assert.equal(queueCalls[0].organizationId, organizationId);
}

async function runGenericFallbackRejectionTest(): Promise<void> {
  dbStub.reset();
  const { manager } = await createManager({ allowQueue: false });

  const secret = 'generic-secret';
  const endpoint = await manager.registerWebhook({
    id: '',
    appId: 'custom-app',
    triggerId: 'unregistered-event',
    workflowId: 'wf-generic-fallback',
    secret,
    isActive: true,
    metadata: { organizationId, userId },
    organizationId,
    userId,
  });

  const webhookId = extractWebhookId(endpoint);
  const payload = { ping: 'pong' };
  const handled = await manager.handleWebhook(
    webhookId,
    payload,
    { 'x-signature': 'unused' },
    JSON.stringify(payload)
  );

  assert.equal(handled, false, 'webhook without registered template should be rejected');
  const logs = Array.from(dbStub.webhookLogs.values());
  assert.equal(logs.length, 1, 'rejection should be logged');
  assert.equal(logs[0].processed, false, 'rejection log should be marked as failed');
  assert.ok(logs[0].error && /provider/i.test(logs[0].error), 'error should mention provider registration');
}

await runSlackSignatureRejectionTests();
await runStripeSignatureAcceptanceTest();
await runGithubSignatureAcceptanceTest();
await runGenericFallbackRejectionTest();

WebhookManager.resetForTests();
resetDatabaseAvailabilityOverrideForTests();

console.log('WebhookManager signature enforcement tests passed.');
