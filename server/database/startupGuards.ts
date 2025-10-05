import { sql } from 'drizzle-orm';
import { db } from './schema';

const REQUIRED_CONNECTION_COLUMNS = [
  'data_key_ciphertext',
  'data_key_iv',
  'payload_ciphertext',
  'payload_iv',
] as const;

type RequiredConnectionColumn = (typeof REQUIRED_CONNECTION_COLUMNS)[number];

let connectionEncryptionColumnsVerified = false;

function normalizeColumnName(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) {
    return value.toLowerCase();
  }
  return null;
}

function normalizeNullability(value: unknown): 'YES' | 'NO' | 'UNKNOWN' {
  if (typeof value === 'string') {
    const normalized = value.trim().toUpperCase();
    if (normalized === 'YES' || normalized === 'NO') {
      return normalized;
    }
  }
  return 'UNKNOWN';
}

export async function ensureConnectionEncryptionColumns(): Promise<void> {
  if (connectionEncryptionColumnsVerified) {
    return;
  }

  if (!db) {
    return;
  }

  const result = await db.execute(
    sql`SELECT column_name, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'connections'`
  );

  const rows = Array.isArray((result as { rows?: unknown[] }).rows)
    ? ((result as { rows: unknown[] }).rows as Array<Record<string, unknown>>)
    : [];

  const presentColumns = new Map<RequiredConnectionColumn, 'YES' | 'NO' | 'UNKNOWN'>();
  const required = new Set<string>(REQUIRED_CONNECTION_COLUMNS);

  for (const row of rows) {
    const columnName = normalizeColumnName(
      (row.column_name ?? row.columnName ?? (row as Record<string, unknown>).columnname) as
        string | undefined
    );
    if (!columnName || !required.has(columnName)) {
      continue;
    }

    const normalizedName = columnName as RequiredConnectionColumn;
    const isNullable = normalizeNullability(
      row.is_nullable ?? row.isNullable ?? (row as Record<string, unknown>).isnullable
    );
    presentColumns.set(normalizedName, isNullable);
  }

  const missing = REQUIRED_CONNECTION_COLUMNS.filter((column) => !presentColumns.has(column));
  if (missing.length > 0) {
    throw new Error(
      `Connections table is missing required encryption columns (${missing.join(
        ', '
      )}). Run database migrations to update the schema.`
    );
  }

  const incorrectNullability = REQUIRED_CONNECTION_COLUMNS.filter(
    (column) => presentColumns.get(column) !== 'YES'
  );
  if (incorrectNullability.length > 0) {
    throw new Error(
      `Connections table has incorrect nullability for (${incorrectNullability.join(
        ', '
      )}). Run database migrations to update the schema.`
    );
  }

  connectionEncryptionColumnsVerified = true;
}

export function resetConnectionEncryptionColumnsGuardForTests(): void {
  connectionEncryptionColumnsVerified = false;
}
