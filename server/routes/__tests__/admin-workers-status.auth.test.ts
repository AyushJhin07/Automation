import assert from 'node:assert/strict';
import express from 'express';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

type EnvKey =
  | 'NODE_ENV'
  | 'DATABASE_URL'
  | 'ENCRYPTION_MASTER_KEY'
  | 'JWT_SECRET'
  | 'DEV_AUTO_USER_ROLE';

const originalEnv: Record<EnvKey, string | undefined> = {
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL,
  ENCRYPTION_MASTER_KEY: process.env.ENCRYPTION_MASTER_KEY,
  JWT_SECRET: process.env.JWT_SECRET,
  DEV_AUTO_USER_ROLE: process.env.DEV_AUTO_USER_ROLE,
};

process.env.NODE_ENV = 'development';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://user:password@localhost:5432/testdb';
process.env.ENCRYPTION_MASTER_KEY =
  process.env.ENCRYPTION_MASTER_KEY ?? '0123456789abcdef0123456789abcdef';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-jwt-secret';
process.env.DEV_AUTO_USER_ROLE = 'viewer';

const { registerRoutes } = await import('../../routes.ts');
const { authService } = await import('../../services/AuthService.ts');
const executionQueueModule = await import('../../services/ExecutionQueueService.js');
const schedulerLockModule = await import('../../services/SchedulerLockService.js');
const queueHealthModule = await import('../../services/QueueHealthService.js');
const rbacModule = await import('../../../configs/rbac.ts');

process.env.NODE_ENV = 'test';

const executionTelemetry = {
  started: true,
  queueDriver: 'bullmq',
  metrics: {
    queueDepths: {
      'workflow.execute.default': {
        waiting: 2,
        active: 1,
        total: 3,
      },
    },
  },
};

const schedulerTelemetry = {
  preferredStrategy: 'postgres',
  strategyOverride: 'auto',
  postgresAvailable: true,
  redis: {
    status: 'ready',
    isConnected: true,
    isConnecting: false,
  },
  memoryLocks: {
    count: 0,
    resources: [],
  },
};

const queueHealth = {
  status: 'pass' as const,
  durable: true,
  message: 'Queue healthy',
  latencyMs: 5,
  checkedAt: new Date('2024-01-01T00:00:00Z').toISOString(),
};

const originalExecutionTelemetry =
  executionQueueModule.executionQueueService.getTelemetrySnapshot.bind(
    executionQueueModule.executionQueueService,
  );
(executionQueueModule.executionQueueService as any).getTelemetrySnapshot = () =>
  executionTelemetry;

const schedulerService = new schedulerLockModule.SchedulerLockService();
const originalSchedulerTelemetry =
  schedulerService.getTelemetrySnapshot.bind(schedulerService);
(schedulerService as any).getTelemetrySnapshot = () => schedulerTelemetry;

const {
  setSchedulerLockServiceForTests,
  resetSchedulerLockServiceForTests,
} = schedulerLockModule;
setSchedulerLockServiceForTests(schedulerService);

const originalCheckQueueHealth = queueHealthModule.checkQueueHealth;
(queueHealthModule as any).checkQueueHealth = async () => queueHealth;

const originalAuditorRole = (rbacModule.ROLE_PERMISSIONS as any).auditor;
(rbacModule.ROLE_PERMISSIONS as any).auditor = {
  description: 'Audit-only role used in authorization tests',
  permissions: [],
};

const baseUser = {
  email: 'user@example.com',
  name: 'Queue Observer',
  role: 'user',
  planType: 'enterprise',
  isActive: true,
  emailVerified: true,
  monthlyApiCalls: 0,
  monthlyTokensUsed: 0,
  quotaApiCalls: 1000,
  quotaTokens: 100000,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  organizationId: 'org-queue',
  organizationPlan: 'enterprise',
  organizationStatus: 'active',
  organizationLimits: {
    maxWorkflows: 100,
    maxExecutions: 100000,
    maxUsers: 100,
    maxStorage: 1024,
  },
  organizationUsage: {
    apiCalls: 0,
    workflowExecutions: 0,
    storageUsed: 0,
    usersActive: 1,
  },
};

