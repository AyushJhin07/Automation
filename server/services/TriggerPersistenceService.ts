import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import {
  db,
  getDatabaseClient,
  getConfiguredDatabaseRegions,
  webhookLogs,
  webhookDedupe,
  pollingTriggers,
  workflowTriggers,
  type OrganizationRegion,
} from '../database/schema';
import { ensureDatabaseReady, isDatabaseAvailable } from '../database/status.js';
import type { PollingTrigger, TriggerEvent, WebhookTrigger } from '../webhooks/types';
import { getErrorMessage } from '../types/common';

void ensureDatabaseReady();

const DEFAULT_DEDUPE_TOKEN_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours
const DEFAULT_MAX_DEDUPE_TOKENS = 500;

type DedupeTokenInput = string | { token: string; createdAt?: Date; ttlMs?: number };
interface DedupeTokenRecord {
  token: string;
  createdAt: Date;
  expiresAt?: Date;
}
const DEFAULT_MAX_BACKOFF_MULTIPLIER = 32;

export const VERIFICATION_FAILURE_PREFIX = 'verification_failed:';

export interface VerificationFailureLogPayload {
  status?: string;
  reason?: string;
  message?: string;
  provider?: string | null;
  signatureHeader?: string | null;
  providedSignature?: string | null;
  timestampSkewSeconds?: number | null;
}

export function encodeVerificationFailure(payload: VerificationFailureLogPayload): string {
  return `${VERIFICATION_FAILURE_PREFIX}${JSON.stringify(payload)}`;
}

interface ParsedVerificationFailure {
  status: string;
  reason: string;
  message: string;
  provider?: string | null;
  signatureHeader?: string | null;
  providedSignature?: string | null;
  timestampSkewSeconds?: number | null;
}

function parseVerificationFailurePayload(error: string | null | undefined): ParsedVerificationFailure {
  if (!error) {
    return {
      status: 'failed',
      reason: 'UNKNOWN',
      message: 'Webhook signature verification failed',
    };
  }

  if (!error.startsWith(VERIFICATION_FAILURE_PREFIX)) {
    return {
      status: 'failed',
      reason: 'UNKNOWN',
      message: error,
    };
  }

  const raw = error.slice(VERIFICATION_FAILURE_PREFIX.length);

  try {
    const payload = JSON.parse(raw) as VerificationFailureLogPayload;
    return {
      status: payload.status ?? 'failed',
      reason: payload.reason ?? 'UNKNOWN',
      message:
        payload.message ??
        (payload.reason ? `Webhook signature verification failed (${payload.reason})` : 'Webhook signature verification failed'),
      provider: payload.provider ?? null,
      signatureHeader: payload.signatureHeader ?? null,
      providedSignature: payload.providedSignature ?? null,
      timestampSkewSeconds: payload.timestampSkewSeconds ?? null,
    };
  } catch {
    return {
      status: 'failed',
      reason: 'UNKNOWN',
      message: raw,
    };
  }
}

interface BackoffOptions {
  maxIntervalSeconds?: number;
}

interface DedupeTtlOptions {
  now?: Date;
  ttlMs?: number;
}

function computeExponentialBackoffInterval(
  baseIntervalSeconds: number,
  backoffCount: number,
  options: BackoffOptions = {}
): number {
  const sanitizedBase = Math.max(1, Math.floor(baseIntervalSeconds));
  const attempt = Math.max(0, Math.floor(backoffCount));
  const maxInterval = Math.max(
    sanitizedBase,
    options.maxIntervalSeconds ?? sanitizedBase * DEFAULT_MAX_BACKOFF_MULTIPLIER
  );
  const exponent = Math.min(30, attempt); // prevent overflow
  const interval = sanitizedBase * Math.pow(2, exponent);
  return Math.min(interval, maxInterval);
}

function applyDedupeTokenTTL(
  tokens: string[],
  updatedAt: string | Date | null | undefined,
  options: DedupeTtlOptions = {}
): string[] {
  if (!Array.isArray(tokens) || tokens.length === 0) {
    return [];
  }

  const ttlMs = options.ttlMs ?? DEFAULT_DEDUPE_TOKEN_TTL_MS;
  if (ttlMs <= 0) {
    return [...tokens];
  }

  if (!updatedAt) {
    return [...tokens];
  }

  const now = options.now ?? new Date();
  const updatedTime =
    typeof updatedAt === 'string'
      ? new Date(updatedAt).getTime()
      : updatedAt instanceof Date
      ? updatedAt.getTime()
      : Number.NaN;

  if (Number.isNaN(updatedTime)) {
    return [...tokens];
  }

  if (now.getTime() - updatedTime > ttlMs) {
    return [];
  }

  return [...tokens];
}

class InMemoryTriggerPersistenceStore {
  private workflowTriggers = new Map<string, any>();
  private pollingTriggers = new Map<string, any>();
  private webhookLogs = new Map<string, any>();
  private dedupeTokens = new Map<string, DedupeTokenRecord[]>();

  private composeKey(webhookId: string, providerId?: string): string {
    return providerId ? `${webhookId}::${providerId}` : webhookId;
  }

  public async getActiveWebhookTriggers() {
    return Array.from(this.workflowTriggers.values()).filter((row) => row.type === 'webhook' && row.isActive !== false);
  }

  public async getActivePollingTriggers() {
    return Array.from(this.pollingTriggers.values()).filter((row) => row.isActive !== false);
  }

  public async upsertWorkflowTrigger(record: any) {
    const existing = this.workflowTriggers.get(record.id) ?? {};
    const next = {
      ...existing,
      ...record,
      metadata: record.metadata ?? existing.metadata ?? {},
      dedupeState: record.dedupeState ?? existing.dedupeState ?? null,
      isActive: record.isActive ?? existing.isActive ?? true,
      updatedAt: new Date(),
      createdAt: existing.createdAt ?? new Date(),
    };
    this.workflowTriggers.set(record.id, next);
  }

