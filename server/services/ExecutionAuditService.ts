import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';

const AUDIT_PATH = resolve(process.cwd(), 'production', 'reports', 'execution-log.jsonl');

type AuditEntry = {
  ts: string;
  requestId: string;
  appId: string;
  functionId: string;
  durationMs: number;
  success: boolean;
  error?: string;
  meta?: Record<string, any>;
};

export function recordExecution(entry: Omit<AuditEntry, 'ts'>): void {
  try {
    const dir = dirname(AUDIT_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const line: AuditEntry = { ts: new Date().toISOString(), ...entry };
    appendFileSync(AUDIT_PATH, JSON.stringify(line) + '\n', { encoding: 'utf8' });
  } catch (err) {
    console.warn('⚠️ Failed to write execution audit log:', (err as any)?.message || err);
  }
}

export function readExecutions(limit = 100): AuditEntry[] {
  try {
    if (!existsSync(AUDIT_PATH)) return [];
    const lines = readFileSync(AUDIT_PATH, 'utf8').trim().split('\n');
    return lines.slice(-limit).map(line => JSON.parse(line));
  } catch (err) {
    console.warn('⚠️ Failed to read execution audit log:', (err as any)?.message || err);
    return [];
  }
}

