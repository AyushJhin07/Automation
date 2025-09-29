import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';

class InMemoryTriggerPersistenceDb {
  public workflowTriggers = new Map<string, any>();
  public pollingTriggers = new Map<string, any>();
  public webhookLogs = new Map<string, any>();
  public dedupeTokens = new Map<string, string[]>();

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
      updatedAt: new Date(),
      createdAt: existing.createdAt ?? new Date(),
    };
    this.pollingTriggers.set(record.id, next);
  }

  async updatePollingRuntimeState({ id, lastPoll, nextPoll }: { id: string; lastPoll?: Date; nextPoll: Date }) {
    const existing = this.pollingTriggers.get(id);
    if (existing) {
      existing.lastPoll = lastPoll ?? null;
      existing.nextPoll = nextPoll;
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
    for (const [id, tokens] of this.dedupeTokens.entries()) {
      result[id] = [...tokens];
    }
    return result;
  }

  async persistDedupeTokens(id: string, tokens: string[]) {
    this.dedupeTokens.set(id, [...tokens]);
    const workflow = this.workflowTriggers.get(id);
    if (workflow) {
      workflow.dedupeState = { tokens: [...tokens], updatedAt: new Date().toISOString() };
      workflow.updatedAt = new Date();
      this.workflowTriggers.set(id, workflow);
    }
  }
}

const dbStub = new InMemoryTriggerPersistenceDb();

const { setDatabaseClientForTests } = await import('../../database/schema.js');
setDatabaseClientForTests(dbStub);

const { WebhookManager } = await import('../WebhookManager.js');

WebhookManager.resetForTests();

const manager = WebhookManager.getInstance();

const endpoint = await manager.registerWebhook({
  workflowId: 'wf-1',
  appId: 'github',
  triggerId: 'issue.opened',
  metadata: { foo: 'bar' },
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

const logEntry = Array.from(dbStub.webhookLogs.values())[0];
assert.ok(logEntry, 'webhook log should be stored');
assert.equal(logEntry.processed, true, 'webhook log should be marked processed');
assert.equal(logEntry.executionId, 'exec-123', 'execution id from queue should be persisted');

const dedupeTokens = dbStub.dedupeTokens.get(webhookId) ?? [];
assert.ok(dedupeTokens.length > 0, 'dedupe tokens should be persisted after handling event');

WebhookManager.resetForTests();

console.log('WebhookManager persistence integration test passed.');
