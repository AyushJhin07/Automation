import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.NODE_ENV = 'development';
process.env.ENCRYPTION_MASTER_KEY = process.env.ENCRYPTION_MASTER_KEY ?? 'a'.repeat(32);
process.env.ALLOW_FILE_CONNECTION_STORE = 'true';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://user:password@localhost:5432/test-db';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-jwt-secret';

const schemaModule = (await import('../../database/schema.js')) as {
  setDatabaseClientForTests: (client: any) => void;
  db: any;
};
const { setDatabaseClientForTests } = schemaModule;
const originalDbClient = schemaModule.db;
const originalNodeEnv = process.env.NODE_ENV;
process.env.NODE_ENV = 'test';
setDatabaseClientForTests(null);
process.env.NODE_ENV = originalNodeEnv;

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'connection-service-'));
const storePath = path.join(tempDir, 'connections.json');
process.env.CONNECTION_STORE_PATH = storePath;

const { EncryptionService } = await import('../EncryptionService.js');
await EncryptionService.init();

const { ConnectionService } = await import('../ConnectionService.js');

const service = new ConnectionService();

const request = {
  userId: 'user-123',
  organizationId: 'org-123',
  name: 'Test Connection',
  provider: 'custom-service',
  type: 'saas' as const,
  credentials: {
    token: 'abc123',
  },
  metadata: {
    region: 'us-east-1',
  },
};

const connectionId = await service.createConnection(request);
assert.ok(connectionId, 'should return a connection id');

const testResult = await service.testConnection(connectionId, request.userId, request.organizationId);
assert.equal(testResult.provider, request.provider, 'test returns provider name');
assert.equal(testResult.success, false, 'unknown providers fall back to not implemented');

const {
  connections: userConnections,
  problems: initialProblems,
} = await service.getUserConnections(request.userId, request.organizationId);
assert.equal(userConnections.length, 1, 'user should have exactly one connection');
assert.equal(initialProblems.length, 0, 'no problems expected for fresh connection');
const [connection] = userConnections;

assert.equal(connection?.id, connectionId, 'connection ids should match');
assert.equal(connection?.type, request.type, 'connection type persisted');
assert.equal(connection?.testStatus, 'failed', 'test status persisted');
assert.equal(
  connection?.testError,
  testResult.message,
  'test error message captured during failed test'
);

const fetched = await service.getConnection(connectionId, request.userId, request.organizationId);
assert.ok(fetched, 'connection can be fetched by id');
assert.equal(fetched?.type, request.type, 'fetched connection preserves type');
assert.equal(fetched?.testStatus, 'failed', 'fetched connection includes test status');
assert.equal(fetched?.testError, testResult.message, 'fetched connection includes test error');

// Verify expiring OAuth tokens are refreshed transparently
const oauthModule = await import('../../oauth/OAuthManager.js');
const originalRefresh = oauthModule.oauthManager.refreshToken;
let refreshCalled = 0;

try {
  oauthModule.oauthManager.refreshToken = async (userId, organizationId, providerId) => {
    refreshCalled++;
    assert.equal(providerId, 'gmail', 'refreshToken should be called with the connection provider');
    const newTokens = {
      accessToken: 'new-access-token',
      refreshToken: 'updated-refresh-token',
      expiresAt: Date.now() + 60_000
    };
    await service.storeConnection(userId, organizationId, providerId, newTokens, undefined, {
      name: 'Gmail Account',
      type: 'saas',
      connectionId: gmailConnectionId
    });
    return newTokens;
  };

  const gmailConnectionId = await service.storeConnection(
    request.userId,
    request.organizationId,
    'gmail',
    {
      accessToken: 'stale-access-token',
      refreshToken: 'updated-refresh-token',
      expiresAt: Date.now() - 1000
    },
    undefined,
    { name: 'Gmail Account', type: 'saas' }
  );

  const refreshedConnection = await service.getConnectionWithFreshTokens(
    gmailConnectionId,
    request.userId,
    request.organizationId
  );

  assert.equal(refreshCalled, 1, 'expired OAuth credentials should trigger a refresh');
  assert.equal(
    refreshedConnection?.credentials.accessToken,
    'new-access-token',
    'refreshed connection should include the new access token'
  );
  assert.ok(
    refreshedConnection?.metadata?.expiresAt && Date.parse(refreshedConnection.metadata.expiresAt) > Date.now(),
    'refreshed metadata should expose a future expiry'
  );

  const autoRefreshContext = await service.prepareConnectionForClient({
    connectionId: gmailConnectionId,
    userId: request.userId,
    organizationId: request.organizationId,
  });

  assert.ok(autoRefreshContext, 'prepareConnectionForClient should return a context object');
  assert.equal(
    typeof autoRefreshContext?.credentials.onTokenRefreshed,
    'function',
    'credentials should expose an onTokenRefreshed callback'
  );

  await autoRefreshContext?.credentials.onTokenRefreshed?.({
    accessToken: 'auto-refresh-token',
    expiresAt: Date.now() + 120_000,
  });

  const persisted = await service.getConnection(gmailConnectionId, request.userId, request.organizationId);
  assert.equal(persisted?.credentials.accessToken, 'auto-refresh-token', 'persisted connection should include refreshed token');
  assert.ok(
    persisted?.metadata?.refreshedAt && Date.parse(persisted.metadata.refreshedAt) <= Date.now(),
    'metadata should record refreshedAt timestamp after callback'
  );
} finally {
  oauthModule.oauthManager.refreshToken = originalRefresh;
}

// Seed a broken connection payload to ensure degraded responses are returned gracefully
const rawRecords = JSON.parse(await fs.readFile(storePath, 'utf8'));
assert.ok(Array.isArray(rawRecords), 'file store should contain an array of connections');
const templateRecord = rawRecords.find((record: any) => record?.id === connectionId);
assert.ok(templateRecord, 'file store should contain the good connection');
rawRecords.push({
  ...templateRecord,
  id: 'broken-connection',
  name: 'Broken Credentials',
  provider: 'corrupted-service',
  payloadCiphertext: 'definitely-not-valid',
  payloadIv: 'bad-iv',
  encryptedCredentials: 'bad-data',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});
await fs.writeFile(storePath, JSON.stringify(rawRecords, null, 2));

const {
  connections: healthyConnections,
  problems,
} = await service.getUserConnections(request.userId, request.organizationId);
assert.ok(
  healthyConnections.some(conn => conn.id === connectionId),
  'healthy connections should still include the original connection'
);
assert.equal(problems.length, 1, 'broken connection should be reported as a problem');
assert.equal(problems[0]?.id, 'broken-connection', 'problem should reference the broken record id');
assert.equal(problems[0]?.status, 'BROKEN_DECRYPT', 'problem should be marked as BROKEN_DECRYPT');
assert.equal(problems[0]?.provider, 'corrupted-service', 'problem should preserve provider metadata');
assert.ok((problems[0]?.error || '').length > 0, 'problem should include an error message');

await fs.rm(tempDir, { recursive: true, force: true });

delete process.env.ALLOW_FILE_CONNECTION_STORE;

process.env.NODE_ENV = 'test';
setDatabaseClientForTests(originalDbClient);
process.env.NODE_ENV = originalNodeEnv;

console.log('ConnectionService stores type/test status metadata in sync with schema.');