  public async upsertPollingTrigger(record: any) {
    const existing = this.pollingTriggers.get(record.id) ?? {};
    const next = {
      ...existing,
      ...record,
      metadata: record.metadata ?? existing.metadata ?? {},
      isActive: record.isActive ?? existing.isActive ?? true,
      cursor: record.cursor ?? existing.cursor ?? null,
      backoffCount: record.backoffCount ?? existing.backoffCount ?? 0,
      lastStatus: record.lastStatus ?? existing.lastStatus ?? null,
      nextPollAt:
        record.nextPollAt ??
        existing.nextPollAt ??
        (record.nextPoll ? new Date(record.nextPoll) : new Date(Date.now() + (record.interval ?? existing.interval ?? 60) * 1000)),
      updatedAt: new Date(),
      createdAt: existing.createdAt ?? new Date(),
    };
    this.pollingTriggers.set(record.id, next);
  }

  public async updatePollingRuntimeState({
    id,
    lastPoll,
    nextPoll,
    nextPollAt,
    cursor,
    backoffCount,
    lastStatus,
  }: {
    id: string;
    lastPoll?: Date;
    nextPoll?: Date;
    nextPollAt?: Date;
    cursor?: Record<string, any> | null;
    backoffCount?: number;
    lastStatus?: string | null;
  }) {
    const polling = this.pollingTriggers.get(id);
    if (polling) {
      polling.lastPoll = lastPoll ?? null;
      const resolvedNextPoll = nextPollAt ?? nextPoll ?? polling.nextPollAt ?? polling.nextPoll ?? null;
      polling.nextPoll = resolvedNextPoll;
      polling.nextPollAt = resolvedNextPoll;
      polling.cursor = cursor ?? polling.cursor ?? null;
      if (typeof backoffCount === 'number') {
        polling.backoffCount = backoffCount;
      }
      polling.lastStatus = lastStatus ?? polling.lastStatus ?? null;
      polling.updatedAt = new Date();
      this.pollingTriggers.set(id, polling);
    }

    const workflow = this.workflowTriggers.get(id);
    if (workflow) {
      workflow.updatedAt = new Date();
      this.workflowTriggers.set(id, workflow);
    }
  }

  public async claimDuePollingTriggers({
    now,
    limit,
    region,
  }: {
    now: Date;
    limit: number;
    region?: OrganizationRegion;
  }) {
    const due = Array.from(this.pollingTriggers.values())
      .filter((row) => {
        if (row.isActive === false || !row.nextPollAt || row.nextPollAt > now) {
          return false;
        }
        if (!region) {
          return true;
        }
        const triggerRegion = row.region ?? row.metadata?.region ?? null;
        return triggerRegion === region;
      })
      .sort((a, b) => (a.nextPollAt?.getTime() ?? 0) - (b.nextPollAt?.getTime() ?? 0))
      .slice(0, limit);

    for (const trigger of due) {
      const effectiveInterval = computeExponentialBackoffInterval(trigger.interval ?? 60, trigger.backoffCount ?? 0);
      const nextRun = new Date(now.getTime() + effectiveInterval * 1000);
      trigger.nextPollAt = nextRun;
      trigger.nextPoll = nextRun;
      trigger.updatedAt = new Date();
      this.pollingTriggers.set(trigger.id, trigger);
    }

    return due.map((trigger) => ({ ...trigger }));
  }

  public async deactivateTrigger(id: string) {
    const workflow = this.workflowTriggers.get(id);
    if (workflow) {
      workflow.isActive = false;
      workflow.updatedAt = new Date();
      this.workflowTriggers.set(id, workflow);
    }

    const polling = this.pollingTriggers.get(id);
    if (polling) {
      polling.isActive = false;
      polling.updatedAt = new Date();
      this.pollingTriggers.set(id, polling);
    }
  }

  public async logWebhookEvent(event: any) {
    const now = new Date();
    this.webhookLogs.set(event.id, {
      ...event,
      processed: event.processed ?? false,
      executionId: event.executionId ?? null,
      createdAt: now,
      updatedAt: now,
      region: event.region ?? event.metadata?.region ?? null,
    });
  }

  public async markWebhookEventProcessed(id: string, result: { success: boolean; error?: string; executionId?: string }) {
    const existing = this.webhookLogs.get(id);
    if (!existing) {
      return;
    }

    existing.processed = result.success;
    existing.error = result.success ? null : result.error ?? null;
    existing.executionId = result.executionId ?? existing.executionId ?? null;
    existing.updatedAt = new Date();
    this.webhookLogs.set(id, existing);
  }

  public async getDedupeTokens(): Promise<Record<string, string[]>> {
    const result: Record<string, string[]> = {};
    const now = new Date();
    const cutoff = DEFAULT_DEDUPE_TOKEN_TTL_MS > 0 ? now.getTime() - DEFAULT_DEDUPE_TOKEN_TTL_MS : null;

    for (const [id, entries] of this.dedupeTokens.entries()) {
      const normalized = entries
        .filter((entry) => (cutoff === null ? true : entry.createdAt.getTime() >= cutoff))
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

      if (normalized.length === 0) {
        this.dedupeTokens.delete(id);
        continue;
      }

      if (normalized.length > DEFAULT_MAX_DEDUPE_TOKENS) {
        normalized.splice(0, normalized.length - DEFAULT_MAX_DEDUPE_TOKENS);
      }

      this.dedupeTokens.set(id, normalized);
      const [webhookId] = id.split('::');
      const existing = result[webhookId] ?? [];
      const merged = [...existing, ...normalized.map((entry) => entry.token)];
      result[webhookId] = Array.from(new Set(merged));
    }
    return result;
  }

