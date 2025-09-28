import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import type { CreateConnectionRequest } from '../ConnectionService.js';

class MockConnectionDatabase {
  public rows: any[] = [];

  insert(_table: unknown) {
    return {
      values: (value: Record<string, any>) => {
        const now = new Date();
        const row = {
          id: value.id ?? randomUUID(),
          createdAt: value.createdAt ?? now,
          updatedAt: value.updatedAt ?? now,
          lastTested: value.lastTested ?? null,
          testStatus: value.testStatus ?? null,
          testError: value.testError ?? null,
          ...value,
        };

        this.rows.push(row);

        return {
          returning: () => Promise.resolve([{ id: row.id }]),
        };
      },
    };
  }

  select() {
    return {
      from: (_table: unknown) => ({
        where: () => {
          const result = [...this.rows];
          return {
            orderBy: () => Promise.resolve(result),
            then: (resolve: (value: any[]) => unknown, reject?: (reason: unknown) => unknown) =>
              Promise.resolve(result).then(resolve, reject),
          };
        },
      }),
    };
  }

  update(_table: unknown) {
    return {
      set: (update: Record<string, any>) => ({
        where: () => {
          this.rows = this.rows.map((row) => ({ ...row, ...update }));
          return Promise.resolve([]);
        },
      }),
    };
  }
}

process.env.NODE_ENV = 'development';
process.env.ENCRYPTION_MASTER_KEY = '0123456789abcdef0123456789abcdef';

const { EncryptionService } = await import('../EncryptionService.js');
await EncryptionService.init();

const { ConnectionService } = await import('../ConnectionService.js');

const mockDb = new MockConnectionDatabase();
const service = new ConnectionService();
(service as any).db = mockDb;

const request: CreateConnectionRequest = {
  userId: randomUUID(),
  name: 'Test Connection',
  provider: 'openai',
  type: 'llm',
  credentials: {
    apiKey: `sk-${'a'.repeat(48)}`,
  },
  metadata: { region: 'us-east-1' },
};

const connectionId = await service.createConnection(request);

assert.ok(connectionId, 'should return generated connection id');

const stored = mockDb.rows.find((row) => row.id === connectionId);
assert.ok(stored, 'should persist encrypted connection');
assert.ok(stored.iv, 'should store initialization vector');

const decrypted = await service.getConnection(connectionId, request.userId);

assert.ok(decrypted, 'should retrieve connection');
assert.equal(decrypted?.credentials.apiKey, request.credentials.apiKey, 'should decrypt credentials');
assert.equal(decrypted?.iv, stored.iv, 'should expose IV on decrypted connection');

const allConnections = await service.getUserConnections(request.userId, request.provider);

assert.equal(allConnections.length, 1, 'should return stored connection for user');
assert.equal(allConnections[0].credentials.apiKey, request.credentials.apiKey, 'should decrypt credentials in list response');
assert.equal(allConnections[0].iv, stored.iv, 'should expose IV in list response');

console.log('ConnectionService encrypts, stores, and decrypts credentials with IV round-trip.');
