import { access, readFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { resolve } from 'node:path';

import { sql } from 'drizzle-orm';

type MigrationClient = { execute: (query: any) => Promise<unknown> };

type LegacyAuditEntry = {
  ts?: string;
  requestId: string;
  appId: string;
  functionId: string;
  durationMs: number;
  success: boolean;
  error?: string;
  meta?: Record<string, any> | null;
};

async function loadLegacyEntries(): Promise<LegacyAuditEntry[]> {
  const filePath = resolve(process.cwd(), 'production', 'reports', 'execution-log.jsonl');

  try {
    await access(filePath, fsConstants.F_OK | fsConstants.R_OK);
  } catch {
    console.warn('⚠️  No legacy execution audit log found, skipping backfill');
    return [];
  }

  const raw = await readFile(filePath, 'utf8');
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const entries: LegacyAuditEntry[] = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as LegacyAuditEntry;
      if (!parsed.requestId || !parsed.appId || !parsed.functionId) {
        continue;
      }
      entries.push(parsed);
    } catch (error) {
      console.warn('⚠️  Skipping malformed legacy audit line:', error);
    }
  }

  return entries;
}

export async function up(db: MigrationClient): Promise<void> {
  const entries = await loadLegacyEntries();
  if (entries.length === 0) {
    return;
  }

  let inserted = 0;

  for (const entry of entries) {
    const createdAt = entry.ts ? new Date(entry.ts) : new Date();
    const duration = Number.isFinite(entry.durationMs) ? Math.max(0, Math.floor(entry.durationMs)) : 0;
    const metaJson = entry.meta ? JSON.stringify(entry.meta) : null;
    const userId = entry.meta && typeof entry.meta === 'object' ? entry.meta.userId ?? entry.meta.user_id ?? null : null;

    try {
      await db.execute(sql`
        INSERT INTO "execution_audit_logs"
          ("request_id", "user_id", "app_id", "function_id", "duration_ms", "success", "error", "meta", "created_at")
        VALUES
          (${entry.requestId}, ${userId}, ${entry.appId}, ${entry.functionId}, ${duration}, ${entry.success}, ${entry.error ?? null}, ${metaJson}::jsonb, ${createdAt})
        ON CONFLICT DO NOTHING
      `);
      inserted += 1;
    } catch (error) {
      console.error('❌ Failed to backfill audit entry', error);
    }
  }

  console.log(`✅ Backfilled ${inserted} execution audit log entries from legacy JSONL file`);
}

export async function down(db: MigrationClient): Promise<void> {
  await db.execute(sql`DELETE FROM "execution_audit_logs"`);
}
