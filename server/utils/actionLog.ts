import { appendFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';

const LOG_PATH = resolve(process.cwd(), 'production', 'reports', 'action-log.jsonl');

export function logAction(event: Record<string, any>): void {
  try {
    const dir = dirname(LOG_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const entry = { ts: new Date().toISOString(), ...event };
    appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n', { encoding: 'utf8' });
  } catch (e) {
    // best-effort; don't throw
  }
}

