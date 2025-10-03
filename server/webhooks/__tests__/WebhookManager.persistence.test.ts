import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';

const DEFAULT_TTL_MS = 1000 * 60 * 60;

class InMemoryTriggerPersistenceDb {
  public workflowTriggers = new Map<string, any>();
  public pollingTriggers = new Map<string, any>();
  public webhookLogs = new Map<string, any>();
  public dedupeTokens = new Map<string, { value: string; expiresAt: number }[]>();

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
      cursor: record.cursor ?? existing.cursor ?? null,
      backoffCount: record.backoffCount ?? existing.backoffCount ?? 0,
      lastStatus: record.lastStatus ?? existing.lastStatus ?? null,
      isActive: record.isActive ?? existing.isActive ?? true,
      updatedAt: new Date(),
      createdAt: existing.createdAt ?? new Date(),
    };
    this.pollingTriggers.set(record.id, next);
  }

  async updatePollingRuntimeState({
    id,
    lastPoll,
    nextPoll,
    cursor,
    backoffCount,
    lastStatus,
  }: {
    id: string;
    lastPoll?: Date;
    nextPoll: Date;
    cursor?: Record<string, any> | null;
    backoffCount?: number;
    lastStatus?: string | null;
  }) {
    const existing = this.pollingTriggers.get(id);
    if (existing) {
      existing.lastPoll = lastPoll ?? null;
      existing.nextPoll = nextPoll;
      if (cursor !== undefined) {
        existing.cursor = cursor;
      }
      if (backoffCount !== undefined) {
        existing.backoffCount = backoffCount;
      }
      if (lastStatus !== undefined) {
        existing.lastStatus = lastStatus;
      }
      existing.updatedAt = new Date();
      this.pollingTriggers.set(id, existing);
    }

    const workflow = this.workflowTriggers.get(id);
    if (workflow) {
      workflow.updatedAt = new Date();
      this.workflowTriggers.set(id, workflow);
    }
  }

  async deactivateTrigger(id: string) {
    const workflow = this.workflowTriggers.get(id);
    if (workflow) {
      workflow.isActive = false;
      workflow.updatedAt = new Date();
      this.workflowTriggers.set(id, workflow);
    }

    const polling = this.pollingTriggers.get(id);
    if (polling) {
      polling.isActive = false;
      polling.updatedAt = new Date();
      this.pollingTriggers.set(id, polling);
    }
  }

  async logWebhookEvent(event: any) {
    this.webhookLogs.set(event.id, {
      ...event,
      processed: event.processed ?? false,
      executionId: event.executionId ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  async markWebhookEventProcessed(id: string, result: { success: boolean; error?: string; executionId?: string }) {
    const existing = this.webhookLogs.get(id);
    if (!existing) return;

    existing.processed = result.success;
    existing.error = result.success ? null : result.error ?? null;
    existing.executionId = result.executionId ?? existing.executionId ?? null;
    existing.updatedAt = new Date();
    this.webhookLogs.set(id, existing);
  }

  async getDedupeTokens() {
    const result: Record<string, string[]> = {};
    const now = Date.now();
    for (const [id, tokens] of this.dedupeTokens.entries()) {
      const filtered = tokens.filter((entry) => entry.expiresAt > now);
      if (filtered.length === 0) {
        this.dedupeTokens.delete(id);
        continue;
      }
      this.dedupeTokens.set(id, filtered);
      result[id] = filtered.map((entry) => entry.value);
    }
    return result;
  }

  async persistDedupeTokens(
    id: string,
    tokens: string[],
    options?: { ttlMs?: number; now?: Date },
  ) {
    const ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;
    const now = options?.now ?? new Date();
    const expiresAt = now.getTime() + ttlMs;
    const entries = tokens.map((token) => ({ value: token, expiresAt }));

    if (entries.length === 0) {
      this.dedupeTokens.delete(id);
    } else {
      this.dedupeTokens.set(id, entries);
    }

    const workflow = this.workflowTriggers.get(id);
    if (workflow) {
      workflow.dedupeState = {
        tokens: entries.map((entry) => ({ value: entry.value, expiresAt: new Date(entry.expiresAt).toISOString() })),
        ttlMs,
        updatedAt: now.toISOString(),
      };
      workflow.updatedAt = new Date();
      this.workflowTriggers.set(id, workflow);
    }
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

WebhookManager.resetForTests();

const manager = WebhookManager.getInstance();

const organizationId = 'org-webhook-test';
const userId = 'user-webhook-test';

const endpoint = await manager.registerWebhook({
  workflowId: 'wf-1',
  appId: 'github',
  triggerId: 'issue.opened',
  metadata: { foo: 'bar', organizationId, userId },
  organizationId,
  userId,
});

assert.ok(endpoint.startsWith('/api/webhooks/'), 'registration should return a webhook endpoint');
const webhookId = endpoint.split('/').at(-1)!;

const storedWorkflowTrigger = dbStub.workflowTriggers.get(webhookId);
assert.ok(storedWorkflowTrigger, 'webhook trigger should be persisted to workflow_triggers table');
assert.equal(storedWorkflowTrigger.appId, 'github');
assert.equal(storedWorkflowTrigger.triggerId, 'issue.opened');

WebhookManager.resetForTests();

const managerAfterRestart = WebhookManager.getInstance();
assert.equal(managerAfterRestart.getInitializationError(), undefined, 'initialization should not report errors');

const queueCalls: any[] = [];
WebhookManager.setQueueServiceForTests({
  enqueue: async (req: any) => {
    queueCalls.push(req);
    return { executionId: 'exec-123' };
  }
});

const handled = await managerAfterRestart.handleWebhook(webhookId, { hello: 'world' }, { 'x-test': '1' });
assert.equal(handled, true, 'webhook replay should be handled successfully after restart');
assert.equal(queueCalls.length, 1, 'event should enqueue a workflow execution');
assert.deepEqual(queueCalls[0].triggerData?.payload, { hello: 'world' });
assert.equal(queueCalls[0].triggerType, 'webhook');
assert.equal(queueCalls[0].organizationId, organizationId, 'queue should receive organization context');
assert.equal(queueCalls[0].userId, userId, 'queue should receive user context when available');

const logEntry = Array.from(dbStub.webhookLogs.values())[0];
assert.ok(logEntry, 'webhook log should be stored');
assert.equal(logEntry.processed, true, 'webhook log should be marked processed');
assert.equal(logEntry.executionId, 'exec-123', 'execution id from queue should be persisted');

const dedupeTokens = dbStub.dedupeTokens.get(webhookId) ?? [];
assert.ok(dedupeTokens.length > 0, 'dedupe tokens should be persisted after handling event');

WebhookManager.resetForTests();
resetDatabaseAvailabilityOverrideForTests();

console.log('WebhookManager persistence integration test passed.');
