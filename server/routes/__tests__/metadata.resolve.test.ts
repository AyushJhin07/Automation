import assert from 'node:assert/strict';
import express from 'express';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

const originalEnv = {
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL,
  ENCRYPTION_MASTER_KEY: process.env.ENCRYPTION_MASTER_KEY,
  JWT_SECRET: process.env.JWT_SECRET,
};

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://user:password@localhost:5432/testdb';
process.env.ENCRYPTION_MASTER_KEY =
  process.env.ENCRYPTION_MASTER_KEY ?? '0123456789abcdef0123456789abcdef';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-jwt-secret';

const metadataRoutes = (await import('../metadata.js')).default;
const authServiceModule = await import('../../services/AuthService.js');
const connectionServiceModule = await import('../../services/ConnectionService.js');
const connectorMetadataServiceModule = await import('../../services/metadata/ConnectorMetadataService.js');
const { getPermissionsForRole } = await import('../../../configs/rbac.ts');

const originalVerifyToken = authServiceModule.authService.verifyToken.bind(
  authServiceModule.authService,
);
const originalGetConnection = connectionServiceModule.connectionService.getConnection.bind(
  connectionServiceModule.connectionService,
);
const originalResolve = connectorMetadataServiceModule.connectorMetadataService.resolve.bind(
  connectorMetadataServiceModule.connectorMetadataService,
);

let getConnectionInvoked = false;
(connectionServiceModule.connectionService as any).getConnection = async () => {
  getConnectionInvoked = true;
  throw new Error('getConnection should not be called for dev users');
};

let resolveInvoked = false;
(connectorMetadataServiceModule.connectorMetadataService as any).resolve = async () => {
  resolveInvoked = true;
  return { success: true, metadata: {}, extras: {}, warnings: [] };
};

(authServiceModule.authService as any).verifyToken = async () => {
  const limits = { maxWorkflows: 10, maxExecutions: 100, maxUsers: 5, maxStorage: 1024 };
  const usage = { apiCalls: 0, workflowExecutions: 0, storageUsed: 0, usersActive: 1 };

  return {
    id: 'dev-user',
    email: 'dev@example.com',
    name: 'Dev User',
    role: 'owner',
    planType: 'enterprise',
    isActive: true,
    emailVerified: true,
    monthlyApiCalls: 0,
    monthlyTokensUsed: 0,
    quotaApiCalls: 1000,
    quotaTokens: 1000,
    createdAt: new Date(),
    organizationId: 'test-org',
    organizationRole: 'owner',
    organizationPlan: 'enterprise',
    organizationStatus: 'active',
    organizationLimits: limits,
    organizationUsage: usage,
    activeOrganization: {
      id: 'test-org',
      name: 'Test Org',
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
app.use('/api/metadata', metadataRoutes);

const server: Server = await new Promise((resolve, reject) => {
  const listener = createServer(app);
  listener.listen(0, (err?: Error) => (err ? reject(err) : resolve(listener)));
});
server.unref();

let exitCode = 0;

try {
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const response = await fetch(`${baseUrl}/api/metadata/resolve`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer dev-token',
      'x-organization-id': 'test-org',
    },
    body: JSON.stringify({
      connector: 'demo-app',
      connectionId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    }),
  });

  assert.equal(response.status, 200, 'dev users should receive a friendly connection warning');
  const body = await response.json();
  assert.equal(body?.success, false, 'dev warning should set success=false');
  assert.equal(body?.error, 'CONNECTION_NOT_FOUND_DEV', 'dev warning should expose the dev error code');
  assert.ok(Array.isArray(body?.warnings) && body.warnings.length > 0, 'dev warning should include warnings');
  assert.equal(getConnectionInvoked, false, 'connection lookup should be skipped for dev users');
  assert.equal(resolveInvoked, false, 'metadata resolution should be skipped for missing dev connections');

  console.log('Metadata resolve returns developer warning for dev-user placeholder connections.');
} catch (error) {
  exitCode = 1;
  console.error(error);
} finally {
  server.close();

  (authServiceModule.authService as any).verifyToken = originalVerifyToken;
  (connectionServiceModule.connectionService as any).getConnection = originalGetConnection;
  (connectorMetadataServiceModule.connectorMetadataService as any).resolve = originalResolve;

  process.env.NODE_ENV = originalEnv.NODE_ENV;
  process.env.DATABASE_URL = originalEnv.DATABASE_URL;
  process.env.ENCRYPTION_MASTER_KEY = originalEnv.ENCRYPTION_MASTER_KEY;
  process.env.JWT_SECRET = originalEnv.JWT_SECRET;
}

process.exit(exitCode);
