import assert from 'node:assert/strict';
import crypto from 'node:crypto';

process.env.NODE_ENV = 'test';

class InMemoryTriggerPersistenceDb {
  public workflowTriggers = new Map<string, any>();
  public pollingTriggers = new Map<string, any>();
  public webhookLogs = new Map<string, any>();
  public dedupeTokens = new Map<string, { token: string; createdAt: Date }[]>();

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

WebhookManager.resetForTests();

WebhookManager.setQueueServiceForTests({
  enqueue: async () => {
    throw new Error('Queue should not be invoked during signature rejection tests');
  },
});

const manager = WebhookManager.getInstance();

const organizationId = 'org-signature-tests';
const userId = 'user-signature-tests';
const secret = 'super-secret';

const endpoint = await manager.registerWebhook({
  id: '',
  appId: 'slack',
  triggerId: 'message_received',
  workflowId: 'wf-signature',
  secret,
  isActive: true,
  metadata: { organizationId, userId },
  organizationId,
  userId,
});

const webhookId = endpoint.split('/').at(-1)!;

// Test 1: Missing signature header should be rejected and logged

dbStub.webhookLogs.clear();

const unsignedHandled = await manager.handleWebhook(
  webhookId,
  { text: 'hello world' },
  { 'content-type': 'application/json' }
);

assert.equal(unsignedHandled, false, 'unsigned webhook should be rejected');
const unsignedLogs = Array.from(dbStub.webhookLogs.values());
assert.equal(unsignedLogs.length, 1, 'unsigned webhook should produce a log entry');
assert.equal(unsignedLogs[0].processed, false, 'log entry should be marked as failed');
assert.ok(unsignedLogs[0].error && /missing/i.test(unsignedLogs[0].error), 'error message should mention missing signature');

// Test 2: Expired signature should be rejected and logged with tolerance error

dbStub.webhookLogs.clear();

const staleTimestamp = Math.floor(Date.now() / 1000) - 1000; // outside 5 minute window
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
assert.equal(expiredLogs.length, 1, 'expired webhook should produce a single log entry');
assert.equal(expiredLogs[0].processed, false, 'expired webhook log should be marked as failed');
assert.ok(expiredLogs[0].error && /tolerance/i.test(expiredLogs[0].error), 'error should reference timestamp tolerance');

WebhookManager.resetForTests();
resetDatabaseAvailabilityOverrideForTests();

console.log('WebhookManager signature enforcement tests passed.');

