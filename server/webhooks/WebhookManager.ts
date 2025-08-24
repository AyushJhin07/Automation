// WEBHOOK MANAGEMENT SYSTEM
// Handles webhook endpoints, polling triggers, and deduplication

import { db } from '../database/schema';
import { getErrorMessage } from '../types/common';
import { eq, and, desc, sql } from 'drizzle-orm';
import { webhookLogs, connectorDefinitions } from '../database/schema';
import { createHash } from 'crypto';

export interface WebhookTrigger {
  id: string;
  appId: string;
  triggerId: string;
  workflowId: string;
  endpoint: string;
  secret?: string;
  isActive: boolean;
  lastTriggered?: Date;
  metadata: Record<string, any>;
}

export interface TriggerEvent {
  webhookId: string;
  appId: string;
  triggerId: string;
  payload: any;
  headers: Record<string, string>;
  timestamp: Date;
  signature?: string;
  processed: boolean;
}

export interface PollingTrigger {
  id: string;
  appId: string;
  triggerId: string;
  workflowId: string;
  interval: number; // seconds
  lastPoll?: Date;
  nextPoll: Date;
  isActive: boolean;
  dedupeKey?: string;
  metadata: Record<string, any>;
}

export class WebhookManager {
  private static instance: WebhookManager;
  private activeWebhooks: Map<string, WebhookTrigger> = new Map();
  private pollingIntervals: Map<string, NodeJS.Timeout> = new Map();
  private seenEvents: Set<string> = new Set(); // For deduplication

  public static getInstance(): WebhookManager {
    if (!WebhookManager.instance) {
      WebhookManager.instance = new WebhookManager();
    }
    return WebhookManager.instance;
  }

  /**
   * Register a webhook trigger
   */
  async registerWebhook(trigger: Omit<WebhookTrigger, 'endpoint'>): Promise<string> {
    try {
      const webhookId = this.generateWebhookId(trigger.appId, trigger.triggerId, trigger.workflowId);
      const endpoint = `/api/webhooks/${webhookId}`;
      
      const webhookTrigger: WebhookTrigger = {
        ...trigger,
        id: webhookId,
        endpoint,
        isActive: true
      };

      this.activeWebhooks.set(webhookId, webhookTrigger);
      
      console.log(`🔗 Registered webhook: ${endpoint} for ${trigger.appId}.${trigger.triggerId}`);
      return endpoint;
      
    } catch (error) {
      console.error('❌ Failed to register webhook:', getErrorMessage(error));
      throw error;
    }
  }

  /**
   * Handle incoming webhook request
   */
  async handleWebhook(webhookId: string, payload: any, headers: Record<string, string>): Promise<boolean> {
    try {
      const webhook = this.activeWebhooks.get(webhookId);
      if (!webhook) {
        console.warn(`⚠️ Unknown webhook ID: ${webhookId}`);
        return false;
      }

      // Verify webhook signature if secret is provided
      if (webhook.secret && !this.verifySignature(payload, headers, webhook.secret)) {
        console.warn(`🔒 Invalid webhook signature for ${webhookId}`);
        return false;
      }

      // Create trigger event
      const event: TriggerEvent = {
        webhookId,
        appId: webhook.appId,
        triggerId: webhook.triggerId,
        payload,
        headers,
        timestamp: new Date(),
        signature: headers['x-signature'] || headers['x-hub-signature-256'],
        processed: false
      };

      // Check for duplicates
      const eventHash = this.createEventHash(event);
      if (this.seenEvents.has(eventHash)) {
        console.log(`🔄 Duplicate webhook event ignored: ${webhookId}`);
        return true; // Return success but don't process
      }

      // Mark as seen for deduplication
      this.seenEvents.add(eventHash);
      
      // Clean up old seen events (keep last 1000)
      if (this.seenEvents.size > 1000) {
        const oldEvents = Array.from(this.seenEvents).slice(0, 100);
        oldEvents.forEach(hash => this.seenEvents.delete(hash));
      }

      // Log webhook event
      await this.logWebhookEvent(event);

      // Update last triggered time
      webhook.lastTriggered = new Date();

      // Process the trigger (this would integrate with workflow engine)
      await this.processTriggerEvent(event);

      console.log(`✅ Processed webhook: ${webhookId} for ${webhook.appId}.${webhook.triggerId}`);
      return true;

    } catch (error) {
      console.error(`❌ Error handling webhook ${webhookId}:`, getErrorMessage(error));
      return false;
    }
  }

