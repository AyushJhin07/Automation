#!/usr/bin/env tsx
import process from 'node:process';
import { eq } from 'drizzle-orm';
import {
  db,
  workflowTriggers,
  pollingTriggers,
} from '../server/database/schema.js';
import { getErrorMessage } from '../server/types/common.js';

async function ensureDatabase(): Promise<typeof db> {
  if (!db) {
    throw new Error('DATABASE_URL is required to use the trigger admin tool.');
  }
  return db;
}

async function listTriggers(): Promise<void> {
  const database = await ensureDatabase();
  const rows = await database.select().from(workflowTriggers);

  if (rows.length === 0) {
    console.log('No triggers found.');
    return;
  }

  console.table(
    rows.map((row) => ({
      id: row.id,
      workflowId: row.workflowId,
      type: row.type,
      appId: row.appId,
      triggerId: row.triggerId,
      active: row.isActive,
      endpoint: row.endpoint,
      updatedAt: row.updatedAt,
    }))
  );
}

async function showTrigger(id: string): Promise<void> {
  const database = await ensureDatabase();
  const [record] = await database
    .select()
    .from(workflowTriggers)
    .where(eq(workflowTriggers.id, id))
    .limit(1);

  if (!record) {
    console.log(`Trigger ${id} not found.`);
    return;
  }

  console.log(JSON.stringify(record, null, 2));
}

async function disableTrigger(id: string): Promise<void> {
  const database = await ensureDatabase();

  const result = await database
    .update(workflowTriggers)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(workflowTriggers.id, id))
    .returning({ id: workflowTriggers.id });

  if (result.length === 0) {
    console.error(`Trigger ${id} not found in workflow_triggers.`);
    return;
  }

  await database
    .update(pollingTriggers)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(pollingTriggers.id, id));

  console.log(`Trigger ${id} disabled.`);
}

async function main(): Promise<void> {
  const [, , command, arg] = process.argv;

  try {
    switch (command) {
      case 'list':
        await listTriggers();
        break;
      case 'show':
        if (!arg) {
          throw new Error('Usage: trigger-admin show <trigger-id>');
        }
        await showTrigger(arg);
        break;
      case 'disable':
        if (!arg) {
          throw new Error('Usage: trigger-admin disable <trigger-id>');
        }
        await disableTrigger(arg);
        break;
      default:
        console.log('Usage: trigger-admin <list|show|disable> [trigger-id]');
        break;
    }
  } catch (error) {
    console.error(`Trigger admin command failed: ${getErrorMessage(error)}`);
    process.exitCode = 1;
  }
}

await main();
