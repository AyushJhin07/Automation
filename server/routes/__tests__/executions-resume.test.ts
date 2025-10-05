import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/test';
process.env.ENCRYPTION_MASTER_KEY =
  process.env.ENCRYPTION_MASTER_KEY || 'test-master-key-test-master-key-123456';
process.env.SERVER_PUBLIC_URL = process.env.SERVER_PUBLIC_URL || 'http://localhost:5000';
process.env.EXECUTION_RESUME_FORCE_MEMORY = 'true';

const schemaModule = await import('../../database/schema.js');
const { setDatabaseClientForTests, db } = schemaModule as {
  setDatabaseClientForTests: (client: any) => void;
  db: any;
};
const originalDb = db;

function createQueryBuilder(result: any) {
  const builder: any = {
    then: (onFulfilled?: (value: any) => any, onRejected?: (reason: any) => any) => {
      try {
        const value = typeof onFulfilled === 'function' ? onFulfilled(result) : result;
        return Promise.resolve(value);
      } catch (error) {
        if (typeof onRejected === 'function') {
          return Promise.resolve(onRejected(error));
        }
        return Promise.reject(error);
      }
    },
    catch: () => builder,
    finally: () => builder,
    execute: async () => result,
  };

  const chain = () => builder;
  builder.select = chain;
  builder.insert = chain;
  builder.update = chain;
  builder.delete = chain;
  builder.from = chain;
  builder.where = chain;
  builder.orderBy = chain;
  builder.limit = chain;
  builder.offset = chain;
  builder.values = chain;
  builder.returning = chain;
  builder.innerJoin = chain;
  builder.leftJoin = chain;
  builder.join = chain;
  builder.on = chain;
  builder.groupBy = chain;
  builder.having = chain;
  builder.onConflictDoUpdate = chain;
  builder.onConflictDoNothing = chain;
  builder.executeTakeFirst = async () => result[0] ?? null;
  builder.executeTakeFirstOrThrow = async () => {
    const first = result[0];
    if (first === undefined) {
      throw new Error('No results');
    }
    return first;
  };

  return builder;
}

const stubDb: any = {
  select: () => createQueryBuilder([]),
  insert: () => createQueryBuilder([{ id: 'stub' }]),
  update: () => createQueryBuilder([]),
  delete: () => createQueryBuilder([]),
  execute: async () => [],
  transaction: async (fn: any) => fn(stubDb),
};

setDatabaseClientForTests(stubDb);

const { executionResumeTokenService } = await import('../../services/ExecutionResumeTokenService.js');
const { executionQueueService } = await import('../../services/ExecutionQueueService.js');
const { executionResumeRouter } = await import('../executions.js');

const executionId = 'exec-resume-1';
const nodeId = 'node-wait-1';
const workflowId = 'workflow-resume-1';
const organizationId = 'org-resume-1';

const resumeState = {
  nodeOutputs: { trigger: { output: { message: 'waiting' } } },
  prevOutput: null,
  remainingNodeIds: ['node-next'],
  nextNodeId: 'node-next',
  startedAt: new Date().toISOString(),
  idempotencyKeys: {},
  requestHashes: {},
};

const initialData = { foo: 'bar' };

const issued = await executionResumeTokenService.issueToken({
  executionId,
  workflowId,
  organizationId,
  nodeId,
  resumeState,
  initialData,
  triggerType: 'callback',
});

assert.ok(issued, 'token should be issued for resume test');

const app = express();
app.use(express.json());
app.use('/api/runs', executionResumeRouter);

const server: Server = await new Promise((resolve) => {
  const listener = app.listen(0, () => resolve(listener));
});
server.unref();

const originalEnqueueResume = executionQueueService.enqueueResume;

try {
  let captured: any = null;
  (executionQueueService as any).enqueueResume = async (payload: any) => {
    captured = payload;
  };

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const response = await fetch(`${baseUrl}/api/runs/${executionId}/nodes/${nodeId}/resume`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: issued!.token, signature: issued!.signature }),
  });

  assert.equal(response.status, 200, 'resume endpoint should return 200 on success');
  const body = await response.json();
  assert.equal(body.success, true, 'resume endpoint should return success response');
  assert.equal(body.executionId, executionId, 'response should include execution id');

  assert.ok(captured, 'resume enqueue should be invoked');
  assert.equal(captured.executionId, executionId, 'enqueue should receive execution id');
  assert.equal(captured.workflowId, workflowId, 'enqueue should receive workflow id');
  assert.equal(captured.organizationId, organizationId, 'enqueue should receive organization id');
  assert.deepEqual(captured.resumeState, resumeState, 'resume state should be passed to queue');
  assert.deepEqual(captured.initialData, initialData, 'initial data should be passed to queue');

  const replay = await fetch(`${baseUrl}/api/runs/${executionId}/nodes/${nodeId}/resume`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: issued!.token, signature: issued!.signature }),
  });

  assert.equal(replay.status, 410, 'replaying consumed token should return 410');
  const replayBody = await replay.json();
  assert.equal(replayBody.error, 'RESUME_TOKEN_EXPIRED', 'consumed token should be treated as expired');
} finally {
  (executionQueueService as any).enqueueResume = originalEnqueueResume;
  server.close();
  setDatabaseClientForTests(originalDb);
}

console.log('Execution resume route integration tests passed.');
process.exit(0);