  public async persistDedupeTokens(
    id: string,
    tokens: DedupeTokenInput[],
    _options: { region?: OrganizationRegion } = {}
  ) {
    if (!Array.isArray(tokens) || tokens.length === 0) {
      return;
    }

    const now = new Date();
    const cutoff = DEFAULT_DEDUPE_TOKEN_TTL_MS > 0 ? now.getTime() - DEFAULT_DEDUPE_TOKEN_TTL_MS : null;
    const existing = this.dedupeTokens.get(id) ?? [];
    const next = existing.filter((entry) => {
      if (entry.expiresAt) {
        return entry.expiresAt.getTime() >= now.getTime();
      }
      if (cutoff === null) {
        return true;
      }
      return entry.createdAt.getTime() >= cutoff;
    });

    for (const token of tokens) {
      const normalizedToken = typeof token === 'string' ? token : token.token;
      if (!normalizedToken) {
        continue;
      }
      const createdAt =
        typeof token === 'string'
          ? now
          : token.createdAt instanceof Date
          ? token.createdAt
          : token.createdAt
          ? new Date(token.createdAt)
          : now;

      const normalizedCreatedAt = Number.isNaN(createdAt.getTime()) ? now : createdAt;

      if (cutoff !== null && normalizedCreatedAt.getTime() < cutoff) {
        continue;
      }

      const index = next.findIndex((entry) => entry.token === normalizedToken);
      const ttlMs = typeof token === 'string' ? undefined : token.ttlMs;
      const expiresAt = ttlMs && ttlMs > 0 ? new Date(normalizedCreatedAt.getTime() + ttlMs) : undefined;

      if (index >= 0) {
        next[index] = { token: normalizedToken, createdAt: normalizedCreatedAt, expiresAt };
      } else {
        next.push({ token: normalizedToken, createdAt: normalizedCreatedAt, expiresAt });
      }
    }

    next.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    if (next.length > DEFAULT_MAX_DEDUPE_TOKENS) {
      next.splice(0, next.length - DEFAULT_MAX_DEDUPE_TOKENS);
    }

    this.dedupeTokens.set(id, next);

    const workflow = this.workflowTriggers.get(id);
    if (workflow) {
      workflow.dedupeState = {
        tokens: next.map((entry) => entry.token),
        updatedAt: now.toISOString(),
      };
      workflow.updatedAt = now;
      this.workflowTriggers.set(id, workflow);
    }
  }

  public async getWebhookLog(id: string) {
    return this.webhookLogs.get(id);
  }

  public async recordWebhookDedupeEntry(params: {
    webhookId: string;
    providerId?: string;
    token: string;
    ttlMs: number;
    createdAt?: Date;
  }): Promise<'recorded' | 'duplicate'> {
    const key = this.composeKey(params.webhookId, params.providerId);
    const createdAt = params.createdAt instanceof Date && !Number.isNaN(params.createdAt.getTime())
      ? params.createdAt
      : new Date();
    const ttlMs = params.ttlMs > 0 ? params.ttlMs : DEFAULT_DEDUPE_TOKEN_TTL_MS;
    const cutoff = ttlMs > 0 ? createdAt.getTime() - ttlMs : null;

    const entries = this.dedupeTokens.get(key) ?? [];
    const filtered = entries.filter((entry) => {
      if (entry.expiresAt) {
        return entry.expiresAt.getTime() >= createdAt.getTime();
      }
      if (cutoff === null) {
        return true;
      }
      return entry.createdAt.getTime() >= cutoff;
    });

    const hasDuplicate = filtered.some((entry) => entry.token === params.token);
    if (hasDuplicate) {
      this.dedupeTokens.set(key, filtered);
      return 'duplicate';
    }

    filtered.push({
      token: params.token,
      createdAt,
      expiresAt: ttlMs > 0 ? new Date(createdAt.getTime() + ttlMs) : undefined,
    });

    filtered.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    if (filtered.length > DEFAULT_MAX_DEDUPE_TOKENS) {
      filtered.splice(0, filtered.length - DEFAULT_MAX_DEDUPE_TOKENS);
    }

    this.dedupeTokens.set(key, filtered);
    return 'recorded';
  }

  public async listDuplicateWebhookEvents(
    workflowId: string,
    options: { limit?: number; since?: Date } = {}
  ): Promise<Array<{ id: string; webhookId: string; timestamp: Date; error: string }>> {
    const limit = Math.max(1, Math.min(100, options.limit ?? 20));
    const since = options.since;

    const entries = Array.from(this.webhookLogs.values())
      .filter((log) => log.workflowId === workflowId)
      .filter((log) => log.processed !== true)
      .filter((log) => typeof log.error === 'string' && log.error.toLowerCase().startsWith('duplicate'))
      .filter((log) => (since ? (log.timestamp instanceof Date ? log.timestamp >= since : new Date(log.timestamp) >= since) : true))
      .sort((a, b) => {
        const aTime = a.timestamp instanceof Date ? a.timestamp.getTime() : new Date(a.timestamp).getTime();
        const bTime = b.timestamp instanceof Date ? b.timestamp.getTime() : new Date(b.timestamp).getTime();
        return bTime - aTime;
      })
      .slice(0, limit)
      .map((log) => ({
        id: log.id,
        webhookId: log.webhookId,
        timestamp: log.timestamp instanceof Date ? log.timestamp : new Date(log.timestamp),
        error: log.error ?? 'duplicate event',
      }));

    return entries;
  }

  public async listVerificationFailures(
    options: { webhookId?: string; workflowId?: string; limit?: number; since?: Date } = {}
  ): Promise<VerificationFailureEntry[]> {
    const limit = Math.max(1, Math.min(100, options.limit ?? 20));
    const since = options.since;

    const entries = Array.from(this.webhookLogs.values())
      .filter((log) => (options.webhookId ? log.webhookId === options.webhookId : true))
      .filter((log) => (options.workflowId ? log.workflowId === options.workflowId : true))
      .filter((log) => log.processed !== true)
      .filter((log) => typeof log.error === 'string' && log.error.startsWith(VERIFICATION_FAILURE_PREFIX))
      .filter((log) => {
        if (!since) {
          return true;
        }
        const updated = log.updatedAt instanceof Date ? log.updatedAt : new Date(log.updatedAt ?? log.timestamp);
        return updated >= since;
      })
      .sort((a, b) => {
        const aTime = a.updatedAt instanceof Date ? a.updatedAt.getTime() : new Date(a.updatedAt ?? a.timestamp).getTime();
        const bTime = b.updatedAt instanceof Date ? b.updatedAt.getTime() : new Date(b.updatedAt ?? b.timestamp).getTime();
        return bTime - aTime;
      })
      .slice(0, limit)
      .map((log) => {
        const parsed = parseVerificationFailurePayload(log.error ?? null);
        const timestamp = log.updatedAt instanceof Date ? log.updatedAt : new Date(log.updatedAt ?? log.timestamp);

        return {
          id: log.id,
          webhookId: log.webhookId,
          workflowId: log.workflowId,
          status: parsed.status,
          reason: parsed.reason,
          message: parsed.message,
          provider: parsed.provider ?? null,
          timestamp,
          metadata: {
            signatureHeader: parsed.signatureHeader ?? null,
            providedSignature: parsed.providedSignature ?? null,
            timestampSkewSeconds: parsed.timestampSkewSeconds ?? null,
          },
        } satisfies VerificationFailureEntry;
      });

    return entries;
  }
}

