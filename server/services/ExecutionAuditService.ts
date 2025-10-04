import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import { and, desc, eq } from 'drizzle-orm';

import { db, executionAuditLogs } from '../database/schema.js';

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

const auditLogger = logs.getLogger('automation.execution.audit', '1.0.0');

function sanitizeAttributes(entry: RecordExecutionInput): Record<string, string | number | boolean> {
  const attributes: Record<string, string | number | boolean> = {
    'request.id': entry.requestId,
    'app.id': entry.appId,
    'function.id': entry.functionId,
    'execution.duration_ms': Math.max(0, Math.floor(entry.durationMs)),
    'execution.success': entry.success,
  };

  if (entry.userId) {
    attributes['user.id'] = entry.userId;
  }

  return attributes;
}

export async function recordExecution(entry: RecordExecutionInput): Promise<void> {
  const createdAt = new Date();
  const durationMs = Math.max(0, Math.floor(entry.durationMs));

  try {
    auditLogger.emit({
      severityNumber: entry.success ? SeverityNumber.INFO : SeverityNumber.ERROR,
      severityText: entry.success ? 'INFO' : 'ERROR',
      body: entry.success ? 'Connector execution completed successfully' : entry.error ?? 'Connector execution failed',
      attributes: sanitizeAttributes(entry),
      timestamp: createdAt.getTime(),
    });
  } catch (error) {
    console.warn('⚠️ Failed to emit OpenTelemetry audit log', (error as Error)?.message ?? error);
  }

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

