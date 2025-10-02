import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import path from 'path';

export type SecretAuditEvent = {
  ts: string;
  type: 'read' | 'write' | 'delete';
  provider: string;
  source: 'connection' | 'provider-config';
  userId?: string;
  metadata?: Record<string, any>;
};

const AUDIT_PATH = path.resolve(process.cwd(), 'production', 'reports', 'secret-access-log.jsonl');

export function recordSecretEvent(event: Omit<SecretAuditEvent, 'ts'>): void {
  try {
    const dir = path.dirname(AUDIT_PATH);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const payload: SecretAuditEvent = { ...event, ts: new Date().toISOString() };
    appendFileSync(AUDIT_PATH, JSON.stringify(payload) + '\n', { encoding: 'utf8' });
  } catch (error) {
    console.warn('⚠️ Failed to record secret audit event:', (error as any)?.message || error);
  }
}

export function readSecretEvents(limit = 50): SecretAuditEvent[] {
  try {
    if (!existsSync(AUDIT_PATH)) {
      return [];
    }
    const lines = readFileSync(AUDIT_PATH, 'utf8').trim().split('\n');
    return lines
      .slice(-limit)
      .map((line) => JSON.parse(line) as SecretAuditEvent)
      .filter((item) => item && item.provider);
  } catch (error) {
    console.warn('⚠️ Failed to read secret audit log:', (error as any)?.message || error);
    return [];
  }
}
