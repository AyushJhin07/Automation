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
process.env.ENCRYPTION_MASTER_KEY =
  process.env.ENCRYPTION_MASTER_KEY ?? '0123456789abcdef0123456789abcdef';

const { getPermissionsForRole } = await import('../../../configs/rbac.ts');
const executionRoutes = (await import('../executions.js')).default;
const runExecutionManagerModule = await import('../../core/RunExecutionManager.js');
const executionReplayServiceModule = await import('../../services/ExecutionReplayService.js');

process.env.NODE_ENV = 'test';

const originalQueryExecutions =
  runExecutionManagerModule.runExecutionManager.queryExecutions.bind(
    runExecutionManagerModule.runExecutionManager,
  );
const originalGetExecution =
  runExecutionManagerModule.runExecutionManager.getExecution.bind(
    runExecutionManagerModule.runExecutionManager,
  );
const originalReplayExecution =
  executionReplayServiceModule.executionReplayService.replayExecution.bind(
    executionReplayServiceModule.executionReplayService,
  );

(runExecutionManagerModule.runExecutionManager as any).queryExecutions = async () => ({
  executions: [
    {
      executionId: 'exec-1',
      workflowId: 'wf-1',
      workflowName: 'Example workflow',
      status: 'completed',
      startTime: new Date('2024-01-01T00:00:00Z'),
      endTime: new Date('2024-01-01T00:05:00Z'),
      duration: 300000,
      triggerType: 'manual',
      triggerData: null,
      totalNodes: 2,
      completedNodes: 2,
      failedNodes: 0,
      nodeExecutions: [],
      finalOutput: null,
      error: null,
      correlationId: 'corr-1',
      tags: [],
      metadata: {},
    },
  ],
  total: 1,
  limit: 20,
  offset: 0,
  hasMore: false,
});

(runExecutionManagerModule.runExecutionManager as any).getExecution = async (
  executionId: string,
) => {
  if (executionId === 'missing') {
    return undefined;
  }
  return {
    executionId,
    workflowId: 'wf-1',
    workflowName: 'Example workflow',
    status: 'failed',
    startTime: new Date('2024-01-01T00:00:00Z'),
    endTime: null,
    duration: null,
    triggerType: 'manual',
    triggerData: null,
    totalNodes: 2,
    completedNodes: 1,
    failedNodes: 1,
    nodeExecutions: [],
    finalOutput: null,
    error: null,
    correlationId: 'corr-1',
    tags: [],
    metadata: {},
  };
};

(executionReplayServiceModule.executionReplayService as any).replayExecution = async () => ({
  executionId: 'exec-replay-1',
});

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  const roleHeader = req.headers['x-test-role'];
  const role = Array.isArray(roleHeader) ? roleHeader[0] : roleHeader;
  const normalizedRole = (role ?? 'owner').toLowerCase();
  const basePermissions = getPermissionsForRole(normalizedRole);

  const deniedRead = req.headers['x-remove-execution-read'] === 'true';
  const deniedRetry = req.headers['x-remove-execution-retry'] === 'true';

  let permissions = [...basePermissions];
  if (deniedRead) {
    permissions = permissions.filter((permission) => permission !== 'execution:read');
  }
  if (deniedRetry) {
    permissions = permissions.filter((permission) => permission !== 'execution:retry');
  }

  const shouldAttachOrg = req.headers['x-no-org'] !== 'true';

  req.user = {
    id: 'user-1',
    email: 'user@example.com',
    role: 'user',
    name: 'Test User',
    planType: 'enterprise',
    isActive: true,
    emailVerified: true,
    monthlyApiCalls: 0,
    monthlyTokensUsed: 0,
    quotaApiCalls: 1000,
    quotaTokens: 100000,
    createdAt: new Date(),
    organizationId: shouldAttachOrg ? 'org-1' : undefined,
    organizationRole: normalizedRole,
    permissions,
  } as any;

  if (shouldAttachOrg) {
    req.organizationId = 'org-1';
  }
  req.organizationRole = normalizedRole;
  req.permissions = permissions;

  next();
});
app.use('/', executionRoutes);

let server: Server | null = null;
let exitCode = 0;

try {
  server = createServer(app);
  await new Promise<void>((resolve, reject) =>
    server!.listen(0, (err?: Error) => (err ? reject(err) : resolve())),
  );

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  // Viewer retains execution:read permission and can list executions
  const allowedResponse = await fetch(`${baseUrl}/`, {
    headers: { 'x-test-role': 'viewer' },
  });
  assert.equal(allowedResponse.status, 200, 'viewer should access execution list');
  const allowedBody = await allowedResponse.json();
  assert.equal(allowedBody.success, true, 'response should indicate success');
  assert.equal(
    allowedBody.executions[0]?.executionId,
    'exec-1',
    'stubbed execution should be returned',
  );

  // Missing execution:read permission should yield 403
  const deniedResponse = await fetch(`${baseUrl}/`, {
    headers: { 'x-test-role': 'viewer', 'x-remove-execution-read': 'true' },
  });
  assert.equal(deniedResponse.status, 403, 'missing permission should be rejected');
  const deniedBody = await deniedResponse.json();
  assert.equal(deniedBody.error, 'Insufficient permissions');

  // Organization context is required for reads
  const noOrgResponse = await fetch(`${baseUrl}/`, {
    headers: { 'x-test-role': 'owner', 'x-no-org': 'true' },
  });
  assert.equal(noOrgResponse.status, 400, 'requests without org context should fail');
  const noOrgBody = await noOrgResponse.json();
  assert.equal(noOrgBody.error, 'ORGANIZATION_REQUIRED');

  // Members can retry executions when they have execution:retry
  const retryAllowed = await fetch(`${baseUrl}/exec-1/retry`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-test-role': 'member',
    },
    body: JSON.stringify({ reason: 'test retry' }),
  });
  assert.equal(retryAllowed.status, 200, 'member should be allowed to retry');
  const retryBody = await retryAllowed.json();
  assert.equal(retryBody.success, true);
  assert.equal(retryBody.executionId, 'exec-replay-1');

  // Viewers lack execution:retry and should be denied
  const retryDenied = await fetch(`${baseUrl}/exec-1/retry`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-test-role': 'viewer',
    },
    body: JSON.stringify({ reason: 'not allowed' }),
  });
  assert.equal(retryDenied.status, 403, 'viewer should be denied retry access');
  const retryDeniedBody = await retryDenied.json();
  assert.equal(retryDeniedBody.error, 'Insufficient permissions');

  console.log('Execution routes enforce permissions and organization context.');
} catch (error) {
  exitCode = 1;
  console.error(error);
} finally {
  if (server) {
    await new Promise<void>((resolve, reject) =>
      server!.close((err) => (err ? reject(err) : resolve())),
    );
  }

  (runExecutionManagerModule.runExecutionManager as any).queryExecutions = originalQueryExecutions;
  (runExecutionManagerModule.runExecutionManager as any).getExecution = originalGetExecution;
  (executionReplayServiceModule.executionReplayService as any).replayExecution =
    originalReplayExecution;

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