export interface VerificationFailureEntry {
  id: string;
  webhookId: string;
  workflowId: string;
  status: string;
  reason: string;
  message: string;
  provider?: string | null;
  timestamp: Date;
  metadata?: {
    signatureHeader?: string | null;
    providedSignature?: string | null;
    timestampSkewSeconds?: number | null;
  };
}

export interface TriggerExecutionResult {
  success: boolean;
  error?: string;
  executionId?: string;
  duplicate?: boolean;
  dropReason?: string;
  region?: OrganizationRegion;
}

export class TriggerPersistenceService {
  private static instance: TriggerPersistenceService;
  private readonly memoryStore = new InMemoryTriggerPersistenceStore();
  private hasLoggedFallback = false;

  private composeDedupeKey(webhookId: string, providerId?: string): string {
    return providerId ? `${webhookId}::${providerId}` : webhookId;
  }

  private constructor() {}

  public static readonly DEFAULT_DEDUPE_TOKEN_TTL_MS = DEFAULT_DEDUPE_TOKEN_TTL_MS;
  public static readonly DEFAULT_MAX_DEDUPE_TOKENS = DEFAULT_MAX_DEDUPE_TOKENS;

  public static getInstance(): TriggerPersistenceService {
    if (!TriggerPersistenceService.instance) {
      TriggerPersistenceService.instance = new TriggerPersistenceService();
    }
    return TriggerPersistenceService.instance;
  }

  public computePollingIntervalWithBackoff(
    baseIntervalSeconds: number,
    backoffCount: number,
    options: BackoffOptions = {}
  ): number {
    return computeExponentialBackoffInterval(baseIntervalSeconds, backoffCount, options);
  }

  public applyDedupeTokenTTL(
    tokens: string[],
    updatedAt?: string | Date | null,
    options: DedupeTtlOptions = {}
  ): string[] {
    return applyDedupeTokenTTL(tokens, updatedAt ?? null, options);
  }

  public isDatabaseEnabled(): boolean {
    return isDatabaseAvailable();
  }

  public async loadWebhookTriggers(): Promise<WebhookTrigger[]> {
    const regions = getConfiguredDatabaseRegions();
    const targets = regions.length > 0 ? regions : [null];
    const all: WebhookTrigger[] = [];

    for (const region of targets) {
      try {
        const database = this.requireDatabase('loadWebhookTriggers', region);

        if (typeof (database as any).getActiveWebhookTriggers === 'function') {
          const rows = await (database as any).getActiveWebhookTriggers();
          all.push(...rows.map((row: any) => this.mapWebhookTriggerRow(row)));
          continue;
        }

        const rows = await database
          .select()
          .from(workflowTriggers)
          .where(and(eq(workflowTriggers.type, 'webhook'), eq(workflowTriggers.isActive, true)));

        all.push(...rows.map((row) => this.mapWebhookTriggerRow(row)));
      } catch (error) {
        this.logPersistenceError('loadWebhookTriggers', error, { region });
      }
    }

    return all;
  }

  public async loadPollingTriggers(): Promise<PollingTrigger[]> {
    const regions = getConfiguredDatabaseRegions();
    const targets = regions.length > 0 ? regions : [null];
    const all: PollingTrigger[] = [];

    for (const region of targets) {
      try {
        const database = this.requireDatabase('loadPollingTriggers', region);

        if (typeof (database as any).getActivePollingTriggers === 'function') {
          const rows = await (database as any).getActivePollingTriggers();
          all.push(...rows.map((row: any) => this.mapPollingTriggerRow(row)));
          continue;
        }

        const rows = await database
          .select()
          .from(pollingTriggers)
          .where(eq(pollingTriggers.isActive, true));

        all.push(...rows.map((row) => this.mapPollingTriggerRow(row)));
      } catch (error) {
        this.logPersistenceError('loadPollingTriggers', error, { region });
      }
    }

    return all;
  }

  public async claimDuePollingTriggers(
    options: { limit?: number; now?: Date; region?: OrganizationRegion } = {}
  ): Promise<PollingTrigger[]> {
    const now = options.now ?? new Date();
    const limit = Math.max(1, Math.min(100, options.limit ?? 25));
    const region = options.region;
    const database = this.requireDatabase('claimDuePollingTriggers', region);

    if (typeof (database as any).claimDuePollingTriggers === 'function') {
      const rows = await (database as any).claimDuePollingTriggers({ now, limit, region });
      return rows.map((row: any) => this.mapPollingTriggerRow(row));
    }

    if (!database.transaction) {
      const rows = await (database as any)
        .select()
        .from(pollingTriggers)
        .where(eq(pollingTriggers.isActive, true));
      const mapped = rows
        .map((row: any) => this.mapPollingTriggerRow(row))
        .filter((row) => {
          if (row.nextPollAt > now) {
            return false;
          }
          if (!region) {
            return true;
          }
          return row.region === region;
        })
        .sort((a, b) => a.nextPollAt.getTime() - b.nextPollAt.getTime())
        .slice(0, limit);
      for (const trigger of mapped) {
        const effectiveInterval = this.computePollingIntervalWithBackoff(trigger.interval, trigger.backoffCount ?? 0);
        const nextRun = new Date(now.getTime() + effectiveInterval * 1000);
        await this.updatePollingRuntimeState(trigger.id, { nextPoll: nextRun, nextPollAt: nextRun });
        trigger.nextPollAt = nextRun;
        trigger.nextPoll = nextRun;
      }
      return mapped;
    }

    return await database.transaction(async (tx: any) => {
      const regionFilter = region
        ? sql` AND (region = ${region} OR region IS NULL)`
        : sql``;
      const result = await tx.execute(
        sql`SELECT * FROM polling_triggers WHERE is_active = true AND COALESCE(next_poll_at, next_poll) <= ${now}${regionFilter} ORDER BY COALESCE(next_poll_at, next_poll) ASC LIMIT ${limit} FOR UPDATE SKIP LOCKED`
      );
      const rows: any[] = (result?.rows ?? result ?? []) as any[];

      if (!rows || rows.length === 0) {
        return [];
      }

      const claimed: PollingTrigger[] = [];
      for (const row of rows) {
        if (region && row.region && row.region !== region) {
          continue;
        }
        const intervalSeconds = Math.max(1, Number(row.interval ?? 60));
        const effectiveInterval = computeExponentialBackoffInterval(
          intervalSeconds,
          Number(row.backoff_count ?? row.backoffCount ?? 0)
        );
        const nextRun = new Date(now.getTime() + effectiveInterval * 1000);
        await tx
          .update(pollingTriggers)
          .set({
            nextPoll: nextRun,
            nextPollAt: nextRun,
            updatedAt: now,
          })
          .where(eq(pollingTriggers.id, row.id));

        claimed.push(
          this.mapPollingTriggerRow({
            ...row,
            nextPoll: nextRun,
            nextPollAt: nextRun,
          })
        );
      }

      return claimed;
    });
  }

