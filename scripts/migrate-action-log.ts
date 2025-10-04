#!/usr/bin/env tsx
import { createReadStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';
import readline from 'node:readline';

import '../server/env.js';
import '../server/observability/index.js';
import { logAction } from '../server/utils/actionLog.js';

type SeverityLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

type MigrationSummary = {
  migrated: number;
  skipped: number;
};

const REPORTS_DIR = resolve(process.cwd(), 'production', 'reports');
const ACTION_LOG_PATH = resolve(REPORTS_DIR, 'action-log.jsonl');
const LEGACY_ROADMAP_PATH = resolve(REPORTS_DIR, 'roadmap-tasks.json');
const MIGRATION_SCOPE = 'automation.action-log.migration';

function isSeverityLevel(value: unknown): value is SeverityLevel {
  return typeof value === 'string' && ['trace', 'debug', 'info', 'warn', 'error', 'fatal'].includes(value);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

async function migrateActionLogFile(): Promise<MigrationSummary> {
  if (!(await pathExists(ACTION_LOG_PATH))) {
    console.log('ℹ️  No legacy action log found; nothing to migrate.');
    return { migrated: 0, skipped: 0 };
  }

  const stream = createReadStream(ACTION_LOG_PATH, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let migrated = 0;
  let skipped = 0;

  for await (const rawLine of rl) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      const rawSeverity = typeof parsed.severity === 'string' ? parsed.severity.toLowerCase() : undefined;
      const severity = isSeverityLevel(rawSeverity) ? rawSeverity : undefined;
      const type = typeof parsed.type === 'string' && parsed.type.trim().length > 0 ? parsed.type : 'legacy.action';
      const timestamp = (parsed.ts ?? parsed.timestamp) as string | number | Date | undefined;

      const { ts, timestamp: _ignoredTimestamp, severity: _ignoredSeverity, type: _ignoredType, ...rest } = parsed;

      logAction(
        {
          type,
          component: 'legacy.action-log',
          message: typeof parsed.message === 'string' ? parsed.message : `Migrated action ${type}`,
          attributes: { source: 'jsonl' },
          legacy: true,
          ...rest,
        },
        {
          severity: severity ?? 'info',
          scope: MIGRATION_SCOPE,
          timestamp,
        },
      );

      migrated += 1;
    } catch (error) {
      skipped += 1;
      console.warn('⚠️  Skipping malformed action log entry during migration', error);
    }
  }

  rl.close();
  stream.close();

  await fs.unlink(ACTION_LOG_PATH);

  console.log(`✅ Migrated ${migrated} legacy action events (${skipped} skipped).`);

  return { migrated, skipped };
}

async function removeLegacyRoadmapFile(): Promise<boolean> {
  if (!(await pathExists(LEGACY_ROADMAP_PATH))) {
    return false;
  }

  await fs.unlink(LEGACY_ROADMAP_PATH);
  console.log('🧹 Removed legacy roadmap-tasks.json file.');
  return true;
}

async function ensureReportsDirectoryTidied(): Promise<void> {
  if (!(await pathExists(REPORTS_DIR))) {
    return;
  }

  const entries = await fs.readdir(REPORTS_DIR);
  if (entries.length === 0) {
    await fs.rmdir(REPORTS_DIR);
    console.log('🧹 Removed empty production/reports directory.');
  }
}

async function main(): Promise<void> {
  logAction(
    {
      type: 'action.migration.start',
      component: 'action.migration',
      message: 'Starting legacy JSONL action log migration',
    },
    {
      severity: 'info',
      scope: MIGRATION_SCOPE,
    },
  );

  const summary = await migrateActionLogFile();
  const roadmapRemoved = await removeLegacyRoadmapFile();

  await ensureReportsDirectoryTidied();

  logAction(
    {
      type: 'action.migration.complete',
      component: 'action.migration',
      message: 'Completed legacy JSONL action log migration',
      migrated: summary.migrated,
      skipped: summary.skipped,
      roadmapRemoved,
    },
    {
      severity: 'info',
      scope: MIGRATION_SCOPE,
    },
  );

  // Allow background OTEL exporters to flush
  await new Promise((resolve) => setTimeout(resolve, 1500));
}

main().catch((error) => {
  console.error('❌ Migration failed', error);
  process.exitCode = 1;
});
