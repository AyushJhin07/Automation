import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import {
  db,
  webhookLogs,
  pollingTriggers,
  workflowTriggers,
} from '../database/schema';
import { ensureDatabaseReady, isDatabaseAvailable } from '../database/status.js';
import type { PollingTrigger, TriggerEvent, WebhookTrigger } from '../webhooks/types';
import { getErrorMessage } from '../types/common';

void ensureDatabaseReady();

const DEFAULT_DEDUPE_TOKEN_TTL_MS = 1000 * 60 * 60; // 1 hour

interface DedupeTokenEntry {
  value: string;
  expiresAt: number;
}

class InMemoryTriggerPersistenceStore {
  private workflowTriggers = new Map<string, any>();
  private pollingTriggers = new Map<string, any>();
  private webhookLogs = new Map<string, any>();
  private dedupeTokens = new Map<string, DedupeTokenEntry[]>();

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
      cursor: record.cursor ?? existing.cursor ?? null,
      backoffCount: record.backoffCount ?? existing.backoffCount ?? 0,
      lastStatus: record.lastStatus ?? existing.lastStatus ?? null,
      isActive: record.isActive ?? existing.isActive ?? true,
      updatedAt: new Date(),
      createdAt: existing.createdAt ?? new Date(),
    };
    this.pollingTriggers.set(record.id, next);
  }

  public async updatePollingRuntimeState({
    id,
    lastPoll,
    nextPoll,
    cursor,
    backoffCount,
    lastStatus,
  }: {
    id: string;
    lastPoll?: Date;
    nextPoll: Date;
    cursor?: Record<string, any> | null;
    backoffCount?: number;
    lastStatus?: string | null;
  }) {
    const polling = this.pollingTriggers.get(id);
    if (polling) {
      polling.lastPoll = lastPoll ?? null;
      polling.nextPoll = nextPoll;
      if (cursor !== undefined) {
        polling.cursor = cursor;
      }
      if (backoffCount !== undefined) {
        polling.backoffCount = backoffCount;
      }
      if (lastStatus !== undefined) {
        polling.lastStatus = lastStatus;
      }
      polling.updatedAt = new Date();
      this.pollingTriggers.set(id, polling);
    }

    const workflow = this.workflowTriggers.get(id);
    if (workflow) {
      workflow.updatedAt = new Date();
      this.workflowTriggers.set(id, workflow);
    }
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
    const now = Date.now();
    for (const [id, tokens] of this.dedupeTokens.entries()) {
      const filtered = tokens.filter((entry) => entry.expiresAt > now);
      if (filtered.length === 0) {
        this.dedupeTokens.delete(id);
        continue;
      }
      this.dedupeTokens.set(id, filtered);
      result[id] = filtered.map((entry) => entry.value);
    }
    return result;
  }

  public async persistDedupeTokens(
    id: string,
    tokens: string[],
    options?: { ttlMs?: number; now?: Date },
  ) {
    const ttlMs = options?.ttlMs ?? DEFAULT_DEDUPE_TOKEN_TTL_MS;
    const now = options?.now ?? new Date();
    const expiresAt = now.getTime() + ttlMs;
    const entries: DedupeTokenEntry[] = tokens.map((token) => ({ value: token, expiresAt }));

    if (entries.length === 0) {
      this.dedupeTokens.delete(id);
    } else {
      this.dedupeTokens.set(id, entries);
    }

    const workflow = this.workflowTriggers.get(id);
    if (workflow) {
      workflow.dedupeState = {
        tokens: entries.map((entry) => ({
          value: entry.value,
          expiresAt: new Date(entry.expiresAt).toISOString(),
        })),
        ttlMs,
        updatedAt: now.toISOString(),
      };
      workflow.updatedAt = new Date();
      this.workflowTriggers.set(id, workflow);
    }
  }

  public async getWebhookLog(id: string) {
    return this.webhookLogs.get(id);
  }
}

export interface TriggerExecutionResult {
  success: boolean;
  error?: string;
  executionId?: string;
}

export class TriggerPersistenceService {
  private static instance: TriggerPersistenceService;
  public static readonly DEFAULT_DEDUPE_TOKEN_TTL_MS = DEFAULT_DEDUPE_TOKEN_TTL_MS;
  private readonly memoryStore = new InMemoryTriggerPersistenceStore();
  private hasLoggedFallback = false;

  private constructor() {}

  public static getInstance(): TriggerPersistenceService {
    if (!TriggerPersistenceService.instance) {
      TriggerPersistenceService.instance = new TriggerPersistenceService();
    }
    return TriggerPersistenceService.instance;
  }

  public isDatabaseEnabled(): boolean {
    return isDatabaseAvailable();
  }