  /**
   * Register a polling trigger
   */
  async registerPollingTrigger(trigger: PollingTrigger): Promise<void> {
    try {
      const pollId = trigger.id;
      
      // Clear existing interval if any
      if (this.pollingIntervals.has(pollId)) {
        clearInterval(this.pollingIntervals.get(pollId)!);
      }

      // Set up polling interval
      const interval = setInterval(async () => {
        await this.executePoll(trigger);
      }, trigger.interval * 1000);

      this.pollingIntervals.set(pollId, interval);
      
      console.log(`⏰ Registered polling trigger: ${trigger.appId}.${trigger.triggerId} (every ${trigger.interval}s)`);
      
    } catch (error) {
      console.error('❌ Failed to register polling trigger:', getErrorMessage(error));
      throw error;
    }
  }

  /**
   * Execute a polling trigger
   */
  private async executePoll(trigger: PollingTrigger): Promise<void> {
    try {
      if (!trigger.isActive) {
        return;
      }

      console.log(`🔄 Polling ${trigger.appId}.${trigger.triggerId}...`);
      
      // Update poll times
      trigger.lastPoll = new Date();
      trigger.nextPoll = new Date(Date.now() + trigger.interval * 1000);

      // Execute the specific polling logic based on app and trigger
      const results = await this.executeAppSpecificPoll(trigger);
      
      if (results && results.length > 0) {
        console.log(`📊 Poll found ${results.length} new items for ${trigger.appId}.${trigger.triggerId}`);
        
        // Process each result as a trigger event
        for (const result of results) {
          const event: TriggerEvent = {
            webhookId: `poll-${trigger.id}`,
            appId: trigger.appId,
            triggerId: trigger.triggerId,
            payload: result,
            headers: { 'x-trigger-type': 'polling' },
            timestamp: new Date(),
            processed: false
          };

          // Check for duplicates using dedupe key
          if (trigger.dedupeKey && result[trigger.dedupeKey]) {
            const dedupeHash = createHash('md5')
              .update(`${trigger.id}-${result[trigger.dedupeKey]}`)
              .digest('hex');
            
            if (this.seenEvents.has(dedupeHash)) {
              continue; // Skip duplicate
            }
            this.seenEvents.add(dedupeHash);
          }

          await this.processTriggerEvent(event);
        }
      }

    } catch (error) {
      console.error(`❌ Error in polling trigger ${trigger.id}:`, getErrorMessage(error));
    }
  }

  /**
   * Execute app-specific polling logic
   */
  private async executeAppSpecificPoll(trigger: PollingTrigger): Promise<any[]> {
    // This would integrate with the specific API clients
    // For now, return empty array as placeholder
    
    switch (trigger.appId) {
      case 'gmail':
        return await this.pollGmail(trigger);
      case 'slack':
        return await this.pollSlack(trigger);
      case 'shopify':
        return await this.pollShopify(trigger);
      case 'hubspot':
        return await this.pollHubSpot(trigger);
      default:
        console.log(`⚠️ No polling implementation for ${trigger.appId}`);
        return [];
    }
  }

  /**
   * Gmail polling implementation
   */
  private async pollGmail(trigger: PollingTrigger): Promise<any[]> {
    // Placeholder - would integrate with Gmail API
    console.log(`📧 Polling Gmail for ${trigger.triggerId}...`);
    return [];
  }

  /**
   * Slack polling implementation  
   */
  private async pollSlack(trigger: PollingTrigger): Promise<any[]> {
    // Placeholder - would integrate with Slack API
    console.log(`💬 Polling Slack for ${trigger.triggerId}...`);
    return [];
  }

  /**
   * Shopify polling implementation
   */
  private async pollShopify(trigger: PollingTrigger): Promise<any[]> {
    // Placeholder - would integrate with Shopify API  
    console.log(`🛒 Polling Shopify for ${trigger.triggerId}...`);
    return [];
  }

  /**
   * HubSpot polling implementation
   */
  private async pollHubSpot(trigger: PollingTrigger): Promise<any[]> {
    // Placeholder - would integrate with HubSpot API
    console.log(`🎯 Polling HubSpot for ${trigger.triggerId}...`);
    return [];
  }

