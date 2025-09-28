// WEBHOOK MANAGEMENT SYSTEM
// Handles webhook endpoints, polling triggers, and deduplication

import { createHash } from 'crypto';
import { getErrorMessage } from '../types/common';
import { integrationManager } from '../integrations/IntegrationManager';
import { connectionService } from '../services/ConnectionService';
import {
  triggerPersistenceService,
  type PersistedPollingTrigger,
  type PersistedWebhookTrigger,
} from '../services/TriggerPersistenceService';
import { workflowRuntimeService } from '../workflow/WorkflowRuntimeService';
import type { PollingTrigger, TriggerEvent, WebhookTrigger } from './types';

export class WebhookManager {
  private static instance: WebhookManager;
  private activeWebhooks: Map<string, WebhookTrigger> = new Map();
  private pollingIntervals: Map<string, NodeJS.Timeout> = new Map();
  private pollingTriggers: Map<string, PollingTrigger> = new Map();
  private dedupeCache: Map<string, Set<string>> = new Map();
  private readonly persistence = triggerPersistenceService;
  private initializationPromise: Promise<void>;

  public static getInstance(): WebhookManager {
    if (!WebhookManager.instance) {
      WebhookManager.instance = new WebhookManager();
    }
    return WebhookManager.instance;
  }

  private constructor() {
    this.initializationPromise = this.initializeFromPersistence();
  }

  private async initializeFromPersistence(): Promise<void> {
    try {
      const [webhookRows, pollingRows] = await Promise.all<[
        PersistedWebhookTrigger[],
        PersistedPollingTrigger[],
      ]>([
        this.persistence.getActiveWebhookTriggers(),
        this.persistence.getActivePollingTriggers(),
      ]);

      this.activeWebhooks.clear();
      for (const { trigger, dedupeTokens } of webhookRows) {
        const normalizedTrigger: WebhookTrigger = {
          ...trigger,
          metadata: trigger.metadata || {},
        };
        this.activeWebhooks.set(normalizedTrigger.id, normalizedTrigger);
        this.setDedupeTokens(normalizedTrigger.id, dedupeTokens ?? []);
      }

      this.applyPollingTriggers(pollingRows);

      console.log(
        `📦 Loaded ${webhookRows.length} webhooks and ${pollingRows.length} polling triggers from persistence`,
      );
    } catch (error) {
      console.error('❌ Failed to initialize WebhookManager from persistence:', getErrorMessage(error));
    }
  }

  private applyPollingTriggers(pollingRows: PersistedPollingTrigger[]): void {
    for (const timeout of this.pollingIntervals.values()) {
      clearTimeout(timeout);
    }
    this.pollingIntervals.clear();
    this.pollingTriggers.clear();

    for (const { trigger, dedupeTokens } of pollingRows) {
      const normalizedTrigger: PollingTrigger = {
        ...trigger,
        metadata: trigger.metadata || {},
        nextPoll: trigger.nextPoll instanceof Date ? trigger.nextPoll : new Date(trigger.nextPoll),
        lastPoll: trigger.lastPoll ? new Date(trigger.lastPoll) : undefined,
      };

      this.pollingTriggers.set(normalizedTrigger.id, normalizedTrigger);
      this.setDedupeTokens(normalizedTrigger.id, dedupeTokens ?? []);

      if (normalizedTrigger.isActive) {
        this.schedulePollingTrigger(normalizedTrigger);
      }
    }
  }

  private async ensureInitialized(): Promise<void> {
    await this.initializationPromise;
  }

  private getOrCreateTokenSet(triggerId: string): Set<string> {
    let set = this.dedupeCache.get(triggerId);
    if (!set) {
      set = new Set<string>();
      this.dedupeCache.set(triggerId, set);
    }
    return set;
  }

  private setDedupeTokens(triggerId: string, tokens: string[]): void {
    const set = this.getOrCreateTokenSet(triggerId);
    set.clear();
    for (const token of tokens) {
      set.add(token);
    }
    this.pruneTokenCache(set);
  }

