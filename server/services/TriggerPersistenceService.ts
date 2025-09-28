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

interface StoredTriggerState {
  trigger: WebhookTrigger | PollingTrigger;
  type: 'webhook' | 'polling';
}

interface MemoryWebhookEvent extends TriggerEvent {
  id: string;
  error?: string;
}

export interface TriggerExecutionResult {
  success: boolean;
  error?: string;
}

class TriggerPersistenceService {
  private static instance: TriggerPersistenceService;

  private readonly database = db;
  private readonly memoryTriggers = new Map<string, StoredTriggerState>();
  private readonly memoryDedupe = new Map<string, string[]>();
  private readonly memoryWebhookLogs = new Map<string, MemoryWebhookEvent>();

  private constructor() {}

  public static getInstance(): TriggerPersistenceService {
    if (!TriggerPersistenceService.instance) {
      TriggerPersistenceService.instance = new TriggerPersistenceService();
    }
    return TriggerPersistenceService.instance;
  }

  public isDatabaseEnabled(): boolean {
    return Boolean(this.database);
  }

  public async loadWebhookTriggers(): Promise<WebhookTrigger[]> {
    if (!this.database) {
      return Array.from(this.memoryTriggers.values())
        .filter((entry) => entry.type === 'webhook')
        .map((entry) => {
          const trigger = entry.trigger as WebhookTrigger;
          return {
            ...trigger,
            metadata: { ...(trigger.metadata ?? {}) },
          };
        });
    }

    const rows = await this.database
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
    if (!this.database) {
      return Array.from(this.memoryTriggers.values())
        .filter((entry) => entry.type === 'polling')
        .map((entry) => {
          const trigger = entry.trigger as PollingTrigger;
          return {
            ...trigger,
            metadata: { ...(trigger.metadata ?? {}) },
          };
        });
    }

    const rows = await this.database
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
    if (!this.database) {
      this.memoryTriggers.set(trigger.id, {
        trigger: {
          ...trigger,
          metadata: { ...(trigger.metadata ?? {}) },
        },
        type: 'webhook',
      });
      return;
    }

    const now = new Date();
    await this.database
      .insert(workflowTriggers)
      .values({
        id: trigger.id,
        workflowId: trigger.workflowId,
        type: 'webhook',
        appId: trigger.appId,
        triggerId: trigger.triggerId,
        endpoint: trigger.endpoint,
        secret: trigger.secret,
        metadata: trigger.metadata ?? {},
        isActive: trigger.isActive,
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
  }

  public async savePollingTrigger(trigger: PollingTrigger): Promise<void> {
    if (!this.database) {
      this.memoryTriggers.set(trigger.id, {
        trigger: {
          ...trigger,
          metadata: { ...(trigger.metadata ?? {}) },
        },
        type: 'polling',
      });
      return;
    }

    const now = new Date();

    await this.database
      .insert(pollingTriggers)
      .values({
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

    await this.database
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
  }

  public async updatePollingRuntimeState(id: string, lastPoll: Date | undefined, nextPoll: Date): Promise<void> {
    if (!this.database) {
      const existing = this.memoryTriggers.get(id);
      if (existing && existing.type === 'polling') {
        existing.trigger = {
          ...(existing.trigger as PollingTrigger),
          lastPoll,
          nextPoll,
        };
      }
      return;
    }

    const now = new Date();
    await this.database
      .update(pollingTriggers)
      .set({
        lastPoll: lastPoll ?? null,
        nextPoll,
        updatedAt: now,
      })
      .where(eq(pollingTriggers.id, id));

    await this.database
      .update(workflowTriggers)
      .set({ updatedAt: now })
      .where(eq(workflowTriggers.id, id));
  }

  public async deactivateTrigger(id: string): Promise<void> {
    if (!this.database) {
      this.memoryTriggers.delete(id);
      this.memoryDedupe.delete(id);
      return;
    }

    const now = new Date();
    await this.database
      .update(workflowTriggers)
      .set({ isActive: false, updatedAt: now })
      .where(eq(workflowTriggers.id, id));

    await this.database
      .update(pollingTriggers)
      .set({ isActive: false, updatedAt: now })
      .where(eq(pollingTriggers.id, id));
  }

  public async logWebhookEvent(event: TriggerEvent): Promise<string | null> {
    const id = event.id ?? randomUUID();

    if (!this.database) {
      this.memoryWebhookLogs.set(id, { ...event, id });
      return id;
    }

    try {
      await this.database.insert(webhookLogs).values({
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
      });
      return id;
    } catch (error) {
      console.error('❌ Failed to persist webhook event log:', getErrorMessage(error));
      return null;
    }
  }

  public async markWebhookEventProcessed(id: string | null, result: TriggerExecutionResult): Promise<void> {
    if (!id) {
      return;
    }

    if (!this.database) {
      const existing = this.memoryWebhookLogs.get(id);
      if (existing) {
        existing.processed = result.success;
        if (!result.success && result.error) {
          existing.error = result.error;
        }
      }
      return;
    }

    try {
      await this.database
        .update(webhookLogs)
        .set({
          processed: result.success,
          error: result.success ? null : result.error ?? null,
          updatedAt: new Date(),
        })
        .where(eq(webhookLogs.id, id));
    } catch (error) {
      console.error('❌ Failed to update webhook event status:', getErrorMessage(error));
    }
  }

  public async loadDedupeTokens(): Promise<Record<string, string[]>> {
    if (!this.database) {
      const state: Record<string, string[]> = {};
      for (const [id, tokens] of this.memoryDedupe.entries()) {
        state[id] = [...tokens];
      }
      return state;
    }

    const rows = await this.database
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
    if (!this.database) {
      this.memoryDedupe.set(id, [...tokens]);
      return;
    }

    try {
      await this.database
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
      console.error('❌ Failed to persist dedupe tokens:', getErrorMessage(error));
    }
  }
}

export const triggerPersistenceService = TriggerPersistenceService.getInstance();