  /**
   * Process a trigger event (integrate with workflow engine)
   */
  private async processTriggerEvent(event: TriggerEvent): Promise<void> {
    try {
      // This would integrate with the workflow execution engine
      // For now, just log the event
      console.log(`🔥 Trigger event: ${event.appId}.${event.triggerId}`, {
        webhookId: event.webhookId,
        timestamp: event.timestamp,
        payloadSize: JSON.stringify(event.payload).length
      });
      
      // Mark as processed
      event.processed = true;
      
    } catch (error) {
      console.error('❌ Error processing trigger event:', getErrorMessage(error));
    }
  }

  /**
   * Log webhook event to database
   */
  private async logWebhookEvent(event: TriggerEvent): Promise<void> {
    try {
      if (db) {
        await db.insert(webhookLogs).values({
          id: this.generateEventId(),
          webhookId: event.webhookId,
          appId: event.appId,
          triggerId: event.triggerId,
          payload: event.payload,
          headers: event.headers,
          timestamp: event.timestamp,
          signature: event.signature,
          processed: event.processed
        });
      }
    } catch (error) {
      console.error('❌ Failed to log webhook event:', getErrorMessage(error));
    }
  }

  /**
   * Verify webhook signature
   */
  private verifySignature(payload: any, headers: Record<string, string>, secret: string): boolean {
    try {
      const signature = headers['x-signature'] || headers['x-hub-signature-256'];
      if (!signature) {
        return false;
      }

      const expectedSignature = createHash('sha256')
        .update(JSON.stringify(payload) + secret)
        .digest('hex');
      
      return signature === expectedSignature || signature === `sha256=${expectedSignature}`;
      
    } catch (error) {
      console.error('❌ Error verifying signature:', getErrorMessage(error));
      return false;
    }
  }

  /**
   * Create hash for event deduplication
   */
  private createEventHash(event: TriggerEvent): string {
    return createHash('md5')
      .update(`${event.webhookId}-${event.timestamp.getTime()}-${JSON.stringify(event.payload)}`)
      .digest('hex');
  }

  /**
   * Generate webhook ID
   */
  private generateWebhookId(appId: string, triggerId: string, workflowId: string): string {
    return createHash('md5')
      .update(`${appId}-${triggerId}-${workflowId}-${Date.now()}`)
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Generate event ID
   */
  private generateEventId(): string {
    return createHash('md5')
      .update(`${Date.now()}-${Math.random()}`)
      .digest('hex');
  }

  /**
   * Get webhook by ID
   */
  getWebhook(webhookId: string): WebhookTrigger | undefined {
    return this.activeWebhooks.get(webhookId);
  }

  /**
   * List all active webhooks
   */
  listWebhooks(): WebhookTrigger[] {
    return Array.from(this.activeWebhooks.values());
  }

  /**
   * Deactivate webhook
   */
  deactivateWebhook(webhookId: string): boolean {
    const webhook = this.activeWebhooks.get(webhookId);
    if (webhook) {
      webhook.isActive = false;
      console.log(`🔴 Deactivated webhook: ${webhookId}`);
      return true;
    }
    return false;
  }

  /**
   * Remove webhook
   */
  removeWebhook(webhookId: string): boolean {
    const removed = this.activeWebhooks.delete(webhookId);
    if (removed) {
      console.log(`🗑️ Removed webhook: ${webhookId}`);
    }
    return removed;
  }

  /**
   * Stop polling trigger
   */
  stopPolling(pollId: string): boolean {
    const interval = this.pollingIntervals.get(pollId);
    if (interval) {
      clearInterval(interval);
      this.pollingIntervals.delete(pollId);
      console.log(`⏹️ Stopped polling: ${pollId}`);
      return true;
    }
    return false;
  }

  /**
   * Get webhook statistics
   */
  getStats(): any {
    return {
      activeWebhooks: this.activeWebhooks.size,
      pollingTriggers: this.pollingIntervals.size,
      seenEvents: this.seenEvents.size,
      webhooks: this.listWebhooks().map(w => ({
        id: w.id,
        app: w.appId,
        trigger: w.triggerId,
        endpoint: w.endpoint,
        isActive: w.isActive,
        lastTriggered: w.lastTriggered
      }))
    };
  }
}

// Export singleton instance
export const webhookManager = WebhookManager.getInstance();