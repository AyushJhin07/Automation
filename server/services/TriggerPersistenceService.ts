import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import {
  db,
  webhookLogs,
  pollingTriggers,
  workflowTriggers,
} from '../database/schema';
import type { PollingTrigger, TriggerEvent, WebhookTrigger } from '../webhooks/types';
import { getErrorMessage } from '../types/common';

export interface TriggerExecutionResult {
  success: boolean;
  error?: string;
  executionId?: string;
}

class TriggerPersistenceService {
  private static instance: TriggerPersistenceService;

  private constructor() {}

  public static getInstance(): TriggerPersistenceService {
    if (!TriggerPersistenceService.instance) {
      TriggerPersistenceService.instance = new TriggerPersistenceService();
    }
    return TriggerPersistenceService.instance;
  }

  public isDatabaseEnabled(): boolean {
    return Boolean(db);
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

  public async updatePollingRuntimeState(id: string, lastPoll: Date | undefined, nextPoll: Date): Promise<void> {
    const database = this.requireDatabase('updatePollingRuntimeState');

    if (typeof (database as any).updatePollingRuntimeState === 'function') {
      await (database as any).updatePollingRuntimeState({ id, lastPoll, nextPoll });
      return;
    }

    const now = new Date();
    try {
      await database
        .update(pollingTriggers)
        .set({
          lastPoll: lastPoll ?? null,
          nextPoll,
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

  private requireDatabase(operation: string): any {
    if (!db) {
      const message = `Trigger persistence requires an active database connection (operation=${operation}).`;
      throw new Error(message);
    }
    return db;
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
    };
  }

  private logPersistenceError(operation: string, error: unknown, context: Record<string, unknown> = {}): void {
    const details = JSON.stringify(context);
    console.error(`❌ Trigger persistence failure during ${operation}: ${getErrorMessage(error)} | context=${details}`);
  }
}

export const triggerPersistenceService = TriggerPersistenceService.getInstance();