  public async loadWebhookTriggers(): Promise<WebhookTrigger[]> {
    const database = this.requireDatabase('loadWebhookTriggers');

    if (typeof (database as any).getActiveWebhookTriggers === 'function') {
      const rows = await (database as any).getActiveWebhookTriggers();
      return rows.map((row: any) => this.mapWebhookTriggerRow(row));
    }

    const rows = await database
      .select()
      .from(workflowTriggers)
      .where(and(eq(workflowTriggers.type, 'webhook'), eq(workflowTriggers.isActive, true)));

    return rows.map((row) => ({
      id: row.id,
      workflowId: row.workflowId,
      appId: row.appId,
      triggerId: row.triggerId,
      endpoint: row.endpoint ?? `/api/webhooks/${row.id}`,
      secret: row.secret ?? undefined,
      isActive: row.isActive,
      lastTriggered: row.metadata?.lastTriggered ? new Date(row.metadata.lastTriggered) : undefined,
      metadata: row.metadata ?? {},
    }));
  }

  public async loadPollingTriggers(): Promise<PollingTrigger[]> {
    const database = this.requireDatabase('loadPollingTriggers');

    if (typeof (database as any).getActivePollingTriggers === 'function') {
      const rows = await (database as any).getActivePollingTriggers();
      return rows.map((row: any) => this.mapPollingTriggerRow(row));
    }

    const rows = await database
      .select()
      .from(pollingTriggers)
      .where(eq(pollingTriggers.isActive, true));

    return rows.map((row) => ({
      id: row.id,
      workflowId: row.workflowId,
      appId: row.appId,
      triggerId: row.triggerId,
      interval: row.interval,
      lastPoll: row.lastPoll ? new Date(row.lastPoll) : undefined,
      nextPoll: row.nextPoll ? new Date(row.nextPoll) : new Date(Date.now() + row.interval * 1000),
      isActive: row.isActive,
      dedupeKey: row.dedupeKey ?? undefined,
      metadata: row.metadata ?? {},
      cursor: row.cursor ?? null,
      backoffCount: row.backoffCount ?? 0,
      lastStatus: row.lastStatus ?? null,
    }));
  }

