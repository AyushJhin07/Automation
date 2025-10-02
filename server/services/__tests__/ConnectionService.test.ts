import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.NODE_ENV = 'development';
process.env.ENCRYPTION_MASTER_KEY = process.env.ENCRYPTION_MASTER_KEY ?? 'a'.repeat(32);
process.env.ALLOW_FILE_CONNECTION_STORE = 'true';

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

const userConnections = await service.getUserConnections(request.userId, request.organizationId);
assert.equal(userConnections.length, 1, 'user should have exactly one connection');
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

await fs.rm(tempDir, { recursive: true, force: true });

delete process.env.ALLOW_FILE_CONNECTION_STORE;

console.log('ConnectionService stores type/test status metadata in sync with schema.');
