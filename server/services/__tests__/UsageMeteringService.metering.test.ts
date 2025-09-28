import assert from 'node:assert/strict';
import { test } from 'node:test';

import { UsageMeteringService } from '../UsageMeteringService';
import { usageTracking, users } from '../../database/schema';

type TableType = typeof usageTracking | typeof users | Record<string, unknown>;

type UpdateEntry = {
  table: TableType;
  values: Record<string, any>;
};

type InsertEntry = {
  table: TableType;
  values: Record<string, any>;
};

class MockDb {
  public updates: UpdateEntry[] = [];
  public inserts: InsertEntry[] = [];
  public selectMap = new Map<TableType, any[]>();

  update(table: TableType) {
    return {
      set: (values: Record<string, any>) => {
        this.updates.push({ table, values });
        return {
          where: async () => {
            return [];
          }
        };
      }
    };
  }

  insert(table: TableType) {
    return {
      values: async (values: Record<string, any>) => {
        this.inserts.push({ table, values });
        return [];
      }
    };
  }

  select(_: any = undefined) {
    return {
      from: (table: TableType) => ({
        where: (_condition: any) => ({
          limit: async () => {
            return this.selectMap.get(table) ?? [];
          }
        }),
        limit: async () => {
          return this.selectMap.get(table) ?? [];
        }
      })
    };
  }

  getUpdatesForTable(table: TableType) {
    return this.updates.filter((entry) => entry.table === table);
  }
}

test('usage metering updates the usage_tracking.updated_at column when recording activity', async () => {
  const mockDb = new MockDb();
  const userId = 'user-1';

  mockDb.selectMap.set(usageTracking, [
    {
      apiCalls: 5,
      tokensUsed: 100,
      workflowRuns: 2,
      storageUsed: 0,
      estimatedCost: 500
    }
  ]);

  mockDb.selectMap.set(users, [
    {
      id: userId,
      planType: 'free',
      monthlyApiCalls: 100,
      monthlyTokensUsed: 200,
      quotaApiCalls: 1000,
      quotaTokens: 100000,
      isActive: true
    }
  ]);

  const service = new UsageMeteringService();
  (service as any).db = mockDb;

  await service.recordApiUsage(userId, 3, 150, 1.23);
  await service.recordWorkflowExecution(userId, 'workflow-1', true, 10, 4);

  const usageUpdates = mockDb.getUpdatesForTable(usageTracking);
  assert.ok(usageUpdates.length >= 2, 'Expected usage tracking updates for API and workflow operations');
  for (const update of usageUpdates) {
    assert.ok(update.values.updatedAt instanceof Date, 'updatedAt should be set to a Date instance');
  }

  const userUpdates = mockDb.getUpdatesForTable(users);
  assert.ok(userUpdates.length >= 1, 'Expected user counters to be updated');
  for (const update of userUpdates) {
    assert.ok(update.values.updatedAt instanceof Date, 'User updatedAt column should be refreshed');
  }
});
