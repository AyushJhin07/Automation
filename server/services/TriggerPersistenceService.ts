import { randomUUID } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { db, webhookLogs, pollingTriggers, workflowTriggers } from '../database/schema';
import { getErrorMessage } from '../types/common';
import type { PollingTrigger, TriggerDedupeState, TriggerEvent, WebhookTrigger } from '../webhooks/types';

interface PersistedWebhookTrigger {
  trigger: WebhookTrigger;
  dedupeTokens: string[];
}

interface PersistedPollingTrigger {
  trigger: PollingTrigger;
  dedupeTokens: string[];
}

class TriggerPersistenceService {
  private readonly db = db;
  private readonly memoryStore = {
    webhooks: new Map<string, PersistedWebhookTrigger>(),
    polling: new Map<string, PersistedPollingTrigger>(),
    dedupe: new Map<string, TriggerDedupeState>(),
    webhookLogs: [] as TriggerEvent[],
  };

  private isDbAvailable(): boolean {
    return Boolean(this.db);
  }

  private normaliseMetadata(metadata: Record<string, any> | null | undefined): Record<string, any> {
    if (!metadata || typeof metadata !== 'object') {
      return {};
    }
    return metadata as Record<string, any>;
  }

  private normaliseDedupeState(state?: TriggerDedupeState | null): TriggerDedupeState {
    if (!state) {
      return { tokens: [] };
    }
    const tokens = Array.isArray(state.tokens) ? state.tokens.filter((token) => typeof token === 'string') : [];
    return {
      tokens,
      cursor: typeof state.cursor === 'string' ? state.cursor : undefined,
      lastEventAt: typeof state.lastEventAt === 'string' ? state.lastEventAt : undefined,
    };
  }

  private async readWorkflowTriggerState(triggerId: string): Promise<TriggerDedupeState> {
    if (!this.isDbAvailable()) {
      return this.memoryStore.dedupe.get(triggerId) ?? { tokens: [] };
    }

    try {
      const rows = await this.db
        .select({ dedupeState: workflowTriggers.dedupeState })
        .from(workflowTriggers)
        .where(eq(workflowTriggers.id, triggerId))
        .limit(1);

      const state = rows[0]?.dedupeState as TriggerDedupeState | undefined;
      return this.normaliseDedupeState(state);
    } catch (error) {
      console.error('❌ Failed to read trigger dedupe state:', getErrorMessage(error));
      return { tokens: [] };
    }
  }

  private async writeWorkflowTriggerState(triggerId: string, state: TriggerDedupeState): Promise<void> {
    if (!this.isDbAvailable()) {
      this.memoryStore.dedupe.set(triggerId, state);
      return;
    }

    try {
      await this.db
        .update(workflowTriggers)
        .set({
          dedupeState: state,
          updatedAt: new Date(),
        })
        .where(eq(workflowTriggers.id, triggerId));
    } catch (error) {
      console.error('❌ Failed to update trigger dedupe state:', getErrorMessage(error));
    }
  }

  async upsertWebhookTrigger(trigger: WebhookTrigger, dedupeTokens: string[] = []): Promise<void> {
    if (!this.isDbAvailable()) {
      this.memoryStore.webhooks.set(trigger.id, { trigger, dedupeTokens });
      this.memoryStore.dedupe.set(trigger.id, { tokens: dedupeTokens });
      return;
    }

    try {
      await this.db
        .insert(workflowTriggers)
        .values({
          id: trigger.id,
          workflowId: trigger.workflowId,
          appId: trigger.appId,
          triggerId: trigger.triggerId,
          type: 'webhook',
          endpoint: trigger.endpoint,
          secret: trigger.secret,
          isActive: trigger.isActive,
          metadata: trigger.metadata,
          lastRun: trigger.lastTriggered,
          dedupeState: { tokens: dedupeTokens },
        })
        .onConflictDoUpdate({
          target: workflowTriggers.id,
          set: {
            workflowId: trigger.workflowId,
            appId: trigger.appId,
            triggerId: trigger.triggerId,
            type: 'webhook',
            endpoint: trigger.endpoint,
            secret: trigger.secret,
            isActive: trigger.isActive,
            metadata: trigger.metadata,
            lastRun: trigger.lastTriggered,
            updatedAt: new Date(),
          },
        });
    } catch (error) {
      console.error('❌ Failed to upsert webhook trigger:', getErrorMessage(error));
    }
  }