  public async saveWebhookTrigger(trigger: WebhookTrigger): Promise<void> {
    const organizationId =
      trigger.organizationId ?? (trigger.metadata?.organizationId as string | undefined) ?? null;
    const region = (trigger.region ?? (trigger.metadata?.region as OrganizationRegion | undefined)) ?? null;
    const database = this.requireDatabase('saveWebhookTrigger', region);
    const record = {
      id: trigger.id,
      workflowId: trigger.workflowId,
      type: 'webhook' as const,
      appId: trigger.appId,
      triggerId: trigger.triggerId,
      endpoint: trigger.endpoint,
      secret: trigger.secret,
      metadata: trigger.metadata ?? {},
      isActive: trigger.isActive,
      organizationId,
      region,
    };

    if (typeof (database as any).upsertWorkflowTrigger === 'function') {
      await (database as any).upsertWorkflowTrigger(record);
      return;
    }

    const now = new Date();
    try {
      await database
        .insert(workflowTriggers)
        .values({
          ...record,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: workflowTriggers.id,
          set: {
            workflowId: trigger.workflowId,
            type: 'webhook',
            appId: trigger.appId,
            triggerId: trigger.triggerId,
            endpoint: trigger.endpoint,
            secret: trigger.secret,
            metadata: trigger.metadata ?? {},
            isActive: trigger.isActive,
            organizationId,
            region,
            updatedAt: now,
          },
        });
    } catch (error) {
      this.logPersistenceError('saveWebhookTrigger', error, { triggerId: trigger.id, workflowId: trigger.workflowId });
      throw error;
    }
  }

  public async savePollingTrigger(trigger: PollingTrigger): Promise<void> {
    const organizationId =
      trigger.organizationId ?? (trigger.metadata?.organizationId as string | undefined) ?? null;
    const region = (trigger.region ?? (trigger.metadata?.region as OrganizationRegion | undefined)) ?? null;
    const database = this.requireDatabase('savePollingTrigger', region);
    const record = {
      id: trigger.id,
      workflowId: trigger.workflowId,
      appId: trigger.appId,
      triggerId: trigger.triggerId,
      interval: trigger.interval,
      lastPoll: trigger.lastPoll ?? null,
      nextPoll: trigger.nextPoll,
      nextPollAt: trigger.nextPollAt ?? trigger.nextPoll,
      isActive: trigger.isActive,
      dedupeKey: trigger.dedupeKey ?? null,
      metadata: trigger.metadata ?? {},
      cursor: trigger.cursor ?? null,
      backoffCount: trigger.backoffCount ?? 0,
      lastStatus: trigger.lastStatus ?? null,
      organizationId,
      region,
    };

    if (typeof (database as any).upsertPollingTrigger === 'function') {
      await (database as any).upsertPollingTrigger(record);
      await (database as any).upsertWorkflowTrigger({
        id: trigger.id,
        workflowId: trigger.workflowId,
        type: 'polling',
        appId: trigger.appId,
        triggerId: trigger.triggerId,
        metadata: trigger.metadata ?? {},
        isActive: trigger.isActive,
        organizationId,
        region,
      });
      return;
    }

    const now = new Date();

    try {
      await database
        .insert(pollingTriggers)
        .values({
          ...record,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: pollingTriggers.id,
          set: {
            workflowId: trigger.workflowId,
            appId: trigger.appId,
            triggerId: trigger.triggerId,
            interval: trigger.interval,
            lastPoll: trigger.lastPoll ?? null,
            nextPoll: trigger.nextPoll,
            nextPollAt: trigger.nextPollAt ?? trigger.nextPoll,
            isActive: trigger.isActive,
            dedupeKey: trigger.dedupeKey ?? null,
            metadata: trigger.metadata ?? {},
            cursor: trigger.cursor ?? null,
            backoffCount: trigger.backoffCount ?? 0,
            lastStatus: trigger.lastStatus ?? null,
            organizationId,
            region,
            updatedAt: now,
          },
        });

      await database
        .insert(workflowTriggers)
        .values({
          id: trigger.id,
          workflowId: trigger.workflowId,
          type: 'polling',
          appId: trigger.appId,
          triggerId: trigger.triggerId,
          metadata: trigger.metadata ?? {},
          isActive: trigger.isActive,
          organizationId,
          region,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: workflowTriggers.id,
          set: {
            workflowId: trigger.workflowId,
            type: 'polling',
            appId: trigger.appId,
            triggerId: trigger.triggerId,
            metadata: trigger.metadata ?? {},
            isActive: trigger.isActive,
            organizationId,
            region,
            updatedAt: now,
          },
        });
    } catch (error) {
      this.logPersistenceError('savePollingTrigger', error, { triggerId: trigger.id, workflowId: trigger.workflowId });
      throw error;
    }
  }