  public async saveWebhookTrigger(trigger: WebhookTrigger): Promise<void> {
    const database = this.requireDatabase('saveWebhookTrigger');
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
            updatedAt: now,
          },
        });
    } catch (error) {
      this.logPersistenceError('saveWebhookTrigger', error, { triggerId: trigger.id, workflowId: trigger.workflowId });
      throw error;
    }
  }

  public async savePollingTrigger(trigger: PollingTrigger): Promise<void> {
    const database = this.requireDatabase('savePollingTrigger');
    const record = {
      id: trigger.id,
      workflowId: trigger.workflowId,
      appId: trigger.appId,
      triggerId: trigger.triggerId,
      interval: trigger.interval,
      lastPoll: trigger.lastPoll ?? null,
      nextPoll: trigger.nextPoll,
      isActive: trigger.isActive,
      dedupeKey: trigger.dedupeKey ?? null,
      metadata: trigger.metadata ?? {},
      cursor: trigger.cursor ?? null,
      backoffCount: trigger.backoffCount ?? 0,
      lastStatus: trigger.lastStatus ?? null,
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
            isActive: trigger.isActive,
            dedupeKey: trigger.dedupeKey ?? null,
            metadata: trigger.metadata ?? {},
            cursor: trigger.cursor ?? null,
            backoffCount: trigger.backoffCount ?? 0,
            lastStatus: trigger.lastStatus ?? null,
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
    lastPoll: Date | undefined,
    nextPoll: Date,
    options: { cursor?: Record<string, any> | null; backoffCount?: number; lastStatus?: string | null } = {},
  ): Promise<void> {
    const database = this.requireDatabase('updatePollingRuntimeState');
    const { cursor, backoffCount, lastStatus } = options;

    if (typeof (database as any).updatePollingRuntimeState === 'function') {
      await (database as any).updatePollingRuntimeState({ id, lastPoll, nextPoll, cursor, backoffCount, lastStatus });
      return;
    }

    const now = new Date();
    const updateData: Record<string, any> = {
      lastPoll: lastPoll ?? null,
      nextPoll,
      updatedAt: now,
    };

    if (cursor !== undefined) {
      updateData.cursor = cursor;
    }

    if (backoffCount !== undefined) {
      updateData.backoffCount = backoffCount;
    }

    if (lastStatus !== undefined) {
      updateData.lastStatus = lastStatus;
    }

    try {
      await database
        .update(pollingTriggers)
        .set(updateData)
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

  public async deactivateTrigger(id: string): Promise<void> {
    const database = this.requireDatabase('deactivateTrigger');

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

    const database = this.requireDatabase('logWebhookEvent');

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

    const database = this.requireDatabase('markWebhookEventProcessed');

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

  public async loadDedupeTokens(): Promise<Record<string, string[]>> {
    const database = this.requireDatabase('loadDedupeTokens');

    if (typeof (database as any).getDedupeTokens === 'function') {
      return (database as any).getDedupeTokens();
    }

    const rows = await database
      .select({ id: workflowTriggers.id, dedupeState: workflowTriggers.dedupeState })
      .from(workflowTriggers);

    const result: Record<string, string[]> = {};
    const now = new Date();
    for (const row of rows) {
      const tokens = this.extractDedupeTokensFromState(row.dedupeState, now);
      result[row.id] = tokens;
    }
    return result;
  }

  public async persistDedupeTokens(
    id: string,
    tokens: string[],
    options?: { ttlMs?: number; now?: Date },
  ): Promise<void> {
    const database = this.requireDatabase('persistDedupeTokens');
    const ttlMs = options?.ttlMs ?? DEFAULT_DEDUPE_TOKEN_TTL_MS;
    const now = options?.now ?? new Date();
    const expiresAtIso = new Date(now.getTime() + ttlMs).toISOString();
    const dedupeState = {
      tokens: tokens.map((token) => ({ value: token, expiresAt: expiresAtIso })),
      ttlMs,
      updatedAt: now.toISOString(),
    };

    if (typeof (database as any).persistDedupeTokens === 'function') {
      await (database as any).persistDedupeTokens(id, tokens, { ttlMs, now });
      return;
    }

    try {
      await database
        .update(workflowTriggers)
        .set({
          dedupeState,
          updatedAt: now,
        })
        .where(eq(workflowTriggers.id, id));
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

  private requireDatabase(operation: string): any {
    if (isDatabaseAvailable() && db) {
      return db;
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
    return {
      id: row.id,
      workflowId: row.workflowId,
      appId: row.appId,
      triggerId: row.triggerId,
      endpoint: row.endpoint ?? `/api/webhooks/${row.id}`,
      secret: row.secret ?? undefined,
      isActive: row.isActive,
      lastTriggered: row.metadata?.lastTriggered ? new Date(row.metadata.lastTriggered) : undefined,
      metadata: row.metadata ?? {},
    };
  }

  private mapPollingTriggerRow(row: any): PollingTrigger {
    return {
      id: row.id,
      workflowId: row.workflowId,
      appId: row.appId,
      triggerId: row.triggerId,
      interval: row.interval,
      lastPoll: row.lastPoll ? new Date(row.lastPoll) : undefined,
      nextPoll: row.nextPoll ? new Date(row.nextPoll) : new Date(Date.now() + row.interval * 1000),
      isActive: row.isActive,
      dedupeKey: row.dedupeKey ?? undefined,
      metadata: row.metadata ?? {},
      cursor: row.cursor ?? null,
      backoffCount: row.backoffCount ?? 0,
      lastStatus: row.lastStatus ?? null,
    };
  }

  public calculateNextBackoffIntervalSeconds(
    baseIntervalSeconds: number,
    backoffCount: number,
    options: { multiplier?: number; maxIntervalSeconds?: number } = {},
  ): number {
    if (!Number.isFinite(baseIntervalSeconds) || baseIntervalSeconds <= 0) {
      return 0;
    }

    const multiplier = options.multiplier ?? 2;
    const maxIntervalSeconds = options.maxIntervalSeconds ?? baseIntervalSeconds * 32;
    const attempt = Math.max(0, backoffCount);
    const interval = baseIntervalSeconds * Math.pow(multiplier, attempt);
    return Math.min(interval, maxIntervalSeconds);
  }

  public getNextPollDateWithBackoff(
    baseIntervalSeconds: number,
    backoffCount: number,
    options: { multiplier?: number; maxIntervalSeconds?: number; now?: Date } = {},
  ): Date {
    const now = options.now ?? new Date();
    const intervalSeconds = this.calculateNextBackoffIntervalSeconds(baseIntervalSeconds, backoffCount, options);
    return new Date(now.getTime() + intervalSeconds * 1000);
  }

  private extractDedupeTokensFromState(state: any, now: Date): string[] {
    if (!state || !Array.isArray(state.tokens)) {
      return [];
    }

    const nowMs = now.getTime();
    const tokens: string[] = [];

    for (const entry of state.tokens) {
      if (typeof entry === 'string') {
        tokens.push(entry);
        continue;
      }

      if (!entry || typeof entry !== 'object') {
        continue;
      }

      const value = typeof entry.value === 'string' ? entry.value : undefined;
      const expiresAt = entry.expiresAt ? new Date(entry.expiresAt).getTime() : undefined;

      if (!value) {
        continue;
      }

      if (expiresAt === undefined || Number.isNaN(expiresAt) || expiresAt > nowMs) {
        tokens.push(value);
      }
    }

    return tokens;
  }

  private logPersistenceError(operation: string, error: unknown, context: Record<string, unknown> = {}): void {
    const details = JSON.stringify(context);
    console.error(`❌ Trigger persistence failure during ${operation}: ${getErrorMessage(error)} | context=${details}`);
  }
}

export const triggerPersistenceService = TriggerPersistenceService.getInstance();
