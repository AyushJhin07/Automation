import { and, eq, sql } from 'drizzle-orm';
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

class InMemoryTriggerPersistenceStore {
  private workflowTriggers = new Map<string, any>();
  private pollingTriggers = new Map<string, any>();
  private webhookLogs = new Map<string, any>();
  private dedupeTokens = new Map<string, string[]>();

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
  }: {
    id: string;
    lastPoll?: Date;
    nextPoll?: Date;
    nextPollAt?: Date;
  }) {
    const polling = this.pollingTriggers.get(id);
    if (polling) {
      polling.lastPoll = lastPoll ?? null;
      const resolvedNextPoll = nextPollAt ?? nextPoll ?? polling.nextPollAt ?? polling.nextPoll ?? null;
      polling.nextPoll = resolvedNextPoll;
      polling.nextPollAt = resolvedNextPoll;
      polling.updatedAt = new Date();
      this.pollingTriggers.set(id, polling);
    }

    const workflow = this.workflowTriggers.get(id);
    if (workflow) {
      workflow.updatedAt = new Date();
      this.workflowTriggers.set(id, workflow);
    }
  }

  public async claimDuePollingTriggers({ now, limit }: { now: Date; limit: number }) {
    const due = Array.from(this.pollingTriggers.values())
      .filter((row) => row.isActive !== false && row.nextPollAt && row.nextPollAt <= now)
      .sort((a, b) => (a.nextPollAt?.getTime() ?? 0) - (b.nextPollAt?.getTime() ?? 0))
      .slice(0, limit);

    for (const trigger of due) {
      const nextRun = new Date(now.getTime() + (trigger.interval ?? 60) * 1000);
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
    for (const [id, tokens] of this.dedupeTokens.entries()) {
      result[id] = [...tokens];
    }
    return result;
  }

  public async persistDedupeTokens(id: string, tokens: string[]) {
    this.dedupeTokens.set(id, [...tokens]);
    const workflow = this.workflowTriggers.get(id);
    if (workflow) {
      workflow.dedupeState = { tokens: [...tokens], updatedAt: new Date().toISOString() };
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
      nextPollAt: row.nextPollAt
        ? new Date(row.nextPollAt)
        : row.nextPoll
        ? new Date(row.nextPoll)
        : new Date(Date.now() + row.interval * 1000),
      isActive: row.isActive,
      dedupeKey: row.dedupeKey ?? undefined,
      metadata: row.metadata ?? {},
    }));
  }

  public async claimDuePollingTriggers(options: { limit?: number; now?: Date } = {}): Promise<PollingTrigger[]> {
    const database = this.requireDatabase('claimDuePollingTriggers');
    const now = options.now ?? new Date();
    const limit = Math.max(1, Math.min(100, options.limit ?? 25));

    if (typeof (database as any).claimDuePollingTriggers === 'function') {
      const rows = await (database as any).claimDuePollingTriggers({ now, limit });
      return rows.map((row: any) => this.mapPollingTriggerRow(row));
    }

    if (!database.transaction) {
      const rows = await (database as any)
        .select()
        .from(pollingTriggers)
        .where(eq(pollingTriggers.isActive, true));
      const mapped = rows
        .map((row: any) => this.mapPollingTriggerRow(row))
        .filter((row) => row.nextPollAt <= now)
        .sort((a, b) => a.nextPollAt.getTime() - b.nextPollAt.getTime())
        .slice(0, limit);
      for (const trigger of mapped) {
        const nextRun = new Date(now.getTime() + Math.max(1, trigger.interval) * 1000);
        await this.updatePollingRuntimeState(trigger.id, { nextPollAt: nextRun });
        trigger.nextPollAt = nextRun;
        trigger.nextPoll = nextRun;
      }
      return mapped;
    }

    return await database.transaction(async (tx: any) => {
      const result = await tx.execute(
        sql`SELECT * FROM polling_triggers WHERE is_active = true AND COALESCE(next_poll_at, next_poll) <= ${now} ORDER BY COALESCE(next_poll_at, next_poll) ASC LIMIT ${limit} FOR UPDATE SKIP LOCKED`
      );
      const rows: any[] = (result?.rows ?? result ?? []) as any[];

      if (!rows || rows.length === 0) {
        return [];
      }

      const claimed: PollingTrigger[] = [];
      for (const row of rows) {
        const intervalSeconds = Math.max(1, Number(row.interval ?? 60));
        const nextRun = new Date(now.getTime() + intervalSeconds * 1000);
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
      nextPollAt: trigger.nextPollAt ?? trigger.nextPoll,
      isActive: trigger.isActive,
      dedupeKey: trigger.dedupeKey ?? null,
      metadata: trigger.metadata ?? {},
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
            nextPollAt: trigger.nextPollAt ?? trigger.nextPoll,
            isActive: trigger.isActive,
            dedupeKey: trigger.dedupeKey ?? null,
            metadata: trigger.metadata ?? {},
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
    updates: { lastPoll?: Date; nextPoll?: Date; nextPollAt?: Date }
  ): Promise<void> {
    const database = this.requireDatabase('updatePollingRuntimeState');

    if (typeof (database as any).updatePollingRuntimeState === 'function') {
      await (database as any).updatePollingRuntimeState({ id, ...updates });
      return;
    }

    const now = new Date();
    try {
      const nextPollValue = updates.nextPollAt ?? updates.nextPoll ?? null;
      await database
        .update(pollingTriggers)
        .set({
          lastPoll: updates.lastPoll ?? null,
          nextPoll: nextPollValue,
          nextPollAt: nextPollValue,
          updatedAt: now,
        })
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
    for (const row of rows) {
      const tokens = Array.isArray(row.dedupeState?.tokens) ? row.dedupeState.tokens : [];
      result[row.id] = tokens;
    }
    return result;
  }

  public async persistDedupeTokens(id: string, tokens: string[]): Promise<void> {
    const database = this.requireDatabase('persistDedupeTokens');

    if (typeof (database as any).persistDedupeTokens === 'function') {
      await (database as any).persistDedupeTokens(id, tokens);
      return;
    }

    try {
      await database
        .update(workflowTriggers)
        .set({
          dedupeState: {
            tokens,
            updatedAt: new Date().toISOString(),
          },
          updatedAt: new Date(),
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
      nextPollAt: row.nextPollAt
        ? new Date(row.nextPollAt)
        : row.nextPoll
        ? new Date(row.nextPoll)
        : new Date(Date.now() + row.interval * 1000),
      isActive: row.isActive,
      dedupeKey: row.dedupeKey ?? undefined,
      metadata: row.metadata ?? {},
    };
  }

  private logPersistenceError(operation: string, error: unknown, context: Record<string, unknown> = {}): void {
    const details = JSON.stringify(context);
    console.error(`❌ Trigger persistence failure during ${operation}: ${getErrorMessage(error)} | context=${details}`);
  }
}

export const triggerPersistenceService = TriggerPersistenceService.getInstance();