  public async updatePollingRuntimeState(
    id: string,
    updates: {
      lastPoll?: Date;
      nextPoll?: Date;
      nextPollAt?: Date;
      cursor?: Record<string, any> | null;
      backoffCount?: number;
      lastStatus?: string | null;
      region?: OrganizationRegion;
    }
  ): Promise<void> {
    const { region, ...rest } = updates;
    const database = this.requireDatabase('updatePollingRuntimeState', region ?? null);

    if (typeof (database as any).updatePollingRuntimeState === 'function') {
      await (database as any).updatePollingRuntimeState({ id, ...updates });
      return;
    }

    const now = new Date();
    try {
      const nextPollValue = rest.nextPollAt ?? rest.nextPoll ?? null;
      const updateValues: Record<string, any> = {
        lastPoll: rest.lastPoll ?? null,
        nextPoll: nextPollValue,
        nextPollAt: nextPollValue,
        updatedAt: now,
      };

      if ('cursor' in rest) {
        updateValues.cursor = rest.cursor ?? null;
      }

      if (typeof rest.backoffCount === 'number') {
        updateValues.backoffCount = rest.backoffCount;
      }

      if ('lastStatus' in rest) {
        updateValues.lastStatus = rest.lastStatus ?? null;
      }

      await database
        .update(pollingTriggers)
        .set(updateValues)
        .where(eq(pollingTriggers.id, id));

      await database
        .update(workflowTriggers)
        .set({ updatedAt: now })
        .where(eq(workflowTriggers.id, id));
    } catch (error) {
      this.logPersistenceError('updatePollingRuntimeState', error, { triggerId: id });
      throw error;
    }
  }

  public async deactivateTrigger(id: string, region?: OrganizationRegion): Promise<void> {
    const database = this.requireDatabase('deactivateTrigger', region ?? null);

    if (typeof (database as any).deactivateTrigger === 'function') {
      await (database as any).deactivateTrigger(id);
      return;
    }

    const now = new Date();
    try {
      await database
        .update(workflowTriggers)
        .set({ isActive: false, updatedAt: now })
        .where(eq(workflowTriggers.id, id));

      await database
        .update(pollingTriggers)
        .set({ isActive: false, updatedAt: now })
        .where(eq(pollingTriggers.id, id));
    } catch (error) {
      this.logPersistenceError('deactivateTrigger', error, { triggerId: id });
      throw error;
    }
  }

  public async logWebhookEvent(event: TriggerEvent): Promise<string | null> {
    const id = event.id ?? randomUUID();

    const database = this.requireDatabase('logWebhookEvent', event.region ?? null);

    if (typeof (database as any).logWebhookEvent === 'function') {
      await (database as any).logWebhookEvent({ ...event, id });
      return id;
    }

    try {
      await database.insert(webhookLogs).values({
        id,
        webhookId: event.webhookId,
        workflowId: event.workflowId,
        appId: event.appId,
        triggerId: event.triggerId,
        payload: event.payload,
        headers: event.headers,
        timestamp: event.timestamp,
        signature: event.signature ?? null,
        processed: event.processed,
        source: event.source,
        dedupeToken: event.dedupeToken ?? null,
        executionId: null,
        region: event.region ?? null,
      });
      return id;
    } catch (error) {
      this.logPersistenceError('logWebhookEvent', error, {
        webhookId: event.webhookId,
        workflowId: event.workflowId,
        triggerId: event.triggerId,
      });
      return null;
    }
  }

  public async markWebhookEventProcessed(id: string | null, result: TriggerExecutionResult): Promise<void> {
    if (!id) {
      return;
    }

    const database = this.requireDatabase('markWebhookEventProcessed', result.region ?? null);

    if (typeof (database as any).markWebhookEventProcessed === 'function') {
      await (database as any).markWebhookEventProcessed(id, result);
      return;
    }

    try {
      await database
        .update(webhookLogs)
        .set({
          processed: result.success,
          error: result.success ? null : result.error ?? null,
          executionId: result.executionId ?? null,
          updatedAt: new Date(),
        })
        .where(eq(webhookLogs.id, id));
    } catch (error) {
      this.logPersistenceError('markWebhookEventProcessed', error, { webhookLogId: id });
    }
  }

  public async recordWebhookDedupeEntry(params: {
    webhookId: string;
    providerId?: string;
    token: string;
    ttlMs: number;
    createdAt?: Date;
    region?: OrganizationRegion;
  }): Promise<'recorded' | 'duplicate'> {
    const database = this.requireDatabase('recordWebhookDedupeEntry', params.region ?? null);

    if (typeof (database as any).recordWebhookDedupeEntry === 'function') {
      return (database as any).recordWebhookDedupeEntry(params);
    }

    const now = params.createdAt instanceof Date && !Number.isNaN(params.createdAt.getTime())
      ? params.createdAt
      : new Date();
    const ttlMs = params.ttlMs > 0 ? params.ttlMs : DEFAULT_DEDUPE_TOKEN_TTL_MS;
    const cutoff = ttlMs > 0 ? new Date(now.getTime() - ttlMs) : null;
    const key = this.composeDedupeKey(params.webhookId, params.providerId);

    try {
      if (cutoff) {
        await database
          .delete(webhookDedupe)
          .where(and(eq(webhookDedupe.triggerId, key), lt(webhookDedupe.createdAt, cutoff)));
      }

      const insertResult = await database
        .insert(webhookDedupe)
        .values({ triggerId: key, token: params.token, createdAt: now })
        .onConflictDoNothing()
        .returning({ createdAt: webhookDedupe.createdAt });

      if (insertResult.length > 0) {
        if (cutoff) {
          await database
            .delete(webhookDedupe)
            .where(and(eq(webhookDedupe.triggerId, key), lt(webhookDedupe.createdAt, cutoff)));
        }
        await database.execute(sql`
          DELETE FROM "webhook_dedupe"
          WHERE "trigger_id" = ${key}
            AND ("trigger_id", "token") NOT IN (
              SELECT "trigger_id", "token"
              FROM "webhook_dedupe"
              WHERE "trigger_id" = ${key}
              ORDER BY "created_at" DESC
              LIMIT ${DEFAULT_MAX_DEDUPE_TOKENS}
            )
        `);
        return 'recorded';
      }

      if (cutoff) {
        const existing = await database
          .select({ createdAt: webhookDedupe.createdAt })
          .from(webhookDedupe)
          .where(and(eq(webhookDedupe.triggerId, key), eq(webhookDedupe.token, params.token)))
          .limit(1);

        if (existing.length === 0) {
          const inserted = await database
            .insert(webhookDedupe)
            .values({ triggerId: key, token: params.token, createdAt: now })
            .onConflictDoNothing();
          if ('rowCount' in inserted && inserted.rowCount && inserted.rowCount > 0) {
            return 'recorded';
          }
        } else if (existing[0]?.createdAt && existing[0]!.createdAt < cutoff) {
          await database
            .update(webhookDedupe)
            .set({ createdAt: now })
            .where(and(eq(webhookDedupe.triggerId, key), eq(webhookDedupe.token, params.token)));
          return 'recorded';
        }
      }

      return 'duplicate';
    } catch (error) {
      this.logPersistenceError('recordWebhookDedupeEntry', error, {
        webhookId: params.webhookId,
        providerId: params.providerId,
      });
      return 'recorded';
    }
  }

