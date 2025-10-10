import assert from 'node:assert/strict';
import express from 'express';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

const originalNodeEnv = process.env.NODE_ENV;
const originalDatabaseUrl = process.env.DATABASE_URL;
const originalEncryptionKey = process.env.ENCRYPTION_MASTER_KEY;
const originalJwtSecret = process.env.JWT_SECRET;

process.env.NODE_ENV = 'production';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://user:password@localhost:5432/testdb';
process.env.ENCRYPTION_MASTER_KEY =
  process.env.ENCRYPTION_MASTER_KEY ?? '0123456789abcdef0123456789abcdef';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-jwt-secret';

const { registerRoutes } = await import('../../routes.ts');
const authServiceModule = await import('../../services/AuthService.ts');
const connectorRegistryModule = await import('../../ConnectorRegistry.ts');
const { getPermissionsForRole } = await import('../../../configs/rbac');

const originalGetRegistryInstance = connectorRegistryModule.ConnectorRegistry.getInstance.bind(
  connectorRegistryModule.ConnectorRegistry,
);

const sampleConnector = {
  id: 'demo-app',
  name: 'Demo App',
  displayName: 'Demo App',
  description: 'Sample connector for testing',
  category: 'Testing',
  labels: ['testing'],
  icon: 'demo',
  color: '#123456',
  availability: 'stable',
  pricingTier: 'enterprise',
  status: { beta: false, privatePreview: false, deprecated: false, hidden: false, featured: false },
  release: { status: 'stable', isBeta: false },
  hasImplementation: true,
  actions: [
    { id: 'act1', name: 'Action One', description: 'Does something', params: { type: 'object', properties: {} } },
  ],
  triggers: [
    { id: 'trig1', name: 'Trigger One', description: 'Responds to events', params: { type: 'object', properties: {} } },
  ],
  authentication: {
    type: 'oauth2',
    config: { clientId: 'client', scopes: ['read', 'write'] },
  },
};

(connectorRegistryModule.ConnectorRegistry as any).getInstance = () => ({
  listConnectors: async () => [sampleConnector],
});

const app = express();
app.use(express.json());

await registerRoutes(app);

const server: Server = await new Promise((resolve, reject) => {
  const listener = createServer(app);
  listener.listen(0, (err?: Error) => (err ? reject(err) : resolve(listener)));
});
server.unref();

let exitCode = 0;
const originalVerifyToken = authServiceModule.authService.verifyToken.bind(
  authServiceModule.authService,
);

