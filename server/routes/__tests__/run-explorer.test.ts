import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

const originalNodeEnv = process.env.NODE_ENV;
process.env.NODE_ENV = 'test';

const { setDatabaseClientForTests } = await import('../../database/schema.js');
const triggerPersistenceModule = await import('../../services/TriggerPersistenceService.js');

class SelectBuilder {
  constructor(private readonly result: any, private readonly resolveOn: 'offset' | 'limit' | 'where' | 'orderBy') {}

  from() {
    return this;
  }

  leftJoin() {
    return this;
  }

  innerJoin() {
    return this;
  }

  where() {
    if (this.resolveOn === 'where') {
      return Promise.resolve(this.result);
    }
    return this;
  }

  orderBy() {
    if (this.resolveOn === 'orderBy') {
      return Promise.resolve(this.result);
    }
    return this;
  }

  groupBy() {
    return this;
  }

  limit() {
    if (this.resolveOn === 'limit') {
      return Promise.resolve(this.result);
    }
    return this;
  }

  offset() {
    if (this.resolveOn === 'offset') {
      return Promise.resolve(this.result);
    }
    return this;
  }
}

const selectQueue = [
  {
    result: [
      {
        execution: {
          executionId: 'exec-123',
          workflowId: 'wf-1',
          workflowName: 'Critical Workflow',
          status: 'failed',
          startTime: new Date('2024-01-01T00:00:00Z'),
          endTime: new Date('2024-01-01T00:01:00Z'),
          durationMs: 60000,
          triggerType: 'webhook',
          totalNodes: 3,
          completedNodes: 2,
          failedNodes: 1,
          tags: ['prod'],
          correlationId: 'trace-1',
          metadata: { requestId: 'req-1' },
        },
        workflow: {
          id: 'wf-1',
          organizationId: 'org-1',
          name: 'Critical Workflow',
        },
      },
    ],
    resolveOn: 'offset',
  },
  {
    result: [{ value: 1 }],
    resolveOn: 'limit',
  },
  {
    result: [
      {
        executionId: 'exec-123',
        nodeType: 'action.slack.send_message',
        metadata: { connectorId: 'slack' },
        status: 'succeeded',
        startTime: new Date('2024-01-01T00:00:30Z'),
      },
    ],
    resolveOn: 'where',
  },
  {
    result: [
      {
        status: 'failed',
        count: 1,
      },
    ],
    resolveOn: 'orderBy',
  },
  {
    result: [
      {
        connector: 'slack',
        count: 1,
      },
    ],
    resolveOn: 'limit',
  },
];

const dbStub = {
  select: () => {
    const next = selectQueue.shift();
    if (!next) {
      throw new Error('Unexpected select invocation in test');
    }
    return new SelectBuilder(next.result, next.resolveOn);
  },
};

setDatabaseClientForTests(dbStub as any);

const originalListDuplicates = triggerPersistenceModule.triggerPersistenceService.listDuplicateWebhookEvents;
(triggerPersistenceModule.triggerPersistenceService as any).listDuplicateWebhookEvents = async () => [
  {
    id: 'dup-1',
    webhookId: 'hook-1',
    timestamp: new Date('2024-01-01T00:00:10Z'),
    error: 'duplicate delivery',
  },
];

const app = express();
app.use(express.json());

const { registerRoutes } = await import('../../routes.ts');

let server: Server | undefined;
let exitCode = 0;

try {
  server = await registerRoutes(app);
  await new Promise<void>((resolve) => server!.listen(0, resolve));
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const response = await fetch(
    `${baseUrl}/api/runs/search?organizationId=org-1&connectorId=slack&status=failed&page=1&pageSize=10`
  );

  assert.equal(response.status, 200, 'search endpoint should return 200');
  const body = await response.json();
  assert.equal(body.success, true, 'response should indicate success');
  assert.equal(body.pagination.total, 1, 'total should reflect stub data');
  assert.equal(body.pagination.page, 1, 'page should echo request');
  assert.equal(body.pagination.pageSize, 10, 'pageSize should echo request');
  assert.equal(body.pagination.hasMore, false, 'no additional pages expected');

  assert.ok(Array.isArray(body.runs), 'runs should be an array');
  assert.equal(body.runs.length, 1, 'one run expected');

  const run = body.runs[0];
  assert.equal(run.executionId, 'exec-123');
  assert.equal(run.workflowId, 'wf-1');
  assert.equal(run.status, 'failed');
  assert.deepEqual(run.connectors, ['slack'], 'connector facets should be inferred');
  assert.equal(run.requestId, 'req-1', 'request identifier should surface from metadata');
  assert.ok(Array.isArray(run.duplicateEvents), 'duplicate webhook events should be included');
  assert.equal(run.duplicateEvents.length, 1, 'one duplicate webhook event expected');
  assert.equal(run.duplicateEvents[0].webhookId, 'hook-1');

  assert.ok(body.facets, 'facets object should be present');
  const statusFacet = body.facets.status.find((entry: any) => entry.value === 'failed');
  assert.ok(statusFacet, 'status facet should include failed');
  assert.equal(statusFacet.count, 1, 'status facet count should match stub');
  const connectorFacet = body.facets.connector.find((entry: any) => entry.value === 'slack');
  assert.ok(connectorFacet, 'connector facet should include slack');
  assert.equal(connectorFacet.count, 1, 'connector facet count should match stub');

  console.log('Run explorer search endpoint returns filtered runs with facets and dedupe context.');
} catch (error) {
  exitCode = 1;
  console.error(error);
} finally {
  if (server) {
    await new Promise<void>((resolve, reject) => server!.close((err) => (err ? reject(err) : resolve())));
  }

  (triggerPersistenceModule.triggerPersistenceService as any).listDuplicateWebhookEvents = originalListDuplicates;
  setDatabaseClientForTests(null as any);

  if (originalNodeEnv) {
    process.env.NODE_ENV = originalNodeEnv;
  } else {
    delete process.env.NODE_ENV;
  }

  process.exit(exitCode);
}