  async getActiveWebhookTriggers(): Promise<PersistedWebhookTrigger[]> {
    if (!this.isDbAvailable()) {
      return Array.from(this.memoryStore.webhooks.values()).map((entry) => {
        const state = this.memoryStore.dedupe.get(entry.trigger.id) ?? { tokens: entry.dedupeTokens };
        return { trigger: entry.trigger, dedupeTokens: state.tokens ?? [] };
      });
    }

    try {
      const rows = await this.db
        .select()
        .from(workflowTriggers)
        .where(and(eq(workflowTriggers.type, 'webhook'), eq(workflowTriggers.isActive, true)));

      return rows.map((row) => {
        const metadata = this.normaliseMetadata(row.metadata as Record<string, any> | null | undefined);
        const dedupeState = this.normaliseDedupeState(row.dedupeState as TriggerDedupeState | null | undefined);
        const trigger: WebhookTrigger = {
          id: row.id,
          appId: row.appId,
          triggerId: row.triggerId,
          workflowId: row.workflowId,
          endpoint: row.endpoint || `/api/webhooks/${row.id}`,
          secret: row.secret || undefined,
          isActive: row.isActive,
          lastTriggered: row.lastRun ? new Date(row.lastRun) : undefined,
          metadata,
        };
        return { trigger, dedupeTokens: dedupeState.tokens };
      });
    } catch (error) {
      console.error('❌ Failed to load webhook triggers:', getErrorMessage(error));
      return [];
    }
  }

  async logWebhookEvent(event: TriggerEvent): Promise<void> {
    if (!this.isDbAvailable()) {
      this.memoryStore.webhookLogs.push(event);
      return;
    }

    try {
      await this.db.insert(webhookLogs).values({
        id: randomUUID(),
        webhookId: event.webhookId,
        appId: event.appId,
        triggerId: event.triggerId,
        payload: event.payload,
        headers: event.headers,
        timestamp: event.timestamp,
        signature: event.signature,
        processed: event.processed,
      });

      await this.db
        .update(workflowTriggers)
        .set({ lastRun: event.timestamp, updatedAt: new Date() })
        .where(eq(workflowTriggers.id, event.webhookId));
    } catch (error) {
      console.error('❌ Failed to log webhook event:', getErrorMessage(error));
    }
  }

  async hasDedupeToken(triggerId: string, token: string): Promise<boolean> {
    const state = await this.readWorkflowTriggerState(triggerId);
    return state.tokens.includes(token);
  }

  async addDedupeToken(triggerId: string, token: string, maxTokens = 500): Promise<void> {
    const state = await this.readWorkflowTriggerState(triggerId);
    const tokens = state.tokens.filter((value) => value !== token);
    tokens.push(token);
    const trimmed = tokens.slice(Math.max(0, tokens.length - maxTokens));
    const nextState: TriggerDedupeState = {
      tokens: trimmed,
      cursor: state.cursor,
      lastEventAt: new Date().toISOString(),
    };
    await this.writeWorkflowTriggerState(triggerId, nextState);
  }

  async upsertPollingTrigger(trigger: PollingTrigger, dedupeTokens: string[] = []): Promise<void> {
    if (!this.isDbAvailable()) {
      this.memoryStore.polling.set(trigger.id, { trigger, dedupeTokens });
      this.memoryStore.dedupe.set(trigger.id, { tokens: dedupeTokens });
      return;
    }

    try {
      await this.db
        .insert(workflowTriggers)
        .values({
          id: trigger.id,
          workflowId: trigger.workflowId,
          appId: trigger.appId,
          triggerId: trigger.triggerId,
          type: 'polling',
          isActive: trigger.isActive,
          metadata: trigger.metadata,
          lastRun: trigger.lastPoll,
          nextRun: trigger.nextPoll,
          dedupeState: { tokens: dedupeTokens },
        })
        .onConflictDoUpdate({
          target: workflowTriggers.id,
          set: {
            workflowId: trigger.workflowId,
            appId: trigger.appId,
            triggerId: trigger.triggerId,
            type: 'polling',
            isActive: trigger.isActive,
            metadata: trigger.metadata,
            lastRun: trigger.lastPoll,
            nextRun: trigger.nextPoll,
            updatedAt: new Date(),
          },
        });

      await this.db
        .insert(pollingTriggers)
        .values({
          id: trigger.id,
          workflowId: trigger.workflowId,
          appId: trigger.appId,
          triggerId: trigger.triggerId,
          interval: trigger.interval,
          lastPoll: trigger.lastPoll,
          nextPoll: trigger.nextPoll,
          isActive: trigger.isActive,
          dedupeKey: trigger.dedupeKey,
          metadata: trigger.metadata,
        })
        .onConflictDoUpdate({
          target: pollingTriggers.id,
          set: {
            workflowId: trigger.workflowId,
            appId: trigger.appId,
            triggerId: trigger.triggerId,
            interval: trigger.interval,
            lastPoll: trigger.lastPoll,
            nextPoll: trigger.nextPoll,
            isActive: trigger.isActive,
            dedupeKey: trigger.dedupeKey,
            metadata: trigger.metadata,
            updatedAt: new Date(),
          },
        });
    } catch (error) {
      console.error('❌ Failed to upsert polling trigger:', getErrorMessage(error));
    }
  }

