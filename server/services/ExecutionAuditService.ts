import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';

import { normalizeRegion as normalizeRegionValue, defaultRegion, isWildcardRegion } from '../utils/region.js';

const AUDIT_BASE_PATH = resolve(process.cwd(), 'production', 'reports');
const AUDIT_FILE_NAME = 'execution-log.jsonl';
const LEGACY_AUDIT_PATH = resolve(AUDIT_BASE_PATH, AUDIT_FILE_NAME);

type AuditEntry = {
  ts: string;
  requestId: string;
  appId: string;
  functionId: string;
  durationMs: number;
  success: boolean;
  error?: string;
  meta?: Record<string, any>;
  organizationId?: string | null;
  region: string;
};

type RecordExecutionInput = Omit<AuditEntry, 'ts' | 'region'> & { region?: string | null };

function readLogFileEntries(filePath: string, fallbackRegion: string): AuditEntry[] {
  if (!existsSync(filePath)) {
    return [];
  }

  try {
    const raw = readFileSync(filePath, 'utf8').trim();
    if (raw.length === 0) {
      return [];
    }

    return raw.split('\n').map((line) => {
      const parsed = JSON.parse(line) as Partial<AuditEntry>;
      const region = typeof parsed.region === 'string' && parsed.region.length > 0 ? parsed.region : fallbackRegion;
      return {
        ts: parsed.ts ?? new Date().toISOString(),
        requestId: parsed.requestId ?? 'unknown',
        appId: parsed.appId ?? 'unknown',
        functionId: parsed.functionId ?? 'unknown',
        durationMs: parsed.durationMs ?? 0,
        success: parsed.success ?? false,
        error: parsed.error,
        meta: parsed.meta,
        organizationId: parsed.organizationId ?? null,
        region,
      };
    });
  } catch (err) {
    console.warn('⚠️ Failed to read execution audit log:', (err as any)?.message || err);
    return [];
  }
}

export function getAuditLogPath(region?: string | null): string {
  const normalized = normalizeRegionValue(region, defaultRegion);
  return resolve(AUDIT_BASE_PATH, normalized, AUDIT_FILE_NAME);
}

export function recordExecution(entry: RecordExecutionInput): void {
  const { region, ...rest } = entry;
  const normalizedRegion = normalizeRegionValue(region, defaultRegion);
  const targetPath = getAuditLogPath(normalizedRegion);

  try {
    const dir = dirname(targetPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const line: AuditEntry = {
      ts: new Date().toISOString(),
      region: normalizedRegion,
      ...rest,
    };
    appendFileSync(targetPath, JSON.stringify(line) + '\n', { encoding: 'utf8' });
  } catch (err) {
    console.warn('⚠️ Failed to write execution audit log:', (err as any)?.message || err);
  }
}

export function readExecutions(limit = 100, region?: string | null): AuditEntry[] {
  try {
    const normalizedRegion = region ? normalizeRegionValue(region, defaultRegion) : defaultRegion;
    const wildcard = region ? isWildcardRegion(region) && normalizedRegion !== 'global' : false;

    if (wildcard) {
      if (!existsSync(AUDIT_BASE_PATH)) {
        return readLogFileEntries(LEGACY_AUDIT_PATH, defaultRegion).slice(-limit);
      }

      const dirEntries = readdirSync(AUDIT_BASE_PATH, { withFileTypes: true });
      const aggregated: AuditEntry[] = [];

      for (const dirEntry of dirEntries) {
        if (!dirEntry.isDirectory()) {
          continue;
        }
        const filePath = resolve(AUDIT_BASE_PATH, dirEntry.name, AUDIT_FILE_NAME);
        aggregated.push(...readLogFileEntries(filePath, dirEntry.name));
      }

      aggregated.push(...readLogFileEntries(LEGACY_AUDIT_PATH, defaultRegion));

      return aggregated
        .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime())
        .slice(-limit);
    }

    const filePath = getAuditLogPath(normalizedRegion);
    let entries = readLogFileEntries(filePath, normalizedRegion);
    if (entries.length === 0 && normalizedRegion === defaultRegion) {
      entries = readLogFileEntries(LEGACY_AUDIT_PATH, normalizedRegion);
    }
    return entries.slice(-limit);
  } catch (err) {
    console.warn('⚠️ Failed to read execution audit log:', (err as any)?.message || err);
    return [];
  }
}
