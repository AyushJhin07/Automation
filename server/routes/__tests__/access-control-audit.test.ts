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

const { setDatabaseClientForTests } = await import('../../database/schema.js');
const triggerPersistenceModule = await import('../../services/TriggerPersistenceService.js');
const { auditLogService } = await import('../../services/AuditLogService.js');
const runExplorerRoutes = (await import('../run-explorer.js')).default;
const metadataRoutes = (await import('../metadata.js')).default;
const connectionServiceModule = await import('../../services/ConnectionService.js');
const connectorMetadataServiceModule = await import('../../services/metadata/ConnectorMetadataService.js');
const authModule = await import('../../middleware/auth.js');
const billingPlanModule = await import('../../services/BillingPlanService.js');
const { getPermissionsForRole } = await import('../../../configs/rbac.ts');
const authServiceModule = await import('../../services/AuthService.js');

process.env.NODE_ENV = 'test';

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
        organizationId: 'dev-org',
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
(triggerPersistenceModule.triggerPersistenceService as any).listDuplicateWebhookEvents = async () => [];
const originalListPlans = billingPlanModule.billingPlanService.listPlans.bind(billingPlanModule.billingPlanService);
(billingPlanModule.billingPlanService as any).listPlans = async () => [];
const originalVerifyToken = authServiceModule.authService.verifyToken.bind(authServiceModule.authService);
(authServiceModule.authService as any).verifyToken = async () => {
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

const app = express();
app.use(express.json());
app.use(
  '/api/runs',
  authModule.authenticateToken,
  authModule.requireOrganizationContext(),
  (req, _res, next) => {
    if (req.query.forceDeny === 'true') {
      (req as any).permissions = [];
      if (req.user) {
        (req.user as any).permissions = [];
      }
    }
    next();
  },
  authModule.requirePermission('workflow:view'),
  runExplorerRoutes
);
app.use('/api/metadata', metadataRoutes);

const server: Server = await new Promise((resolve) => {
  const listener = createServer(app);
  listener.listen(0, () => resolve(listener));
});
server.unref();

let exitCode = 0;

try {
  auditLogService.clear();
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  resetSelectQueue();
  const exportResponse = await fetch(`${baseUrl}/api/runs/export?organizationId=dev-org`, {
    headers: { Authorization: 'Bearer test-token' },
  });
  assert.equal(exportResponse.status, 200, 'run export should succeed with organization context');
  const exportBody = await exportResponse.json();
  assert.equal(exportBody.success, true, 'export payload should indicate success');
  const auditEntries = auditLogService.list();
  assert.ok(auditEntries.length > 0, 'audit log should capture run export');
  assert.equal(auditEntries[0].action, 'run.export');
  assert.equal(auditEntries[0].organizationId, 'dev-org');

  auditLogService.clear();

  resetSelectQueue();
  const responseDenied = await fetch(`${baseUrl}/api/runs/export?organizationId=dev-org&forceDeny=true`, {
    headers: { Authorization: 'Bearer test-token' },
  });
  assert.equal(responseDenied.status, 403, 'requests without permission should be rejected');
  assert.equal(auditLogService.list().length, 0, 'denied request should not be logged as export');

  auditLogService.clear();
  const originalGetConnection = connectionServiceModule.connectionService.getConnection;
  const originalResolve = connectorMetadataServiceModule.connectorMetadataService.resolve;
  try {
    (connectionServiceModule.connectionService as any).getConnection = async () => ({
      credentials: { token: 'secret-token' },
    });
    (connectorMetadataServiceModule.connectorMetadataService as any).resolve = async () => ({
      success: true,
      metadata: {},
      extras: {},
      warnings: [],
    });

    resetSelectQueue();
    const metadataResponse = await fetch(`${baseUrl}/api/metadata/resolve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: 'Bearer test-token' },
      body: JSON.stringify({ connector: 'slack', connectionId: 'conn-1' }),
    });

    assert.equal(metadataResponse.status, 200, 'metadata resolve should succeed');
    const metadataAudit = auditLogService.list();
    assert.ok(metadataAudit.some((entry) => entry.action === 'connection.credentials.access'), 'credential access should be audited');
  } finally {
    (connectionServiceModule.connectionService as any).getConnection = originalGetConnection;
    (connectorMetadataServiceModule.connectorMetadataService as any).resolve = originalResolve;
  }
} catch (error) {
  exitCode = 1;
  console.error(error);
} finally {
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  (triggerPersistenceModule.triggerPersistenceService as any).listDuplicateWebhookEvents = originalListDuplicates;
  (billingPlanModule.billingPlanService as any).listPlans = originalListPlans;
  (authServiceModule.authService as any).verifyToken = originalVerifyToken;
  setDatabaseClientForTests(null as any);
  auditLogService.clear();
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