const organizationContext = {
  id: 'org-queue',
  name: 'Queue Ops',
  domain: null,
  plan: 'enterprise',
  status: 'active',
  isDefault: true,
  limits: baseUser.organizationLimits,
  usage: baseUser.organizationUsage,
};

const originalVerifyToken = authService.verifyToken.bind(authService);
(authService as any).verifyToken = async (token: string) => {
  if (token === 'viewer-token') {
    return {
      id: 'user-viewer',
      ...baseUser,
      organizationRole: 'viewer',
      activeOrganization: { ...organizationContext, role: 'viewer' },
      organizations: [{ ...organizationContext, role: 'viewer' }],
    };
  }

  if (token === 'auditor-token') {
    return {
      id: 'user-auditor',
      ...baseUser,
      organizationRole: 'auditor',
      activeOrganization: { ...organizationContext, role: 'auditor' },
      organizations: [{ ...organizationContext, role: 'auditor' }],
    };
  }

  return null;
};

const app = express();
app.use(express.json());

let server: Server | null = null;
let exitCode = 0;

try {
  await registerRoutes(app);
  server = createServer(app);

  await new Promise<void>((resolve, reject) =>
    server!.listen(0, (err?: Error) => (err ? reject(err) : resolve())),
  );

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const allowedResponse = await fetch(`${baseUrl}/api/admin/workers/status`, {
    headers: {
      authorization: 'Bearer viewer-token',
      'x-organization-id': 'org-queue',
    },
  });

  assert.equal(
    allowedResponse.status,
    200,
    'viewer with execution:read permission should access worker status',
  );
  const allowedBody = await allowedResponse.json();
  assert.equal(allowedBody.success, true, 'response should indicate success');
  assert.equal(
    allowedBody.data.executionWorker.queueDriver,
    executionTelemetry.queueDriver,
    'execution telemetry should surface from stubbed service',
  );
  assert.equal(
    allowedBody.data.scheduler.redis.status,
    schedulerTelemetry.redis.status,
    'scheduler telemetry should match stubbed service',
  );
  assert.equal(
    allowedBody.data.queue.status,
    queueHealth.status,
    'queue health snapshot should match stubbed value',
  );

  const deniedResponse = await fetch(`${baseUrl}/api/admin/workers/status`, {
    headers: {
      authorization: 'Bearer auditor-token',
      'x-organization-id': 'org-queue',
    },
  });

  assert.equal(
    deniedResponse.status,
    403,
    'user lacking execution:read permission should receive 403',
  );
  const deniedBody = await deniedResponse.json();
  assert.equal(deniedBody.error, 'Insufficient permissions');

  console.log(
    'Worker status endpoint authorizes execution:read and rejects users without the permission.',
  );
} catch (error) {
  exitCode = 1;
  console.error(error);
} finally {
  if (server) {
    await new Promise<void>((resolve, reject) =>
      server!.close((err) => (err ? reject(err) : resolve())),
    );
  }

  (executionQueueModule.executionQueueService as any).getTelemetrySnapshot =
    originalExecutionTelemetry;
  (schedulerService as any).getTelemetrySnapshot = originalSchedulerTelemetry;
  resetSchedulerLockServiceForTests();
  (queueHealthModule as any).checkQueueHealth = originalCheckQueueHealth;

  if (originalAuditorRole) {
    (rbacModule.ROLE_PERMISSIONS as any).auditor = originalAuditorRole;
  } else {
    delete (rbacModule.ROLE_PERMISSIONS as any).auditor;
  }

  (authService as any).verifyToken = originalVerifyToken;

  const restoreEnv = (key: EnvKey, value: string | undefined) => {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  };

  (['NODE_ENV', 'DATABASE_URL', 'ENCRYPTION_MASTER_KEY', 'JWT_SECRET', 'DEV_AUTO_USER_ROLE'] as EnvKey[]).forEach(
    (key) => restoreEnv(key, originalEnv[key]),
  );

  process.exit(exitCode);
}
