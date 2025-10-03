import assert from 'node:assert/strict';

import {
  retryManager,
  setNodeExecutionResultStoreForTests,
  type NodeExecutionResultStore
} from '../RetryManager.js';

process.env.NODE_ENV = 'test';

type StoredRecord = {
  id: number;
  executionId: string;
  nodeId: string;
  idempotencyKey: string;
  resultHash: string;
  resultData: any;
  createdAt: Date;
  expiresAt: Date;
};

class MockNodeExecutionResultStore implements NodeExecutionResultStore {
  public readonly records = new Map<string, StoredRecord>();
  private nextId = 1;

  private key(executionId: string, nodeId: string, idempotencyKey: string): string {
    return `${executionId}:${nodeId}:${idempotencyKey}`;
  }

  setRecord(record: Omit<StoredRecord, 'id' | 'createdAt'> & { createdAt?: Date }): void {
    const key = this.key(record.executionId, record.nodeId, record.idempotencyKey);
    this.records.set(key, {
      id: this.nextId++,
      createdAt: record.createdAt ?? new Date(),
      ...record
    });
  }

  async find(params: { executionId: string; nodeId: string; idempotencyKey: string; now: Date }): Promise<StoredRecord | undefined> {
    const record = this.records.get(this.key(params.executionId, params.nodeId, params.idempotencyKey));
    if (!record) {
      return undefined;
    }

    if (record.expiresAt <= params.now) {
      this.records.delete(this.key(params.executionId, params.nodeId, params.idempotencyKey));
      return undefined;
    }

    return { ...record };
  }

  async upsert(record: {
    executionId: string;
    nodeId: string;
    idempotencyKey: string;
    resultHash: string;
    resultData: any;
    expiresAt: Date;
  }): Promise<void> {
    const key = this.key(record.executionId, record.nodeId, record.idempotencyKey);
    const existing = this.records.get(key);
    const createdAt = existing?.createdAt ?? new Date();
    const id = existing?.id ?? this.nextId++;

    this.records.set(key, {
      id,
      createdAt,
      executionId: record.executionId,
      nodeId: record.nodeId,
      idempotencyKey: record.idempotencyKey,
      resultHash: record.resultHash,
      resultData: record.resultData,
      expiresAt: record.expiresAt
    });
  }

  async deleteExpired(now: Date): Promise<number> {
    let deleted = 0;
    for (const [key, record] of this.records.entries()) {
      if (record.expiresAt <= now) {
        this.records.delete(key);
        deleted++;
      }
    }
    return deleted;
  }

  async countActive(now: Date): Promise<number> {
    let count = 0;
    for (const record of this.records.values()) {
      if (record.expiresAt > now) {
        count++;
      }
    }
    return count;
  }
}

function resetWithStore(store: MockNodeExecutionResultStore): void {
  setNodeExecutionResultStoreForTests(store);
  retryManager.resetForTests();
}

async function runIdempotencyHitScenario(): Promise<void> {
  const store = new MockNodeExecutionResultStore();
  resetWithStore(store);

  const expiresAt = new Date(Date.now() + 60_000);
  store.setRecord({
    executionId: 'exec-1',
    nodeId: 'node-1',
    idempotencyKey: 'idempo-1',
    resultHash: 'hash-cached',
    resultData: { cached: true },
    expiresAt
  });

  let executed = false;
  const result = await retryManager.executeWithRetry(
    'node-1',
    'exec-1',
    async () => {
      executed = true;
      return { cached: false };
    },
    { idempotencyKey: 'idempo-1' }
  );

  assert.deepEqual(result, { cached: true });
  assert.equal(executed, false);
  console.log('✅ RetryManager short-circuits when an idempotent result already exists.');
}

async function runPersistenceScenario(): Promise<void> {
  const store = new MockNodeExecutionResultStore();
  resetWithStore(store);

  const payload = { status: 'ok', value: 42 };
  const result = await retryManager.executeWithRetry(
    'node-7',
    'exec-42',
    async () => payload,
    { idempotencyKey: 'persist-key' }
  );

  assert.deepEqual(result, payload);
  assert.equal(store.records.size, 1);

  const stored = Array.from(store.records.values())[0];
  assert.deepEqual(stored.resultData, payload);
  assert.match(stored.resultHash, /^[0-9a-f]+$/);

  const stats = retryManager.getStats();
  assert.equal(stats.cachedKeys, 1);
  console.log('✅ RetryManager persists node results to the backing store and refreshes stats.');
}

async function runCleanupScenario(): Promise<void> {
  const store = new MockNodeExecutionResultStore();
  resetWithStore(store);

  const now = Date.now();
  store.setRecord({
    executionId: 'exec-keep',
    nodeId: 'node-A',
    idempotencyKey: 'active',
    resultHash: 'hash-active',
    resultData: { active: true },
    expiresAt: new Date(now + 120_000)
  });
  store.setRecord({
    executionId: 'exec-expired',
    nodeId: 'node-B',
    idempotencyKey: 'stale',
    resultHash: 'hash-expired',
    resultData: { active: false },
    expiresAt: new Date(now - 5_000)
  });

  await retryManager.cleanup();

  assert.equal(store.records.size, 1);
  const [remaining] = Array.from(store.records.values());
  assert.equal(remaining.executionId, 'exec-keep');

  const stats = retryManager.getStats();
  assert.equal(stats.cachedKeys, 1);
  console.log('✅ RetryManager cleanup enforces TTL on persisted node execution results.');
}

try {
  await runIdempotencyHitScenario();
  await runPersistenceScenario();
  await runCleanupScenario();
  console.log('RetryManager persistence scenarios completed successfully.');
} finally {
  setNodeExecutionResultStoreForTests(null);
  retryManager.resetForTests();
}
