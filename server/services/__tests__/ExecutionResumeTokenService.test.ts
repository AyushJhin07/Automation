import assert from 'node:assert/strict';

process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/test';
process.env.ENCRYPTION_MASTER_KEY = process.env.ENCRYPTION_MASTER_KEY || 'test-master-key';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
process.env.NODE_ENV = 'test';

const schemaModule = await import('../../database/schema.js');
const { setDatabaseClientForTests, db } = schemaModule as { setDatabaseClientForTests: (client: any) => void; db: any };
const originalDb = db;

const { executionResumeTokenService } = await import('../ExecutionResumeTokenService.js');

function createResumeState() {
  return {
    nodeOutputs: {},
    prevOutput: null,
    remainingNodeIds: [],
    nextNodeId: null,
    startedAt: new Date().toISOString(),
    idempotencyKeys: {},
    requestHashes: {},
  };
}

setDatabaseClientForTests(null);

try {
  const issued = await executionResumeTokenService.issueToken({
    executionId: 'exec-1',
    workflowId: 'workflow-1',
    organizationId: 'org-1',
    nodeId: 'node-1',
    userId: 'user-1',
    resumeState: createResumeState(),
    initialData: { foo: 'bar' },
    triggerType: 'callback',
    ttlMs: 10_000,
  });

  assert.ok(issued, 'token should be issued');
  assert.ok(issued?.token.length, 'token should be non-empty');
  assert.ok(issued?.signature.length, 'signature should be non-empty');
  assert.ok(issued?.callbackUrl.includes('exec-1'), 'callback URL should include execution id');

  const consumed = await executionResumeTokenService.consumeToken({
    token: issued!.token,
    signature: issued!.signature,
    executionId: 'exec-1',
    nodeId: 'node-1',
  });

  assert.ok(consumed, 'token should be consumable');
  assert.equal(consumed?.executionId, 'exec-1');
  assert.equal(consumed?.workflowId, 'workflow-1');
  assert.equal(consumed?.nodeId, 'node-1');

  const replay = await executionResumeTokenService.consumeToken({
    token: issued!.token,
    signature: issued!.signature,
    executionId: 'exec-1',
    nodeId: 'node-1',
  });

  assert.equal(replay, null, 'consumed token should not be reusable');
  console.log('ExecutionResumeTokenService fallback test passed.');
} finally {
  setDatabaseClientForTests(originalDb);
}
