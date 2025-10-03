import { db } from './schema.js';

const REQUIRED_TABLES = [
  'users',
  'workflows',
  'workflow_executions',
  'workflow_versions',
  'workflow_deployments',
  'workflow_triggers',
  'polling_triggers',
  'webhook_logs',
  'webhook_dedupe',
];

let dbAvailable = Boolean(db);
let checkInFlight: Promise<boolean> | null = null;
let checkCompleted = false;
let availabilityOverride: boolean | null = null;

function getResultRows(result: any): any[] {
  if (!result) {
    return [];
  }

  if (Array.isArray(result)) {
    return result as any[];
  }

  if (Array.isArray(result?.rows)) {
    return result.rows as any[];
  }

  return [];
}

async function runDatabaseCheck(): Promise<boolean> {
  if (!db) {
    dbAvailable = false;
    checkCompleted = true;
    return false;
  }

  try {
    if (typeof (db as any).execute === 'function') {
      await (db as any).execute('select 1');
    }

    const result =
      typeof (db as any).execute === 'function'
        ? await (db as any).execute(
            "select table_name from information_schema.tables where table_schema = 'public'",
          )
        : null;

    const tables = new Set(
      getResultRows(result).map((row) =>
        row.table_name ?? row.tableName ?? row.tablename ?? row.TABLE_NAME ?? row.TableName ?? row.TABLE_NAME,
      ),
    );

    const missingTables = REQUIRED_TABLES.filter((table) => !tables.has(table));

    if (missingTables.length > 0) {
      console.warn(
        `⚠️ Database schema check failed: missing tables [${missingTables.join(
          ', ',
        )}]. Run "npm run db:push" or apply the latest migrations before enabling database features.`,
      );
      dbAvailable = false;
      checkCompleted = true;
      return false;
    }

    dbAvailable = true;
    checkCompleted = true;
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `⚠️ Database connectivity check failed: ${message}. Verify DATABASE_URL and ensure migrations have been applied.`,
    );
    dbAvailable = false;
    checkCompleted = true;
    return false;
  }
}

export async function ensureDatabaseReady(): Promise<boolean> {
  if (availabilityOverride !== null) {
    dbAvailable = availabilityOverride && Boolean(db);
    checkCompleted = true;
    return dbAvailable;
  }

  if (!db) {
    dbAvailable = false;
    checkCompleted = true;
    return false;
  }

  if (checkCompleted && !checkInFlight) {
    return dbAvailable;
  }

  if (!checkInFlight) {
    checkInFlight = runDatabaseCheck().finally(() => {
      checkInFlight = null;
    });
  }

  return checkInFlight;
}

export function isDatabaseAvailable(): boolean {
  if (availabilityOverride !== null) {
    return availabilityOverride && Boolean(db);
  }

  return dbAvailable && Boolean(db);
}

export function setDatabaseAvailabilityForTests(available: boolean): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('setDatabaseAvailabilityForTests is only available in test environments');
  }

  availabilityOverride = available;
  dbAvailable = available && Boolean(db);
  checkCompleted = true;
  checkInFlight = null;
}

export function resetDatabaseAvailabilityOverrideForTests(): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('resetDatabaseAvailabilityOverrideForTests is only available in test environments');
  }

  availabilityOverride = null;
  dbAvailable = Boolean(db);
  checkCompleted = false;
  checkInFlight = null;
}

if (process.env.NODE_ENV !== 'test') {
  void ensureDatabaseReady();
}