  async getActivePollingTriggers(): Promise<PersistedPollingTrigger[]> {
    if (!this.isDbAvailable()) {
      return Array.from(this.memoryStore.polling.values()).map((entry) => {
        const state = this.memoryStore.dedupe.get(entry.trigger.id) ?? { tokens: entry.dedupeTokens };
        return { trigger: entry.trigger, dedupeTokens: state.tokens ?? [] };
      });
    }

    try {
      const rows = await this.db
        .select({ workflow: workflowTriggers, poll: pollingTriggers })
        .from(pollingTriggers)
        .innerJoin(workflowTriggers, eq(pollingTriggers.id, workflowTriggers.id))
        .where(
          and(
            eq(workflowTriggers.type, 'polling'),
            eq(workflowTriggers.isActive, true),
            eq(pollingTriggers.isActive, true),
          ),
        );

      return rows.map(({ workflow, poll }) => {
        const metadata = this.normaliseMetadata(poll.metadata as Record<string, any> | null | undefined);
        const dedupeState = this.normaliseDedupeState(workflow.dedupeState as TriggerDedupeState | null | undefined);
        const trigger: PollingTrigger = {
          id: poll.id,
          workflowId: poll.workflowId,
          appId: poll.appId,
          triggerId: poll.triggerId,
          interval: poll.interval,
          lastPoll: poll.lastPoll ? new Date(poll.lastPoll) : undefined,
          nextPoll: poll.nextPoll ? new Date(poll.nextPoll) : new Date(),
          isActive: poll.isActive,
          dedupeKey: poll.dedupeKey ?? undefined,
          metadata,
        };
        return { trigger, dedupeTokens: dedupeState.tokens };
      });
    } catch (error) {
      console.error('❌ Failed to load polling triggers:', getErrorMessage(error));
      return [];
    }
  }

  async updatePollingTriggerState(triggerId: string, lastPoll: Date, nextPoll: Date): Promise<void> {
    if (!this.isDbAvailable()) {
      const existing = this.memoryStore.polling.get(triggerId);
      if (existing) {
        existing.trigger.lastPoll = lastPoll;
        existing.trigger.nextPoll = nextPoll;
      }
      return;
    }

    try {
      await this.db
        .update(pollingTriggers)
        .set({
          lastPoll,
          nextPoll,
          updatedAt: new Date(),
        })
        .where(eq(pollingTriggers.id, triggerId));

      await this.db
        .update(workflowTriggers)
        .set({
          lastRun: lastPoll,
          nextRun: nextPoll,
          updatedAt: new Date(),
        })
        .where(eq(workflowTriggers.id, triggerId));
    } catch (error) {
      console.error('❌ Failed to update polling trigger state:', getErrorMessage(error));
    }
  }

  async deactivateTrigger(triggerId: string): Promise<void> {
    if (!this.isDbAvailable()) {
      const webhook = this.memoryStore.webhooks.get(triggerId);
      if (webhook) {
        webhook.trigger.isActive = false;
      }
      const polling = this.memoryStore.polling.get(triggerId);
      if (polling) {
        polling.trigger.isActive = false;
      }
      return;
    }

    try {
      await this.db
        .update(workflowTriggers)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(workflowTriggers.id, triggerId));

      await this.db
        .update(pollingTriggers)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(pollingTriggers.id, triggerId));
    } catch (error) {
      console.error('❌ Failed to deactivate trigger:', getErrorMessage(error));
    }
  }
}

export const triggerPersistenceService = new TriggerPersistenceService();
export type { PersistedPollingTrigger, PersistedWebhookTrigger };
