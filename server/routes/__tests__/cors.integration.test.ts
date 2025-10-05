import assert from 'node:assert/strict';
import express from 'express';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

const originalNodeEnv = process.env.NODE_ENV;
const originalDatabaseUrl = process.env.DATABASE_URL;
const originalEncryptionKey = process.env.ENCRYPTION_MASTER_KEY;
const originalJwtSecret = process.env.JWT_SECRET;
const originalCorsOrigin = process.env.CORS_ORIGIN;

process.env.NODE_ENV = 'development';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://user:password@localhost:5432/testdb';
process.env.ENCRYPTION_MASTER_KEY =
  process.env.ENCRYPTION_MASTER_KEY ?? '0123456789abcdef0123456789abcdef';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-jwt-secret';

type ServerInstance = { server: Server; baseUrl: string };

async function startServer(): Promise<ServerInstance> {
  const app = express();
  app.use(express.json());

  const { registerRoutes } = await import('../../routes.ts');
  const { authenticateToken } = await import('../../middleware/auth.ts');

  await registerRoutes(app);
  app.get('/secure-test', authenticateToken, (_req, res) => {
    res.json({ ok: true });
  });

  const server = createServer(app);
  await new Promise<void>((resolve, reject) =>
    server.listen(0, (err?: Error) => (err ? reject(err) : resolve())),
  );

  const address = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function stopServer(instance: ServerInstance | null): Promise<void> {
  if (!instance) {
    return;
  }

  await new Promise<void>((resolve, reject) =>
    instance.server.close((err) => (err ? reject(err) : resolve())),
  );
}

const restoreEnv = (key: string, value: string | undefined) => {
  if (typeof value === 'undefined') {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
};

let exitCode = 0;
let server: ServerInstance | null = null;

const allowedDevOrigin = 'http://localhost:5173';
const blockedOrigin = 'https://malicious.test';
const allowedProdOrigin = 'https://app.example.com';

const { authService } = await import('../../services/AuthService');
const originalVerifyToken = authService.verifyToken;

type VerifyToken = typeof authService.verifyToken;

try {
  server = await startServer();

  const preflight = await fetch(`${server.baseUrl}/secure-test`, {
    method: 'OPTIONS',
    headers: {
      Origin: allowedDevOrigin,
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'Authorization,Content-Type',
    },
  });
  assert.equal(preflight.status, 204, 'preflight should succeed for dev defaults');
  assert.equal(
    preflight.headers.get('access-control-allow-origin'),
    allowedDevOrigin,
    'allowed origin should be echoed in preflight response',
  );
  assert.equal(
    preflight.headers.get('access-control-allow-credentials'),
    'true',
    'preflight should allow credentials',
  );

  const allowedDevResponse = await fetch(`${server.baseUrl}/secure-test`, {
    headers: { Origin: allowedDevOrigin },
  });
  const allowedDevBody = await allowedDevResponse.json();
  assert.equal(allowedDevResponse.status, 200, 'dev authenticated request should succeed');
  assert.equal(allowedDevBody.ok, true, 'dev request should resolve successfully');
  assert.equal(
    allowedDevResponse.headers.get('access-control-allow-origin'),
    allowedDevOrigin,
    'allowed dev origin should receive CORS header',
  );

  const blockedResponse = await fetch(`${server.baseUrl}/secure-test`, {
    headers: { Origin: blockedOrigin },
  });
  assert.equal(blockedResponse.status, 403, 'disallowed origins should be rejected');

  await stopServer(server);
  server = null;

  process.env.NODE_ENV = 'production';
  process.env.CORS_ORIGIN = `${allowedProdOrigin},https://admin.example.com`;

  (authService as { verifyToken: VerifyToken }).verifyToken = async () => ({
    id: 'user-1',
    email: 'user@example.com',
    name: 'CORS Tester',
    role: 'owner',
    planType: 'enterprise',
    isActive: true,
    emailVerified: true,
    monthlyApiCalls: 0,
    monthlyTokensUsed: 0,
    quotaApiCalls: 1000,
    quotaTokens: 100000,
    createdAt: new Date(),
    organizationId: 'org-1',
    organizationRole: 'owner',
    organizationPlan: 'enterprise',
    organizationStatus: 'active',
    organizationLimits: {
      maxWorkflows: 1000,
      maxExecutions: 1000,
      maxUsers: 1000,
      maxStorage: 1024,
    },
    organizationUsage: {
      apiCalls: 0,
      workflowExecutions: 0,
      storageUsed: 0,
      usersActive: 1,
    },
    activeOrganization: {
      id: 'org-1',
      name: 'Test Org',
      domain: null,
      plan: 'enterprise',
      status: 'active',
      role: 'owner',
      isDefault: true,
      limits: {
        maxWorkflows: 1000,
        maxExecutions: 1000,
        maxUsers: 1000,
        maxStorage: 1024,
      },
      usage: {
        apiCalls: 0,
        workflowExecutions: 0,
        storageUsed: 0,
        usersActive: 1,
      },
    },
    organizations: [],
    permissions: [],
  });

  server = await startServer();

  const prodPreflight = await fetch(`${server.baseUrl}/secure-test`, {
    method: 'OPTIONS',
    headers: {
      Origin: allowedProdOrigin,
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'Authorization,Content-Type',
    },
  });
  assert.equal(prodPreflight.status, 204, 'production preflight should succeed for allow list');
  assert.equal(
    prodPreflight.headers.get('access-control-allow-origin'),
    allowedProdOrigin,
    'production preflight should echo the allowed origin',
  );

  const prodResponse = await fetch(`${server.baseUrl}/secure-test`, {
    headers: {
      Origin: allowedProdOrigin,
      Authorization: 'Bearer token',
    },
  });
  const prodBody = await prodResponse.json();
  assert.equal(prodResponse.status, 200, 'allow-listed production origin should pass');
  assert.equal(prodBody.ok, true, 'production request should resolve successfully');
  assert.equal(
    prodResponse.headers.get('access-control-allow-origin'),
    allowedProdOrigin,
    'production response should include allow-listed origin header',
  );

  const prodBlocked = await fetch(`${server.baseUrl}/secure-test`, {
    headers: { Origin: blockedOrigin, Authorization: 'Bearer token' },
  });
  assert.equal(prodBlocked.status, 403, 'non allow-listed production origin should be rejected');

  console.log('CORS middleware allows only approved origins for preflight and authenticated requests.');
} catch (error) {
  exitCode = 1;
  console.error(error);
} finally {
  await stopServer(server);
  (authService as { verifyToken: VerifyToken }).verifyToken = originalVerifyToken;

  restoreEnv('NODE_ENV', originalNodeEnv);
  restoreEnv('DATABASE_URL', originalDatabaseUrl);
  restoreEnv('ENCRYPTION_MASTER_KEY', originalEncryptionKey);
  restoreEnv('JWT_SECRET', originalJwtSecret);
  restoreEnv('CORS_ORIGIN', originalCorsOrigin);

  process.exit(exitCode);
}
