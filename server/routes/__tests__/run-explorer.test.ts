import assert from 'node:assert/strict';
import express from 'express';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

const originalNodeEnv = process.env.NODE_ENV;
process.env.NODE_ENV = 'development';

const originalEnv = {
  DATABASE_URL: process.env.DATABASE_URL,
  ENCRYPTION_MASTER_KEY: process.env.ENCRYPTION_MASTER_KEY,
};

process.env.DATABASE_URL = 'postgresql://user:password@localhost:5432/testdb';
process.env.ENCRYPTION_MASTER_KEY = process.env.ENCRYPTION_MASTER_KEY ?? '0123456789abcdef0123456789abcdef';

const authModule = await import('../../services/AuthService.js');
const billingPlanModule = await import('../../services/BillingPlanService.js');
const { getPermissionsForRole } = await import('../../../configs/rbac.ts');

process.env.NODE_ENV = 'test';

const { setDatabaseClientForTests } = await import('../../database/schema.js');
const triggerPersistenceModule = await import('../../services/TriggerPersistenceService.js');

const originalVerifyToken = authModule.authService.verifyToken.bind(authModule.authService);
(authModule.authService as any).verifyToken = async () => {
  const limits = { maxWorkflows: 100, maxExecutions: 1000, maxUsers: 10, maxStorage: 1024 };
  const usage = { apiCalls: 0, workflowExecutions: 0, storageUsed: 0, usersActive: 1 };
  return {
    id: 'test-user',
    email: 'test@example.com',
    name: 'Test User',
    role: 'user',
    planType: 'pro',
    isActive: true,
    emailVerified: true,
    monthlyApiCalls: 0,
    monthlyTokensUsed: 0,
    quotaApiCalls: 1000,
    quotaTokens: 100000,
    createdAt: new Date(),
    organizationId: 'dev-org',
    organizationRole: 'owner',
    organizationPlan: 'enterprise',
    organizationStatus: 'active',
    organizationLimits: limits,
    organizationUsage: usage,
    activeOrganization: {
      id: 'dev-org',
      name: 'Dev Org',
      domain: null,
      plan: 'enterprise',
      status: 'active',
      role: 'owner',
      isDefault: true,
      limits,
      usage,
    },
    organizations: [],
    permissions: getPermissionsForRole('owner'),
  };
};

class SelectBuilder {
  constructor(private readonly result: any) {}

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
    return this;
  }

  orderBy() {
    return this;
  }

  groupBy() {
    return this;
  }

  limit() {
    return this;
  }

  offset() {
    return this;
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.result).then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null
  ): Promise<any | TResult> {
    return Promise.resolve(this.result).catch(onrejected);
  }

  finally(onfinally?: (() => void) | null): Promise<any> {
    return Promise.resolve(this.result).finally(onfinally);
  }
}

const selectQueueTemplate = [
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
          organizationId: 'dev-org',
          name: 'Critical Workflow',
        },
      },
    ],
  },
  {
    result: [{ value: 1 }],
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
  },
  {
    result: [
      {
        status: 'failed',
        count: 1,
      },
    ],
  },
  {
    result: [
      {
        connector: 'slack',
        count: 1,
      },
    ],
  },
];

let selectQueue = selectQueueTemplate.map((entry) => ({ ...entry }));

function resetSelectQueue() {
  selectQueue = selectQueueTemplate.map((entry) => ({ ...entry }));
}

const dbStub = {
  select: () => {
    const next = selectQueue.shift();
    const result = next ? next.result : [];
    return new SelectBuilder(result);
  },
};

setDatabaseClientForTests(dbStub as any);

const originalListDuplicates = triggerPersistenceModule.triggerPersistenceService.listDuplicateWebhookEvents;
const originalListPlans = billingPlanModule.billingPlanService.listPlans.bind(billingPlanModule.billingPlanService);
(billingPlanModule.billingPlanService as any).listPlans = async () => [];
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
  await registerRoutes(app);
  server = createServer(app);
  await new Promise<void>((resolve) => server!.listen(0, resolve));
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  resetSelectQueue();

  const response = await fetch(
    `${baseUrl}/api/runs/search?organizationId=dev-org&connectorId=slack&status=failed&page=1&pageSize=10`,
    {
      headers: {
        Authorization: 'Bearer test-token',
      },
    }
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
  (billingPlanModule.billingPlanService as any).listPlans = originalListPlans;
  setDatabaseClientForTests(null as any);
  (authModule.authService as any).verifyToken = originalVerifyToken;

  if (originalNodeEnv) {
    process.env.NODE_ENV = originalNodeEnv;
  } else {
    delete process.env.NODE_ENV;
  }

  if (originalEnv.DATABASE_URL) {
    process.env.DATABASE_URL = originalEnv.DATABASE_URL;
  } else {
    delete process.env.DATABASE_URL;
  }

  if (originalEnv.ENCRYPTION_MASTER_KEY) {
    process.env.ENCRYPTION_MASTER_KEY = originalEnv.ENCRYPTION_MASTER_KEY;
  } else {
    delete process.env.ENCRYPTION_MASTER_KEY;
  }

  process.exit(exitCode);
}
