import { and, desc, eq, lt } from 'drizzle-orm';

import { db, executionAuditLogs } from '../database/schema.js';
import { env } from '../env';
import { logAction } from '../utils/actionLog.js';

type AuditEntry = {
  id: number;
  ts: string;
  requestId: string;
  userId?: string | null;
  appId: string;
  functionId: string;
  durationMs: number;
  success: boolean;
  error?: string | null;
  meta?: Record<string, any> | null;
};

type RecordExecutionInput = {
  requestId: string;
  userId?: string | null;
  appId: string;
  functionId: string;
  durationMs: number;
  success: boolean;
  error?: string;
  meta?: Record<string, any> | null;
};

type ReadExecutionsOptions = {
  limit?: number;
  requestId?: string;
  appId?: string;
  userId?: string;
  success?: boolean;
};

const RETENTION_DAYS = Math.max(0, Number.isFinite(env.EXECUTION_AUDIT_RETENTION_DAYS)
  ? Number(env.EXECUTION_AUDIT_RETENTION_DAYS)
  : 30);
const RETENTION_SWEEP_INTERVAL_MS = 1000 * 60 * 60; // hourly

let lastRetentionSweep = 0;

async function enforceRetention(): Promise<void> {
  if (!db || RETENTION_DAYS <= 0) {
    return;
  }

  const now = Date.now();
  if (now - lastRetentionSweep < RETENTION_SWEEP_INTERVAL_MS) {
    return;
  }

  const cutoff = new Date(now - RETENTION_DAYS * 24 * 60 * 60 * 1000);

  try {
    await db.delete(executionAuditLogs).where(lt(executionAuditLogs.createdAt, cutoff));
    logAction(
      {
        type: 'execution.audit.retention',
        component: 'execution.audit',
        message: `Pruned execution audit events older than ${RETENTION_DAYS} days`,
        cutoff: cutoff.toISOString(),
        retentionDays: RETENTION_DAYS,
      },
      {
        severity: 'debug',
        scope: 'automation.execution.audit',
        timestamp: new Date(now),
      },
    );
  } catch (error) {
    console.warn('⚠️ Failed to enforce execution audit retention policy', error);
  } finally {
    lastRetentionSweep = now;
  }
}

export async function recordExecution(entry: RecordExecutionInput): Promise<void> {
  const createdAt = new Date();
  const durationMs = Math.max(0, Math.floor(entry.durationMs));

  logAction(
    {
      type: 'execution.audit',
      component: 'execution.audit',
      message: entry.success
        ? 'Connector execution completed successfully'
        : entry.error ?? 'Connector execution failed',
      outcome: entry.success ? 'success' : 'failure',
      requestId: entry.requestId,
      userId: entry.userId ?? undefined,
      appId: entry.appId,
      functionId: entry.functionId,
      'execution.duration_ms': durationMs,
      success: entry.success,
      error: entry.error ?? undefined,
      meta: entry.meta ?? undefined,
    },
    {
      severity: entry.success ? 'info' : 'error',
      scope: 'automation.execution.audit',
      timestamp: createdAt,
    },
  );

  if (!db) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn('⚠️ Database client not configured; execution audit entry will not be persisted.');
    }
    return;
  }

  try {
    await db.insert(executionAuditLogs).values({
      requestId: entry.requestId,
      userId: entry.userId ?? null,
      appId: entry.appId,
      functionId: entry.functionId,
      durationMs,
      success: entry.success,
      error: entry.error ?? null,
      meta: entry.meta ?? null,
      createdAt,
    });
  } catch (error) {
    console.error('❌ Failed to persist execution audit entry', error);
  }

  await enforceRetention();
}

export async function readExecutions(options: ReadExecutionsOptions = {}): Promise<AuditEntry[]> {
  if (!db) {
    return [];
  }

  const limit = Math.max(1, Math.min(options.limit ?? 100, 1000));
  const conditions: any[] = [];

  if (options.requestId) {
    conditions.push(eq(executionAuditLogs.requestId, options.requestId));
  }
  if (options.appId) {
    conditions.push(eq(executionAuditLogs.appId, options.appId));
  }
  if (options.userId) {
    conditions.push(eq(executionAuditLogs.userId, options.userId));
  }
  if (typeof options.success === 'boolean') {
    conditions.push(eq(executionAuditLogs.success, options.success));
  }

  let query = db.select().from(executionAuditLogs);
  if (conditions.length === 1) {
    query = query.where(conditions[0]);
  } else if (conditions.length > 1) {
    query = query.where(and(...conditions));
  }

  const rows = await query.orderBy(desc(executionAuditLogs.createdAt)).limit(limit);

  return rows.map((row) => ({
    id: row.id,
    ts: row.createdAt ? row.createdAt.toISOString() : new Date().toISOString(),
    requestId: row.requestId,
    userId: row.userId,
    appId: row.appId,
    functionId: row.functionId,
    durationMs: row.durationMs,
    success: row.success,
    error: row.error,
    meta: (row.meta as Record<string, any> | null) ?? null,
  }));
}

