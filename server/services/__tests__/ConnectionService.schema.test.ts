import assert from 'node:assert/strict';

interface StoredConnection {
  id: string;
  userId: string;
  name: string;
  provider: string;
  type: string;
  encryptedCredentials: string;
  iv: string;
  metadata: Record<string, any> | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastUsed: Date | null;
  lastTested: Date | null;
  testStatus: string | null;
  testError: string | null;
  lastError: string | null;
}

class MockConnectionDb {
  public rows: StoredConnection[] = [];

  insert() {
    return {
      values: (value: any) => {
        if ('credentialsIv' in value) {
          throw new Error('Unexpected credentialsIv column in insert payload');
        }
        if (!('iv' in value)) {
          throw new Error('Missing iv column in insert payload');
        }
        if (!('type' in value)) {
          throw new Error('Missing type column in insert payload');
        }

        const now = new Date();
        const id = `conn-${this.rows.length + 1}`;
        const stored: StoredConnection = {
          id,
          userId: value.userId,
          name: value.name,
          provider: value.provider,
          type: value.type,
          encryptedCredentials: value.encryptedCredentials,
          iv: value.iv,
          metadata: value.metadata ?? null,
          isActive: value.isActive ?? true,
          createdAt: value.createdAt ?? now,
          updatedAt: value.updatedAt ?? now,
          lastUsed: value.lastUsed ?? null,
          lastTested: value.lastTested ?? null,
          testStatus: value.testStatus ?? null,
          testError: value.testError ?? null,
          lastError: value.lastError ?? null,
        };

        this.rows.push(stored);

        return {
          returning: () => [{ id }],
        };
      },
    };
  }

  select() {
    return {
      from: () => {
        const results = this.rows.map((row) => ({ ...row }));
        const whereResult = {
          orderBy: () => results,
          then: (resolve: (value: StoredConnection[]) => void) => {
            resolve(results);
          },
        };
        return {
          where: () => whereResult,
        };
      },
    };
  }

  update() {
    return {
      set: (updates: any) => {
        if ('credentialsIv' in updates) {
          throw new Error('Unexpected credentialsIv column in update payload');
        }
        return {
          where: () => {
            const [first] = this.rows;
            if (!first) {
              return [];
            }
            Object.assign(first, updates);
            return [];
          },
        };
      },
    };
  }
}

const previousNodeEnv = process.env.NODE_ENV;
const previousMasterKey = process.env.ENCRYPTION_MASTER_KEY;
process.env.NODE_ENV = 'development';
process.env.ENCRYPTION_MASTER_KEY = process.env.ENCRYPTION_MASTER_KEY ?? '0123456789abcdef0123456789abcdef';

const { EncryptionService } = await import('../EncryptionService');
const { ConnectionService } = await import('../ConnectionService');

await EncryptionService.init();

try {
  const mockDb = new MockConnectionDb();
  const service = new ConnectionService(mockDb as any);

  const connectionId = await service.createConnection({
    userId: 'user-1',
    name: 'Custom API',
    provider: 'custom',
    type: 'saas',
    credentials: { token: 'secret-token-12345' },
    metadata: { scopes: ['workflow'] },
  });

  assert.equal(connectionId, 'conn-1');
  assert.equal(mockDb.rows.length, 1);
  assert.equal(mockDb.rows[0].type, 'saas');
  assert.ok(mockDb.rows[0].iv.length > 0, 'should store iv column');

  const testResult = await service.testConnection(connectionId, 'user-1');
  assert.equal(testResult.success, false, 'custom provider should default to failed test');
  assert.equal(mockDb.rows[0].testStatus, 'failed');
  assert.equal(mockDb.rows[0].testError, 'Testing not implemented for custom');
  assert.ok(mockDb.rows[0].lastTested instanceof Date);

  const list = await service.getUserConnections('user-1');
  assert.equal(list.length, 1);
  assert.equal(list[0].id, connectionId);
  assert.deepEqual(list[0].credentials, { token: 'secret-token-12345' });
  assert.equal(list[0].type, 'saas');
  assert.equal(list[0].testStatus, 'failed');
  assert.equal(list[0].testError, 'Testing not implemented for custom');
  assert.deepEqual(list[0].metadata, { scopes: ['workflow'] });

  console.log('ConnectionService stores and retrieves schema-aligned connection records.');
} finally {
  if (previousMasterKey === undefined) {
    delete process.env.ENCRYPTION_MASTER_KEY;
  } else {
    process.env.ENCRYPTION_MASTER_KEY = previousMasterKey;
  }
  process.env.NODE_ENV = previousNodeEnv;
}