try {
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const anonymousResponse = await fetch(`${baseUrl}/api/metadata/v1/connectors`);
  assert.equal(anonymousResponse.status, 200, 'anonymous catalog should be accessible');
  const anonymousBody = await anonymousResponse.json();
  const anonymousConnectors =
    anonymousBody?.data?.connectors ?? anonymousBody?.connectors ?? [];
  assert(Array.isArray(anonymousConnectors) && anonymousConnectors.length > 0);
  anonymousConnectors.forEach((connector: any) => {
    const firstAction = connector.actions?.[0];
    if (firstAction) {
      assert.equal(typeof firstAction.runtimeSupport?.appsScript, 'boolean', 'actions should include runtime support');
      assert.equal(typeof firstAction.runtimeSupport?.nodeJs, 'boolean', 'actions should expose nodeJs runtime support');
    }
    const firstTrigger = connector.triggers?.[0];
    if (firstTrigger) {
      assert.equal(typeof firstTrigger.runtimeSupport?.appsScript, 'boolean', 'triggers should include runtime support');
      assert.equal(typeof firstTrigger.runtimeSupport?.nodeJs, 'boolean', 'triggers should expose nodeJs runtime support');
    }
    assert.equal(
      connector.pricingTier ?? null,
      null,
      'public catalog should omit entitlement tiers',
    );
    if (Array.isArray(connector.scopes)) {
      assert.equal(
        connector.scopes.length,
        0,
        'public catalog scopes should be empty',
      );
    }
    if (connector.authentication) {
      assert.equal(
        connector.authentication.config ?? null,
        null,
        'public catalog should not expose authentication config',
      );
    }
    if (connector.lifecycle) {
      assert.equal(
        'raw' in connector.lifecycle,
        false,
        'public catalog should not expose lifecycle raw metadata',
      );
    }
  });

  (authServiceModule.authService as any).verifyToken = async () => {
    const limits = { maxWorkflows: 100, maxExecutions: 1000, maxUsers: 10, maxStorage: 1024 };
    const usage = { apiCalls: 0, workflowExecutions: 0, storageUsed: 0, usersActive: 1 };

    return {
      id: 'test-user',
      email: 'test@example.com',
      name: 'Test User',
      role: 'owner',
      planType: 'enterprise',
      isActive: true,
      emailVerified: true,
      monthlyApiCalls: 0,
      monthlyTokensUsed: 0,
      quotaApiCalls: 1000,
      quotaTokens: 100000,
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

  const authenticatedResponse = await fetch(`${baseUrl}/api/metadata/v1/connectors`, {
    headers: { Authorization: 'Bearer valid-token' },
  });
  assert.equal(authenticatedResponse.status, 200, 'authenticated catalog should be accessible');
  const authenticatedBody = await authenticatedResponse.json();
  const authenticatedConnectors =
    authenticatedBody?.data?.connectors ?? authenticatedBody?.connectors ?? [];
  assert(Array.isArray(authenticatedConnectors) && authenticatedConnectors.length > 0);

  authenticatedConnectors.forEach((connector: any) => {
    const firstAction = connector.actions?.[0];
    if (firstAction) {
      assert.equal(typeof firstAction.runtimeSupport?.appsScript, 'boolean', 'actions should include runtime support');
      assert.equal(typeof firstAction.runtimeSupport?.nodeJs, 'boolean', 'actions should expose nodeJs runtime support');
    }
    const firstTrigger = connector.triggers?.[0];
    if (firstTrigger) {
      assert.equal(typeof firstTrigger.runtimeSupport?.appsScript, 'boolean', 'triggers should include runtime support');
      assert.equal(typeof firstTrigger.runtimeSupport?.nodeJs, 'boolean', 'triggers should expose nodeJs runtime support');
    }
    assert.equal(
      connector.pricingTier ?? null,
      null,
      'authenticated catalog should omit entitlement tiers',
    );
    if (Array.isArray(connector.scopes)) {
      assert.equal(
        connector.scopes.length,
        0,
        'authenticated catalog scopes should be empty',
      );
    }
    if (connector.authentication) {
      assert.equal(
        connector.authentication.config ?? null,
        null,
        'authenticated catalog should not expose authentication config',
      );
    }
    if (connector.lifecycle) {
      assert.equal(
        'raw' in connector.lifecycle,
        false,
        'authenticated catalog should not expose lifecycle raw metadata',
      );
    }
  });

  console.log('Metadata catalog exposes sanitized metadata for anonymous and authenticated access.');
} catch (error) {
  exitCode = 1;
  console.error(error);
} finally {
  (authServiceModule.authService as any).verifyToken = originalVerifyToken;
  (connectorRegistryModule.ConnectorRegistry as any).getInstance = originalGetRegistryInstance;

  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );

  const restore = (
    key: 'NODE_ENV' | 'DATABASE_URL' | 'ENCRYPTION_MASTER_KEY' | 'JWT_SECRET',
    value: string | undefined,
  ) => {
    if (value) {
      process.env[key] = value;
    } else {
      delete process.env[key];
    }
  };

  restore('NODE_ENV', originalNodeEnv);
  restore('DATABASE_URL', originalDatabaseUrl);
  restore('ENCRYPTION_MASTER_KEY', originalEncryptionKey);
  restore('JWT_SECRET', originalJwtSecret);

  process.exit(exitCode);
}