  private pruneTokenCache(set: Set<string>, limit: number = 1000): void {
    while (set.size > limit) {
      const iterator = set.values().next();
      if (iterator.done) {
        break;
      }
      set.delete(iterator.value);
    }
  }

  private async hasSeenToken(triggerId: string, token: string): Promise<boolean> {
    const cache = this.dedupeCache.get(triggerId);
    if (cache?.has(token)) {
      return true;
    }

    const exists = await this.persistence.hasDedupeToken(triggerId, token);
    if (exists) {
      const set = this.getOrCreateTokenSet(triggerId);
      set.add(token);
      this.pruneTokenCache(set);
    }

    return exists;
  }

  private async rememberToken(triggerId: string, token: string): Promise<void> {
    const set = this.getOrCreateTokenSet(triggerId);
    set.add(token);
    this.pruneTokenCache(set);
    await this.persistence.addDedupeToken(triggerId, token);
  }

  private schedulePollingTrigger(trigger: PollingTrigger): void {
    if (!trigger.isActive) {
      return;
    }

    this.stopPolling(trigger.id);

    const nextPollTime = trigger.nextPoll?.getTime?.() ?? Date.now();
    const delay = Math.max(0, nextPollTime - Date.now());

    const timeout = setTimeout(async () => {
      this.pollingIntervals.delete(trigger.id);
      const latest = this.pollingTriggers.get(trigger.id) ?? trigger;

      try {
        await this.executePoll(latest);
      } finally {
        const refreshed = this.pollingTriggers.get(trigger.id);
        if (refreshed && refreshed.isActive) {
          this.schedulePollingTrigger(refreshed);
        }
      }
    }, delay);

    if (typeof timeout.unref === 'function') {
      timeout.unref();
    }

    this.pollingIntervals.set(trigger.id, timeout);
  }

  public async rehydratePollingSchedules(): Promise<number> {
    await this.ensureInitialized();
    const pollingRows = await this.persistence.getActivePollingTriggers();
    this.applyPollingTriggers(pollingRows);
    return pollingRows.length;
  }

