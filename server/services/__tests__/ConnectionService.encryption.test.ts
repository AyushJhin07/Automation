import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

process.env.NODE_ENV = 'development';
process.env.ENCRYPTION_MASTER_KEY = 'a'.repeat(32);
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
const initialNodeEnv = process.env.NODE_ENV;
process.env.NODE_ENV = 'test';
setDatabaseClientForTests(null);
process.env.NODE_ENV = initialNodeEnv;

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
  organizationId: 'org-123',
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
assert.equal(storedRecords[0].encryptionKeyId ?? null, null, 'file store connections default to legacy key metadata');
assert.equal(
  storedRecords[0].dataKeyCiphertext ?? null,
  null,
  'file store connections should not persist KMS data key ciphertext by default'
);
assert.equal(
  storedRecords[0].dataKeyIv ?? null,
  null,
  'file store connections should not persist data key IV metadata by default'
);
assert.equal(
  storedRecords[0].payloadCiphertext,
  storedRecords[0].encryptedCredentials,
  'file store connections should dual-write payload ciphertext metadata'
);
assert.equal(
  storedRecords[0].payloadIv,
  storedRecords[0].iv,
  'file store connections should dual-write payload IV metadata'
);

const fetched = await service.getConnection(connectionId, 'user-123', 'org-123');
assert.ok(fetched, 'connection should be retrievable');
assert.equal(fetched?.iv, storedRecords[0].iv, 'fetched connection exposes iv');
assert.deepEqual(fetched?.credentials, originalCredentials, 'credentials should decrypt to original payload');
assert.equal(fetched?.encryptionKeyId ?? null, null, 'fetched connection exposes encryptionKeyId metadata');
assert.equal(fetched?.dataKeyCiphertext ?? null, null, 'fetched connection exposes dataKeyCiphertext metadata');
assert.equal(fetched?.dataKeyIv ?? null, null, 'fetched connection exposes dataKeyIv metadata');
assert.equal(
  fetched?.payloadCiphertext ?? null,
  storedRecords[0].payloadCiphertext,
  'fetched connection exposes payload ciphertext metadata'
);
assert.equal(
  fetched?.payloadIv ?? null,
  storedRecords[0].payloadIv,
  'fetched connection exposes payload IV metadata'
);

const byProvider = await service.getConnectionByProvider('user-123', 'org-123', 'openai');
assert.ok(byProvider, 'connection should be retrievable by provider');
assert.equal(byProvider?.iv, storedRecords[0].iv, 'provider lookup exposes iv');
assert.deepEqual(byProvider?.credentials, originalCredentials, 'provider lookup decrypts credentials');
assert.equal(byProvider?.encryptionKeyId ?? null, null, 'provider lookup exposes encryptionKeyId');
assert.equal(byProvider?.dataKeyCiphertext ?? null, null, 'provider lookup exposes dataKeyCiphertext');
assert.equal(byProvider?.dataKeyIv ?? null, null, 'provider lookup exposes dataKeyIv');
assert.equal(
  byProvider?.payloadCiphertext ?? null,
  storedRecords[0].payloadCiphertext,
  'provider lookup exposes payload ciphertext'
);
assert.equal(
  byProvider?.payloadIv ?? null,
  storedRecords[0].payloadIv,
  'provider lookup exposes payload IV'
);

const {
  connections: allConnections,
  problems: roundTripProblems,
} = await service.getUserConnections('user-123', 'org-123', 'openai');
assert.equal(allConnections.length, 1, 'user should have one connection after creation');
assert.equal(roundTripProblems.length, 0, 'round trip should not surface decrypt problems');
assert.equal(allConnections[0].iv, storedRecords[0].iv, 'list entries expose iv');
assert.deepEqual(allConnections[0].credentials, originalCredentials, 'list entries decrypt credentials');
assert.equal(allConnections[0].encryptionKeyId ?? null, null, 'list entries expose encryptionKeyId');
assert.equal(allConnections[0].dataKeyCiphertext ?? null, null, 'list entries expose dataKeyCiphertext');
assert.equal(allConnections[0].dataKeyIv ?? null, null, 'list entries expose dataKeyIv');
assert.equal(
  allConnections[0].payloadCiphertext ?? null,
  storedRecords[0].payloadCiphertext,
  'list entries expose payload ciphertext metadata'
);
assert.equal(
  allConnections[0].payloadIv ?? null,
  storedRecords[0].payloadIv,
  'list entries expose payload IV metadata'
);

await rm(tempDir, { recursive: true, force: true });
delete process.env.CONNECTION_STORE_PATH;
delete process.env.ALLOW_FILE_CONNECTION_STORE;

console.log('ConnectionService encrypt/decrypt round trip verified via file store.');

const guardModule = (await import('../../database/startupGuards.js')) as {
  resetConnectionEncryptionColumnsGuardForTests: () => void;
};
const { resetConnectionEncryptionColumnsGuardForTests } = guardModule;

const failingDb = {
  async execute() {
    return {
      rows: [
        { column_name: 'data_key_ciphertext', is_nullable: 'YES' },
        { column_name: 'data_key_iv', is_nullable: 'YES' },
        { column_name: 'payload_ciphertext', is_nullable: 'YES' },
      ],
    };
  },
};

const originalNodeEnv = process.env.NODE_ENV;
process.env.NODE_ENV = 'test';
setDatabaseClientForTests(failingDb as any);
process.env.NODE_ENV = originalNodeEnv;

resetConnectionEncryptionColumnsGuardForTests();

const guardService = new ConnectionService();

await assert.rejects(
  async () =>
    guardService.storeConnection(
      'user-migration',
      'org-migration',
      'OpenAI',
      {
        accessToken: 'token',
        refreshToken: 'refresh',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
    ),
  (error: any) => {
    assert.match(error?.message ?? '', /Run database migrations/i);
    assert.match(error?.message ?? '', /payload_iv/);
    return true;
  }
);

process.env.NODE_ENV = 'test';
setDatabaseClientForTests(originalDbClient ?? null);
process.env.NODE_ENV = originalNodeEnv;
resetConnectionEncryptionColumnsGuardForTests();

console.log('ConnectionService migration guard verified for missing payload_iv column.');

process.exit(0);