  public async listDuplicateWebhookEvents(options: {
    workflowId: string;
    limit?: number;
    since?: Date;
    region?: OrganizationRegion;
  }): Promise<Array<{ id: string; webhookId: string; timestamp: Date; error: string }>> {
    const database = this.requireDatabase('listDuplicateWebhookEvents', options.region ?? null);

    if (typeof (database as any).listDuplicateWebhookEvents === 'function') {
      return (database as any).listDuplicateWebhookEvents(options);
    }

    const limit = Math.max(1, Math.min(100, options.limit ?? 20));
    const conditions: any[] = [
      eq(webhookLogs.workflowId, options.workflowId),
      eq(webhookLogs.processed, false),
      sql`LOWER(COALESCE(${webhookLogs.error}, '')) LIKE 'duplicate%'`,
    ];

    if (options.since) {
      conditions.push(gte(webhookLogs.timestamp, options.since));
    }

    const whereClause = conditions.length === 1 ? conditions[0]! : and(...conditions);

    const rows = await database
      .select({
        id: webhookLogs.id,
        webhookId: webhookLogs.webhookId,
        timestamp: webhookLogs.timestamp,
        error: webhookLogs.error,
      })
      .from(webhookLogs)
      .where(whereClause)
      .orderBy(desc(webhookLogs.timestamp))
      .limit(limit);

    return rows.map((row: any) => ({
      id: row.id,
      webhookId: row.webhookId,
      timestamp: row.timestamp instanceof Date ? row.timestamp : new Date(row.timestamp),
      error: row.error ?? 'duplicate event',
    }));
  }

  public async listVerificationFailures(options: {
    webhookId?: string;
    workflowId?: string;
    limit?: number;
    since?: Date;
    region?: OrganizationRegion;
  }): Promise<VerificationFailureEntry[]> {
    const database = this.requireDatabase('listVerificationFailures', options.region ?? null);

    if (typeof (database as any).listVerificationFailures === 'function') {
      return (database as any).listVerificationFailures(options);
    }

    const limit = Math.max(1, Math.min(100, options.limit ?? 20));

    const conditions: any[] = [
      eq(webhookLogs.processed, false),
      sql`COALESCE(${webhookLogs.error}, '') LIKE 'verification_failed:%'`,
    ];

    if (options.webhookId) {
      conditions.push(eq(webhookLogs.webhookId, options.webhookId));
    }

    if (options.workflowId) {
      conditions.push(eq(webhookLogs.workflowId, options.workflowId));
    }

    if (options.since) {
      conditions.push(gte(webhookLogs.updatedAt, options.since));
    }

    const whereClause = conditions.length === 1 ? conditions[0]! : and(...conditions);

    const rows = await database
      .select({
        id: webhookLogs.id,
        webhookId: webhookLogs.webhookId,
        workflowId: webhookLogs.workflowId,
        error: webhookLogs.error,
        updatedAt: webhookLogs.updatedAt,
        timestamp: webhookLogs.timestamp,
      })
      .from(webhookLogs)
      .where(whereClause)
      .orderBy(desc(webhookLogs.updatedAt))
      .limit(limit);

    return rows.map((row: any) => {
      const parsed = parseVerificationFailurePayload(row.error ?? null);
      const timestampValue =
        row.updatedAt instanceof Date
          ? row.updatedAt
          : row.updatedAt
          ? new Date(row.updatedAt)
          : row.timestamp instanceof Date
          ? row.timestamp
          : new Date(row.timestamp);

      return {
        id: row.id,
        webhookId: row.webhookId,
        workflowId: row.workflowId,
        status: parsed.status,
        reason: parsed.reason,
        message: parsed.message,
        provider: parsed.provider ?? null,
        timestamp: timestampValue,
        metadata: {
          signatureHeader: parsed.signatureHeader ?? null,
          providedSignature: parsed.providedSignature ?? null,
          timestampSkewSeconds: parsed.timestampSkewSeconds ?? null,
        },
      } satisfies VerificationFailureEntry;
    });
  }

  public async loadDedupeTokens(region?: OrganizationRegion): Promise<Record<string, string[]>> {
    const database = this.requireDatabase('loadDedupeTokens', region ?? null);

    if (typeof (database as any).getDedupeTokens === 'function') {
      return (database as any).getDedupeTokens();
    }

    const now = new Date();
    const ttlMs = DEFAULT_DEDUPE_TOKEN_TTL_MS;
    const cutoff = ttlMs > 0 ? new Date(now.getTime() - ttlMs) : null;

    if (cutoff) {
      await database.delete(webhookDedupe).where(lt(webhookDedupe.createdAt, cutoff));
    }

    const rows = await database
      .select({
        triggerId: webhookDedupe.triggerId,
        token: webhookDedupe.token,
        createdAt: webhookDedupe.createdAt,
      })
      .from(webhookDedupe)
      .orderBy(webhookDedupe.triggerId, desc(webhookDedupe.createdAt));

    const grouped = new Map<string, DedupeTokenRecord[]>();
    for (const row of rows) {
      const entry: DedupeTokenRecord = {
        token: row.token,
        createdAt: row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt),
      };

      const list = grouped.get(row.triggerId) ?? [];
      list.push(entry);
      grouped.set(row.triggerId, list);
    }

    const result: Record<string, string[]> = {};
    for (const [triggerId, entries] of grouped.entries()) {
      const sorted = entries
        .filter((entry) => (cutoff ? entry.createdAt >= cutoff : true))
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .slice(-DEFAULT_MAX_DEDUPE_TOKENS);

      if (sorted.length > 0) {
        const [webhookId] = triggerId.split('::');
        const existing = result[webhookId] ?? [];
        const merged = [...existing, ...sorted.map((entry) => entry.token)];
        result[webhookId] = Array.from(new Set(merged));
      }
    }