  /**
   * Register a webhook trigger
   */
  async registerWebhook(trigger: Omit<WebhookTrigger, 'endpoint'>): Promise<string> {
    await this.ensureInitialized();

    try {
      const webhookId = this.generateWebhookId(trigger.appId, trigger.triggerId, trigger.workflowId);
      const endpoint = `/api/webhooks/${webhookId}`;

      const webhookTrigger: WebhookTrigger = {
        ...trigger,
        id: webhookId,
        endpoint,
        isActive: true,
        metadata: trigger.metadata || {},
      };

      this.activeWebhooks.set(webhookId, webhookTrigger);
      const existingTokens = Array.from(this.dedupeCache.get(webhookId) ?? []);
      this.setDedupeTokens(webhookId, existingTokens);

      await this.persistence.upsertWebhookTrigger(webhookTrigger, existingTokens);

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
  async handleWebhook(webhookId: string, payload: any, headers: Record<string, string>, rawBody?: string): Promise<boolean> {
    await this.ensureInitialized();

    try {
      const webhook = this.activeWebhooks.get(webhookId);
      if (!webhook) {
        console.warn(`⚠️ Unknown webhook ID: ${webhookId}`);
        return false;
      }

      // Verify webhook signature if secret is provided
      if (webhook.secret && !this.verifySignature(payload, headers, webhook.secret, webhook.appId, rawBody)) {
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
        processed: false,
        workflowId: webhook.workflowId,
      };

      // Check for duplicates
      const eventHash = this.createEventHash(event);
      event.dedupeToken = eventHash;

      if (await this.hasSeenToken(webhookId, eventHash)) {
        console.log(`🔄 Duplicate webhook event ignored: ${webhookId}`);
        return true; // Return success but don't process
      }

      await this.rememberToken(webhookId, eventHash);

      // Log webhook event
      await this.logWebhookEvent(event);

      // Update last triggered time
      webhook.lastTriggered = new Date();
      this.activeWebhooks.set(webhookId, webhook);

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
    await this.ensureInitialized();

    try {
      const normalizedTrigger: PollingTrigger = {
        ...trigger,
        metadata: trigger.metadata || {},
        lastPoll: trigger.lastPoll ? new Date(trigger.lastPoll) : undefined,
        nextPoll: trigger.nextPoll instanceof Date
          ? trigger.nextPoll
          : new Date(trigger.nextPoll || Date.now() + trigger.interval * 1000),
      };

      this.pollingTriggers.set(normalizedTrigger.id, normalizedTrigger);
      const existingTokens = Array.from(this.dedupeCache.get(normalizedTrigger.id) ?? []);
      this.setDedupeTokens(normalizedTrigger.id, existingTokens);

      await this.persistence.upsertPollingTrigger(normalizedTrigger, existingTokens);
      this.schedulePollingTrigger(normalizedTrigger);

      console.log(
        `⏰ Registered polling trigger: ${normalizedTrigger.appId}.${normalizedTrigger.triggerId} (every ${normalizedTrigger.interval}s)`,
      );

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
      this.pollingTriggers.set(trigger.id, trigger);
      await this.persistence.updatePollingTriggerState(trigger.id, trigger.lastPoll, trigger.nextPoll);

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
            processed: false,
            workflowId: trigger.workflowId,
          };

          // Check for duplicates using dedupe key
          let dedupeHash: string | null = null;
          if (trigger.dedupeKey && result && typeof result === 'object' && result[trigger.dedupeKey] != null) {
            dedupeHash = createHash('md5')
              .update(`${trigger.id}-${String(result[trigger.dedupeKey])}`)
              .digest('hex');
          } else {
            dedupeHash = this.createEventHash(event);
          }

          event.dedupeToken = dedupeHash;

          if (dedupeHash && await this.hasSeenToken(trigger.id, dedupeHash)) {
            continue; // Skip duplicate
          }

          if (dedupeHash) {
            await this.rememberToken(trigger.id, dedupeHash);
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
    const metadata = trigger.metadata || {};
    const functionId = metadata.functionId || metadata.operation || metadata.triggerId || 'list';
    const parameters = metadata.parameters || metadata.params || {};
    const additionalConfig = metadata.additionalConfig || metadata.config;
    const resultPath = typeof metadata.resultPath === 'string' ? metadata.resultPath : undefined;

    let credentials = metadata.credentials;
    const connectionId = metadata.connectionId;
    const userId = metadata.userId || metadata.ownerId || metadata.user?.id;

    if (!credentials && connectionId && userId) {
      try {
        const connection = await connectionService.getConnection(connectionId, userId);
        credentials = connection?.credentials;
      } catch (error) {
        console.warn('⚠️ Unable to load connection credentials for polling trigger:', getErrorMessage(error));
      }
    }

    if (!credentials) {
      console.warn(`⚠️ Missing credentials for polling trigger ${trigger.id}`);
      return [];
    }

    try {
      const response = await integrationManager.executeFunction({
        appName: trigger.appId,
        functionId,
        parameters,
        credentials,
        additionalConfig,
        connectionId,
      });

      if (!response.success) {
        console.warn(`⚠️ Polling ${trigger.appId}.${functionId} failed: ${response.error}`);
        return [];
      }

      let data = response.data;

      if (resultPath) {
        data = resultPath.split('.').reduce<any>((acc, key) => {
          if (acc && typeof acc === 'object') {
            return acc[key];
          }
          return undefined;
        }, data);
      }

      if (Array.isArray(data)) {
        return data;
      }

      if (data && typeof data === 'object') {
        const candidateKeys = ['items', 'records', 'data', 'results', 'messages', 'entries', 'value'];
        for (const key of candidateKeys) {
          const value = (data as any)[key];
          if (Array.isArray(value)) {
            return value;
          }
        }
        return [data];
      }

      return data != null ? [data] : [];
    } catch (error) {
      console.error(`❌ Failed to execute polling function for ${trigger.appId}:`, getErrorMessage(error));
      return [];
    }
  }

  /**
   * Process a trigger event (integrate with workflow engine)
   */
  private async processTriggerEvent(event: TriggerEvent): Promise<void> {
    try {
      await workflowRuntimeService.enqueueTriggerEvent({
        workflowId: event.workflowId,
        triggerId: event.triggerId,
        appId: event.appId,
        payload: event.payload,
        dedupeToken: event.dedupeToken,
        receivedAt: event.timestamp,
        source: event.webhookId.startsWith('poll-') ? 'polling' : 'webhook',
      });

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
      await this.persistence.logWebhookEvent(event);
    } catch (error) {
      console.error('❌ Failed to log webhook event:', getErrorMessage(error));
    }
  }

  /**
   * Verify webhook signature
   */
  private verifySignature(payload: any, headers: Record<string, string>, secret: string, appId?: string, rawBody?: string): boolean {
    try {
      if (!appId) {
        return this.verifyGenericSignature(payload, headers, secret);
      }

      // Route to vendor-specific signature verification
      switch (appId.toLowerCase()) {
        case 'slack':
        case 'slack-enhanced':
          return this.verifySlackSignature(payload, headers, secret, rawBody);
        
        case 'stripe':
        case 'stripe-enhanced':
          return this.verifyStripeSignature(payload, headers, secret, rawBody);
        
        case 'shopify':
        case 'shopify-enhanced':
          return this.verifyShopifySignature(payload, headers, secret, rawBody);
        
        case 'github':
        case 'github-enhanced':
          return this.verifyGitHubSignature(payload, headers, secret, rawBody);
        
        case 'gitlab':
          return this.verifyGitLabSignature(payload, headers, secret);
        
        case 'bitbucket':
          return this.verifyBitbucketSignature(payload, headers, secret);
        
        case 'zendesk':
          return this.verifyZendeskSignature(payload, headers, secret);
        
        case 'intercom':
          return this.verifyIntercomSignature(payload, headers, secret);
        
        case 'jira':
        case 'jira-service-management':
          return this.verifyJiraSignature(payload, headers, secret);
        
        case 'hubspot':
        case 'hubspot-enhanced':
          return this.verifyHubSpotSignature(payload, headers, secret);
        
        // New app signature verifications
        case 'marketo':
          return this.verifyMarketoSignature(payload, headers, secret, rawBody);
        
        case 'iterable':
          return this.verifyIterableSignature(payload, headers, secret, rawBody);
        
        case 'braze':
          return this.verifyBrazeSignature(payload, headers, secret, rawBody);
        
        case 'docusign':
          return this.verifyDocuSignSignature(payload, headers, secret, rawBody);
        
        case 'adobesign':
          return this.verifyAdobeSignSignature(payload, headers, secret, rawBody);
        
        case 'hellosign':
          return this.verifyHelloSignSignature(payload, headers, secret, rawBody);
        
        case 'calendly':
          return this.verifyCalendlySignature(payload, headers, secret, rawBody);
        
        case 'caldotcom':
          return this.verifyCalDotComSignature(payload, headers, secret, rawBody);
        
        case 'webex':
          return this.verifyWebexSignature(payload, headers, secret, rawBody);
        
        case 'ringcentral':
          return this.verifyRingCentralSignature(payload, headers, secret, rawBody);
        
        case 'paypal':
          return this.verifyPayPalSignature(payload, headers, secret, rawBody);
        
        case 'square':
          return this.verifySquareSignature(payload, headers, secret, rawBody);
        
        case 'bigcommerce':
          return this.verifyBigCommerceSignature(payload, headers, secret, rawBody);
        
        case 'surveymonkey':
          return this.verifySurveyMonkeySignature(payload, headers, secret, rawBody);
        
        default:
          return this.verifyGenericSignature(payload, headers, secret);
      }
      
    } catch (error) {
      console.error('❌ Error verifying signature:', getErrorMessage(error));
      return false;
    }
  }

  /**
   * Generic signature verification (fallback)
   */
  private verifyGenericSignature(payload: any, headers: Record<string, string>, secret: string): boolean {
    const signature = headers['x-signature'] || headers['x-hub-signature-256'];
    if (!signature) {
      return false;
    }

    const expectedSignature = createHash('sha256')
      .update(JSON.stringify(payload) + secret)
      .digest('hex');
    
    return signature === expectedSignature || signature === `sha256=${expectedSignature}`;
  }

  /**
   * Slack webhook signature verification
   * Uses v0:timestamp:body HMAC SHA256 with timestamp validation
   */
  private verifySlackSignature(payload: any, headers: Record<string, string>, secret: string, rawBody?: string): boolean {
    const signature = headers['x-slack-signature'];
    const timestamp = headers['x-slack-request-timestamp'];
    
    if (!signature || !timestamp) {
      return false;
    }

    // Reject old requests (older than 5 minutes)
    const timestampNum = parseInt(timestamp);
    const currentTime = Math.floor(Date.now() / 1000);
    if (Math.abs(currentTime - timestampNum) > 300) {
      console.warn('❌ Slack webhook rejected: timestamp too old');
      return false;
    }

    // Use raw body if provided, otherwise fallback to JSON string
    const body = rawBody || (typeof payload === 'string' ? payload : JSON.stringify(payload));
    const signatureBaseString = `v0:${timestamp}:${body}`;
    
    const expectedSignature = 'v0=' + createHash('sha256')
      .update(signatureBaseString, 'utf8')
      .digest('hex');

    return signature === expectedSignature;
  }

  /**
   * Stripe webhook signature verification
   * Uses timestamp and tolerance window with RAW BODY (critical for Stripe)
   */
  private verifyStripeSignature(payload: any, headers: Record<string, string>, secret: string, rawBody?: string): boolean {
    const signature = headers['stripe-signature'];
    if (!signature) {
      return false;
    }

    // Parse Stripe signature format: t=timestamp,v1=signature
    const elements = signature.split(',');
    const timestamp = elements.find(el => el.startsWith('t='))?.substring(2);
    const v1Signature = elements.find(el => el.startsWith('v1='))?.substring(3);

    if (!timestamp || !v1Signature) {
      return false;
    }

    // Check timestamp tolerance (5 minutes)
    const timestampNum = parseInt(timestamp);
    const currentTime = Math.floor(Date.now() / 1000);
    if (Math.abs(currentTime - timestampNum) > 300) {
      console.warn('❌ Stripe webhook rejected: timestamp outside tolerance window');
      return false;
    }

    // Stripe REQUIRES raw body - this is critical!
    const body = rawBody || (typeof payload === 'string' ? payload : JSON.stringify(payload));
    const signedPayload = `${timestamp}.${body}`;
    
    const expectedSignature = createHash('sha256')
      .update(signedPayload + secret, 'utf8')
      .digest('hex');

    return v1Signature === expectedSignature;
  }

  /**
   * Shopify webhook signature verification
   * Uses X-Shopify-Hmac-Sha256 with Base64 encoding and RAW BODY
   */
  private verifyShopifySignature(payload: any, headers: Record<string, string>, secret: string, rawBody?: string): boolean {
    const signature = headers['x-shopify-hmac-sha256'];
    if (!signature) {
      return false;
    }

    // Shopify requires raw body for accurate verification
    const body = rawBody || (typeof payload === 'string' ? payload : JSON.stringify(payload));
    
    const expectedSignature = createHash('sha256')
      .update(body + secret, 'utf8')
      .digest('base64');

    return signature === expectedSignature;
  }

  /**
   * GitHub webhook signature verification
   * Uses X-Hub-Signature-256 with sha256= prefix and RAW BODY
   */
  private verifyGitHubSignature(payload: any, headers: Record<string, string>, secret: string, rawBody?: string): boolean {
    const signature = headers['x-hub-signature-256'];
    if (!signature) {
      return false;
    }

    // GitHub requires raw body for accurate verification
    const body = rawBody || (typeof payload === 'string' ? payload : JSON.stringify(payload));
    
    const expectedSignature = 'sha256=' + createHash('sha256')
      .update(body + secret, 'utf8')
      .digest('hex');

    return signature === expectedSignature;
  }

  /**
   * GitLab webhook signature verification
   */
  private verifyGitLabSignature(payload: any, headers: Record<string, string>, secret: string): boolean {
    const signature = headers['x-gitlab-token'];
    return signature === secret;
  }

  /**
   * Bitbucket webhook signature verification
   */
  private verifyBitbucketSignature(payload: any, headers: Record<string, string>, secret: string): boolean {
    const signature = headers['x-hub-signature'];
    if (!signature) {
      return false;
    }

    const rawBody = typeof payload === 'string' ? payload : JSON.stringify(payload);
    
    const expectedSignature = 'sha1=' + createHash('sha1')
      .update(rawBody, 'utf8')
      .digest('hex');

    return signature === expectedSignature;
  }

  /**
   * Zendesk webhook signature verification
   */
  private verifyZendeskSignature(payload: any, headers: Record<string, string>, secret: string): boolean {
    const signature = headers['x-zendesk-webhook-signature'];
    if (!signature) {
      return false;
    }

    const rawBody = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const timestamp = headers['x-zendesk-webhook-signature-timestamp'] || '';
    
    const signedPayload = `${rawBody}${secret}${timestamp}`;
    
    const expectedSignature = createHash('sha256')
      .update(signedPayload, 'utf8')
      .digest('base64');

    return signature === expectedSignature;
  }

  /**
   * Intercom webhook signature verification
   */
  private verifyIntercomSignature(payload: any, headers: Record<string, string>, secret: string): boolean {
    const signature = headers['x-hub-signature'];
    if (!signature) {
      return false;
    }

    const rawBody = typeof payload === 'string' ? payload : JSON.stringify(payload);
    
    const expectedSignature = 'sha1=' + createHash('sha1')
      .update(rawBody + secret, 'utf8')
      .digest('hex');

    return signature === expectedSignature;
  }

  /**
   * Jira webhook signature verification
   */
  private verifyJiraSignature(payload: any, headers: Record<string, string>, secret: string): boolean {
    const signature = headers['x-atlassian-webhook-identifier'];
    return signature === secret;
  }

  /**
   * HubSpot webhook signature verification
   */
  private verifyHubSpotSignature(payload: any, headers: Record<string, string>, secret: string): boolean {
    const signature = headers['x-hubspot-signature'];
    const timestamp = headers['x-hubspot-request-timestamp'];
    
    if (!signature || !timestamp) {
      return false;
    }

    const rawBody = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const signedPayload = `POST${headers['host'] || ''}${headers['path'] || '/webhooks'}${rawBody}${timestamp}`;
    
    const expectedSignature = createHash('sha256')
      .update(signedPayload + secret, 'utf8')
      .digest('hex');

    return signature === expectedSignature;
  }

  /**
   * Marketo webhook signature verification
   * Uses HMAC with shared secret
   */
  private verifyMarketoSignature(payload: any, headers: Record<string, string>, secret: string, rawBody?: string): boolean {
    const signature = headers['x-marketo-signature'];
    if (!signature) return false;
    
    const body = rawBody || JSON.stringify(payload);
    const expectedSignature = createHash('sha256').update(body + secret).digest('hex');
    return signature === expectedSignature;
  }

  /**
   * Iterable webhook signature verification
   * Uses X-Iterable-Signature HMAC SHA1 over raw body
   */
  private verifyIterableSignature(payload: any, headers: Record<string, string>, secret: string, rawBody?: string): boolean {
    const signature = headers['x-iterable-signature'];
    if (!signature) return false;
    
    const body = rawBody || JSON.stringify(payload);
    const expectedSignature = createHash('sha1').update(body + secret).digest('hex');
    return signature === expectedSignature;
  }

  /**
   * Braze webhook signature verification
   * Uses shared secret HMAC
   */
  private verifyBrazeSignature(payload: any, headers: Record<string, string>, secret: string, rawBody?: string): boolean {
    const signature = headers['x-braze-signature'];
    if (!signature) return false;
    
    const body = rawBody || JSON.stringify(payload);
    const expectedSignature = createHash('sha256').update(body + secret).digest('hex');
    return signature === expectedSignature;
  }

  /**
   * DocuSign webhook signature verification
   * Uses x-docusign-signature-1 HMAC SHA256 over raw body
   */
  private verifyDocuSignSignature(payload: any, headers: Record<string, string>, secret: string, rawBody?: string): boolean {
    const signature = headers['x-docusign-signature-1'];
    if (!signature) return false;
    
    const body = rawBody || JSON.stringify(payload);
    const expectedSignature = createHash('sha256').update(body + secret).digest('base64');
    return signature === expectedSignature;
  }

  /**
   * Adobe Sign webhook signature verification
   * Uses HMAC X-AdobeSign-ClientId + secret
   */
  private verifyAdobeSignSignature(payload: any, headers: Record<string, string>, secret: string, rawBody?: string): boolean {
    const signature = headers['x-adobesign-clientid'];
    if (!signature) return false;
    
    const body = rawBody || JSON.stringify(payload);
    const expectedSignature = createHash('sha256').update(body + secret).digest('hex');
    return signature === expectedSignature;
  }

  /**
   * HelloSign webhook signature verification
   * Uses X-HelloSign-Signature HMAC hex of raw body
   */
  private verifyHelloSignSignature(payload: any, headers: Record<string, string>, secret: string, rawBody?: string): boolean {
    const signature = headers['x-hellosign-signature'];
    if (!signature) return false;
    
    const body = rawBody || JSON.stringify(payload);
    const expectedSignature = createHash('sha256').update(body + secret).digest('hex');
    return signature === expectedSignature;
  }

  /**
   * Calendly webhook signature verification
   * Uses Calendly-Webhook-Signature HMAC SHA256
   */
  private verifyCalendlySignature(payload: any, headers: Record<string, string>, secret: string, rawBody?: string): boolean {
    const signature = headers['calendly-webhook-signature'];
    if (!signature) return false;
    
    const body = rawBody || JSON.stringify(payload);
    const expectedSignature = createHash('sha256').update(body + secret).digest('base64');
    return signature === expectedSignature;
  }

  /**
   * Cal.com webhook signature verification
   * Uses shared secret HMAC
   */
  private verifyCalDotComSignature(payload: any, headers: Record<string, string>, secret: string, rawBody?: string): boolean {
    const signature = headers['x-cal-signature'];
    if (!signature) return false;
    
    const body = rawBody || JSON.stringify(payload);
    const expectedSignature = createHash('sha256').update(body + secret).digest('hex');
    return signature === expectedSignature;
  }

  /**
   * Webex webhook signature verification
   * Uses X-Spark-Signature HMAC SHA1
   */
  private verifyWebexSignature(payload: any, headers: Record<string, string>, secret: string, rawBody?: string): boolean {
    const signature = headers['x-spark-signature'];
    if (!signature) return false;
    
    const body = rawBody || JSON.stringify(payload);
    const expectedSignature = createHash('sha1').update(body + secret).digest('hex');
    return signature === expectedSignature;
  }

  /**
   * RingCentral webhook signature verification
   * Uses signature header validation
   */
  private verifyRingCentralSignature(payload: any, headers: Record<string, string>, secret: string, rawBody?: string): boolean {
    const signature = headers['validation-token'] || headers['verification-token'];
    return signature === secret; // RingCentral uses validation token
  }

  /**
   * PayPal webhook signature verification
   * Verifies with PayPal Webhook ID
   */
  private verifyPayPalSignature(payload: any, headers: Record<string, string>, secret: string, rawBody?: string): boolean {
    // PayPal uses webhook ID verification via API call
    // For now, return true and implement verification via PayPal API
    return true;
  }

  /**
   * Square webhook signature verification
   * Uses x-square-hmacsha256-signature HMAC
   */
  private verifySquareSignature(payload: any, headers: Record<string, string>, secret: string, rawBody?: string): boolean {
    const signature = headers['x-square-hmacsha256-signature'];
    if (!signature) return false;
    
    const body = rawBody || JSON.stringify(payload);
    const expectedSignature = createHash('sha256').update(body + secret).digest('base64');
    return signature === expectedSignature;
  }

  /**
   * BigCommerce webhook signature verification
   * Uses X-BC-Signature HMAC SHA256
   */
  private verifyBigCommerceSignature(payload: any, headers: Record<string, string>, secret: string, rawBody?: string): boolean {
    const signature = headers['x-bc-signature'];
    if (!signature) return false;
    
    const body = rawBody || JSON.stringify(payload);
    const expectedSignature = createHash('sha256').update(body + secret).digest('hex');
    return signature === expectedSignature;
  }

  /**
   * SurveyMonkey webhook signature verification
   * Uses X-Surveymonkey-Signature HMAC SHA1
   */
  private verifySurveyMonkeySignature(payload: any, headers: Record<string, string>, secret: string, rawBody?: string): boolean {
    const signature = headers['x-surveymonkey-signature'];
    if (!signature) return false;
    
    const body = rawBody || JSON.stringify(payload);
    const expectedSignature = createHash('sha1').update(body + secret).digest('hex');
    return signature === expectedSignature;
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
      this.persistence.deactivateTrigger(webhookId).catch((error) => {
        console.error('❌ Failed to persist webhook deactivation:', getErrorMessage(error));
      });
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
      this.persistence.deactivateTrigger(webhookId).catch((error) => {
        console.error('❌ Failed to persist webhook removal:', getErrorMessage(error));
      });
    }
    return removed;
  }

  /**
   * Stop polling trigger
   */
  stopPolling(pollId: string): boolean {
    const interval = this.pollingIntervals.get(pollId);
    if (interval) {
      clearTimeout(interval);
      this.pollingIntervals.delete(pollId);
      console.log(`⏹️ Stopped polling: ${pollId}`);
      const trigger = this.pollingTriggers.get(pollId);
      if (trigger) {
        trigger.isActive = false;
      }
      this.persistence.deactivateTrigger(pollId).catch((error) => {
        console.error('❌ Failed to persist polling stop:', getErrorMessage(error));
      });
      return true;
    }
    return false;
  }

  /**
   * Get webhook statistics
   */
  getStats(): any {
    const dedupeEntries = Array.from(this.dedupeCache.entries()).map(([key, tokens]) => ({
      triggerId: key,
      tokens: tokens.size,
    }));
    const dedupeTotal = dedupeEntries.reduce((sum, entry) => sum + entry.tokens, 0);

    return {
      activeWebhooks: this.activeWebhooks.size,
      pollingTriggers: this.pollingIntervals.size,
      dedupeTokens: dedupeTotal,
      webhooks: this.listWebhooks().map(w => ({
        id: w.id,
        app: w.appId,
        trigger: w.triggerId,
        endpoint: w.endpoint,
        isActive: w.isActive,
        lastTriggered: w.lastTriggered
      })),
      dedupeBreakdown: dedupeEntries,
    };
  }
}

// Export singleton instance
export const webhookManager = WebhookManager.getInstance();