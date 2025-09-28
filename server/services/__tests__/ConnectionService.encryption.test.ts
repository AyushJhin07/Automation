import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

process.env.NODE_ENV = 'development';
process.env.ENCRYPTION_MASTER_KEY = 'a'.repeat(32);

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'connection-service-'));
process.env.CONNECTION_STORE_PATH = path.join(tempDir, 'connections.json');

const { EncryptionService } = await import('../EncryptionService.js');
await EncryptionService.init();

const { ConnectionService } = await import('../ConnectionService.js');
const service = new ConnectionService();

const originalCredentials = {
  apiKey: `sk-${'a'.repeat(50)}`,
  region: 'us-east-1',
};

const connectionId = await service.createConnection({
  userId: 'user-123',
  name: 'Test Connection',
  provider: 'OpenAI',
  type: 'llm',
  credentials: originalCredentials,
  metadata: { createdBy: 'unit-test' },
});

const storedRaw = await readFile(process.env.CONNECTION_STORE_PATH!, 'utf8');
const storedRecords = JSON.parse(storedRaw);
assert.equal(storedRecords.length, 1, 'a single connection record should be stored');
assert.ok(storedRecords[0].iv, 'stored connection should include an iv field');
assert.equal('credentialsIv' in storedRecords[0], false, 'legacy credentialsIv field should not be present');

const fetched = await service.getConnection(connectionId, 'user-123');
assert.ok(fetched, 'connection should be retrievable');
assert.equal(fetched?.iv, storedRecords[0].iv, 'fetched connection exposes iv');
assert.deepEqual(fetched?.credentials, originalCredentials, 'credentials should decrypt to original payload');

const byProvider = await service.getConnectionByProvider('user-123', 'openai');
assert.ok(byProvider, 'connection should be retrievable by provider');
assert.equal(byProvider?.iv, storedRecords[0].iv, 'provider lookup exposes iv');
assert.deepEqual(byProvider?.credentials, originalCredentials, 'provider lookup decrypts credentials');

const allConnections = await service.getUserConnections('user-123', 'openai');
assert.equal(allConnections.length, 1, 'user should have one connection after creation');
assert.equal(allConnections[0].iv, storedRecords[0].iv, 'list entries expose iv');
assert.deepEqual(allConnections[0].credentials, originalCredentials, 'list entries decrypt credentials');

await rm(tempDir, { recursive: true, force: true });
delete process.env.CONNECTION_STORE_PATH;

console.log('ConnectionService encrypt/decrypt round trip verified via file store.');