    return result;
  }

  public async persistDedupeTokens(
    id: string,
    tokens: DedupeTokenInput[],
    options: { region?: OrganizationRegion } = {}
  ): Promise<void> {
    const database = this.requireDatabase('persistDedupeTokens', options.region ?? null);

    if (typeof (database as any).persistDedupeTokens === 'function') {
      await (database as any).persistDedupeTokens(id, tokens);
      return;
    }

    const now = new Date();
    const ttlMs = DEFAULT_DEDUPE_TOKEN_TTL_MS;
    const cutoff = ttlMs > 0 ? new Date(now.getTime() - ttlMs) : null;
    const normalizedTokens = tokens
      .map((token) => {
        if (typeof token === 'string') {
          return { token, createdAt: now } as DedupeTokenRecord;
        }
        const candidate = token.createdAt
          ? token.createdAt instanceof Date
            ? token.createdAt
            : new Date(token.createdAt)
          : now;
        const createdAt = Number.isNaN(candidate.getTime()) ? now : candidate;
        return { token: token.token, createdAt } as DedupeTokenRecord;
      })
      .filter((entry) => entry.token);

    if (cutoff) {
      for (let i = normalizedTokens.length - 1; i >= 0; i -= 1) {
        if (normalizedTokens[i]?.createdAt && normalizedTokens[i]!.createdAt < cutoff) {
          normalizedTokens.splice(i, 1);
        }
      }
    }

    if (normalizedTokens.length === 0) {
      return;
    }

    try {
      await database
        .insert(webhookDedupe)
        .values(
          normalizedTokens.map((entry) => ({
            triggerId: id,
            token: entry.token,
            createdAt: entry.createdAt,
          })),
        )
        .onConflictDoUpdate({
          target: [webhookDedupe.triggerId, webhookDedupe.token],
          set: {
            createdAt: sql`GREATEST("webhook_dedupe"."created_at", EXCLUDED."created_at")`,
          },
        });

      if (cutoff) {
        await database.delete(webhookDedupe).where(lt(webhookDedupe.createdAt, cutoff));
      }

      const maxTokens = DEFAULT_MAX_DEDUPE_TOKENS;
      await database.execute(sql`
        DELETE FROM "webhook_dedupe"
        WHERE "trigger_id" = ${id}
          AND ("trigger_id", "token") NOT IN (
            SELECT "trigger_id", "token"
            FROM "webhook_dedupe"
            WHERE "trigger_id" = ${id}
            ORDER BY "created_at" DESC
            LIMIT ${maxTokens}
          )
      `);
    } catch (error) {
      this.logPersistenceError('persistDedupeTokens', error, { triggerId: id, tokenCount: tokens.length });
    }
  }

  public static resetForTests(): void {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('TriggerPersistenceService.resetForTests is only available in test environments');
    }

    TriggerPersistenceService.instance = new TriggerPersistenceService();
  }

  public getInMemoryStoreForTests(): InMemoryTriggerPersistenceStore {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('getInMemoryStoreForTests is only available in test environments');
    }

    return this.memoryStore;
  }

  private requireDatabase(operation: string, region?: OrganizationRegion | null): any {
    if (isDatabaseAvailable()) {
      try {
        if (region) {
          return getDatabaseClient(region);
        }
        if (db) {
          return db;
        }
      } catch (error) {
        this.logPersistenceError('resolveDatabase', error, { operation, region });
      }
    }

    this.logDatabaseFallback(operation);
    return this.memoryStore;
  }

  private logDatabaseFallback(operation: string): void {
    if (!this.hasLoggedFallback) {
      console.warn(
        `⚠️ Trigger persistence is using in-memory storage because the database schema check failed (operation=${operation}). ` +
          'Run "npm run db:push" to apply migrations and restore persistent trigger storage.',
      );
      this.hasLoggedFallback = true;
    }
  }

  private mapWebhookTriggerRow(row: any): WebhookTrigger {
    const region = (row.region as OrganizationRegion | undefined) ?? (row.metadata?.region as OrganizationRegion | undefined);
    const metadata = {
      ...(row.metadata ?? {}),
      ...(region ? { region } : {}),
    };

    return {
      id: row.id,
      workflowId: row.workflowId,
      appId: row.appId,
      triggerId: row.triggerId,
      endpoint: row.endpoint ?? `/api/webhooks/${row.id}`,
      secret: row.secret ?? undefined,
      isActive: row.isActive,
      lastTriggered: row.metadata?.lastTriggered ? new Date(row.metadata.lastTriggered) : undefined,
      metadata,
      organizationId: row.organizationId ?? row.metadata?.organizationId ?? undefined,
      userId: row.metadata?.userId ?? undefined,
      region: region ?? undefined,
    };
  }

  private mapPollingTriggerRow(row: any): PollingTrigger {
    const region = (row.region as OrganizationRegion | undefined) ?? (row.metadata?.region as OrganizationRegion | undefined);
    const metadata = {
      ...(row.metadata ?? {}),
      ...(region ? { region } : {}),
    };

    return {
      id: row.id,
      workflowId: row.workflowId,
      appId: row.appId,
      triggerId: row.triggerId,
      interval: row.interval,
      lastPoll: row.lastPoll ? new Date(row.lastPoll) : undefined,
      nextPoll: row.nextPoll ? new Date(row.nextPoll) : new Date(Date.now() + row.interval * 1000),
      nextPollAt: row.nextPollAt
        ? new Date(row.nextPollAt)
        : row.nextPoll
        ? new Date(row.nextPoll)
        : new Date(Date.now() + row.interval * 1000),
      isActive: row.isActive,
      dedupeKey: row.dedupeKey ?? undefined,
      metadata,
      cursor: row.cursor ?? null,
      backoffCount: Number(row.backoffCount ?? row.backoff_count ?? 0),
      lastStatus: row.lastStatus ?? row.last_status ?? null,
      organizationId: row.organizationId ?? row.metadata?.organizationId ?? undefined,
      userId: row.metadata?.userId ?? undefined,
      region: region ?? undefined,
    };
  }

  private logPersistenceError(operation: string, error: unknown, context: Record<string, unknown> = {}): void {
    const details = JSON.stringify(context);
    console.error(`❌ Trigger persistence failure during ${operation}: ${getErrorMessage(error)} | context=${details}`);
  }
}

export const triggerPersistenceService = TriggerPersistenceService.getInstance();
