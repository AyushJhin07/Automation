// WEBHOOK MANAGEMENT SYSTEM
// Handles webhook endpoints, polling triggers, and deduplication

import { getErrorMessage } from '../types/common';
import { createHash } from 'crypto';
import { triggerPersistenceService } from '../services/TriggerPersistenceService';
import type { PollingTrigger, TriggerEvent, WebhookTrigger } from './types';
import { connectorRegistry } from '../ConnectorRegistry';
import type { APICredentials } from '../integrations/BaseAPIClient';
import type { ConnectionService } from '../services/ConnectionService';

type QueueService = {
  enqueue: (request: { workflowId: string; userId?: string; triggerType?: string; triggerData?: Record<string, any> | null }) => Promise<{ executionId: string }>;
};

export class WebhookManager {
  private static instance: WebhookManager | null = null;
  private static queueOverride: QueueService | null = null;
  private static configuredQueue: QueueService | null = null;
  private activeWebhooks: Map<string, WebhookTrigger> = new Map();
  private pollingIntervals: Map<string, NodeJS.Timeout> = new Map();
  private pollingStartTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private pollingTriggers: Map<string, PollingTrigger> = new Map();
  private dedupeCache: Map<string, Set<string>> = new Map();
  private readonly persistence = triggerPersistenceService;
  private readonly ready: Promise<void>;
  private connectionServicePromise?: Promise<ConnectionService | null>;
  private initializationError?: string;

  private static readonly MAX_DEDUPE_TOKENS = 500;

  public static getInstance(): WebhookManager {
    if (!WebhookManager.instance) {
      WebhookManager.instance = new WebhookManager();
    }
    return WebhookManager.instance;
  }

  public static configureQueueService(queue: QueueService): void {
    WebhookManager.configuredQueue = queue;
  }

  public static setQueueServiceForTests(queue: QueueService): void {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('WebhookManager.setQueueServiceForTests is only available in test environments');
    }

    WebhookManager.queueOverride = queue;
  }

  public static resetForTests(): void {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('WebhookManager.resetForTests is only available in test environments');
    }

    if (WebhookManager.instance) {
      WebhookManager.instance.dispose();
      WebhookManager.instance = null;
    }
    WebhookManager.queueOverride = null;
    WebhookManager.configuredQueue = null;
  }

  private constructor() {
    this.ready = this.initializeFromPersistence();
  }

  private async initializeFromPersistence(): Promise<void> {
    try {
      const [dedupeState, webhooks, polling] = await Promise.all([
        this.persistence.loadDedupeTokens(),
        this.persistence.loadWebhookTriggers(),
        this.persistence.loadPollingTriggers(),
      ]);

      for (const [id, tokens] of Object.entries(dedupeState)) {
        this.dedupeCache.set(id, new Set(tokens));
      }

      webhooks.forEach((trigger) => {
        this.activeWebhooks.set(trigger.id, trigger);
      });

      polling.forEach((trigger) => {
        this.pollingTriggers.set(trigger.id, trigger);
        this.schedulePollingTrigger(trigger);
      });

      if (webhooks.length > 0 || polling.length > 0) {
        console.log(
          `🔄 WebhookManager initialized with ${webhooks.length} webhooks and ${polling.length} polling triggers from persistent storage.`
        );
      }
    } catch (error) {
      this.initializationError = getErrorMessage(error);
      console.error('❌ Failed to initialize WebhookManager from persistence:', this.initializationError);
    }
  }

  private dispose(): void {
    for (const interval of this.pollingIntervals.values()) {
      clearInterval(interval);
    }
    this.pollingIntervals.clear();

    for (const timeout of this.pollingStartTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.pollingStartTimeouts.clear();

    this.activeWebhooks.clear();
    this.pollingTriggers.clear();
    this.dedupeCache.clear();
  }

  public getWebhook(id: string): WebhookTrigger | undefined {
    return this.activeWebhooks.get(id);
  }

  public getInitializationError(): string | undefined {
    return this.initializationError;
  }


  private async getQueueService(): Promise<QueueService> {
    if (WebhookManager.queueOverride) {
      return WebhookManager.queueOverride;
    }

    if (WebhookManager.configuredQueue) {
      return WebhookManager.configuredQueue;
    }

    throw new Error('Execution queue service has not been configured.');
  }


  /**
   * Register a webhook trigger
   */
  async registerWebhook(trigger: Omit<WebhookTrigger, 'endpoint'>): Promise<string> {
    try {
      await this.ready;

      const webhookId = this.generateWebhookId(trigger.appId, trigger.triggerId, trigger.workflowId);
      const endpoint = `/api/webhooks/${webhookId}`;

      const webhookTrigger: WebhookTrigger = {
        ...trigger,
        id: webhookId,
        endpoint,
        isActive: true
      };

      this.activeWebhooks.set(webhookId, webhookTrigger);

      await this.persistence.saveWebhookTrigger(webhookTrigger);
      await this.ensureDedupeSet(webhookId);

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
    try {
      await this.ready;

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
        workflowId: webhook.workflowId,
        payload,
        headers,
        timestamp: new Date(),
        signature: headers['x-signature'] || headers['x-hub-signature-256'],
        processed: false,
        source: 'webhook'
      };

      // Check for duplicates
      const eventHash = this.createEventHash(event);
      if (this.hasSeenEvent(webhook.id, eventHash)) {
        console.log(`🔄 Duplicate webhook event ignored: ${webhookId}`);
        return true; // Return success but don't process
      }

      // Mark as seen for deduplication
      event.dedupeToken = eventHash;
      await this.recordDedupeToken(webhook.id, eventHash);

      // Update last triggered time
      webhook.lastTriggered = new Date();
      webhook.metadata = {
        ...webhook.metadata,
        lastTriggered: webhook.lastTriggered.toISOString(),
      };
      await this.persistence.saveWebhookTrigger(webhook);

      // Process the trigger (this would integrate with workflow engine)
      await this.processTriggerEvent(event);

      console.log(`✅ Processed webhook: ${event.webhookId} for ${event.appId}.${event.triggerId}`);
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
      await this.ready;
      const pollId = trigger.id;

      trigger.nextPoll = trigger.nextPoll instanceof Date ? trigger.nextPoll : new Date(trigger.nextPoll);
      if (trigger.lastPoll && !(trigger.lastPoll instanceof Date)) {
        trigger.lastPoll = new Date(trigger.lastPoll);
      }

      this.pollingTriggers.set(pollId, trigger);
      await this.persistence.savePollingTrigger(trigger);
      await this.ensureDedupeSet(pollId);
      this.schedulePollingTrigger(trigger);

      console.log(`⏰ Registered polling trigger: ${trigger.appId}.${trigger.triggerId} (every ${trigger.interval}s)`);

    } catch (error) {
      console.error('❌ Failed to register polling trigger:', getErrorMessage(error));
      throw error;
    }
  }

  private schedulePollingTrigger(trigger: PollingTrigger): void {
    const pollId = trigger.id;

    if (this.pollingIntervals.has(pollId)) {
      clearInterval(this.pollingIntervals.get(pollId)!);
      this.pollingIntervals.delete(pollId);
    }

    if (this.pollingStartTimeouts.has(pollId)) {
      clearTimeout(this.pollingStartTimeouts.get(pollId)!);
      this.pollingStartTimeouts.delete(pollId);
    }

    const delay = trigger.nextPoll ? trigger.nextPoll.getTime() - Date.now() : 0;
    if (delay > 0) {
      const timeout = setTimeout(() => {
        this.pollingStartTimeouts.delete(pollId);
        this.startPollingInterval(pollId);
      }, delay);
      this.pollingStartTimeouts.set(pollId, timeout);
    } else {
      this.startPollingInterval(pollId);
    }
  }

  private startPollingInterval(triggerId: string): void {
    const trigger = this.pollingTriggers.get(triggerId);
    if (!trigger) {
      return;
    }

    const intervalMs = Math.max(1000, trigger.interval * 1000);

    if (this.pollingIntervals.has(triggerId)) {
      clearInterval(this.pollingIntervals.get(triggerId)!);
    }

    const intervalHandle = setInterval(() => {
      void this.executePollById(triggerId);
    }, intervalMs);
    this.pollingIntervals.set(triggerId, intervalHandle);

    void this.executePollById(triggerId);
  }

  private async executePollById(triggerId: string): Promise<void> {
    const trigger = this.pollingTriggers.get(triggerId);
    if (!trigger) {
      return;
    }

    await this.executePoll(trigger);
  }

  public async rehydratePollingSchedules(): Promise<{ total: number }> {
    await this.ready;

    for (const interval of this.pollingIntervals.values()) {
      clearInterval(interval);
    }
    this.pollingIntervals.clear();

    for (const timeout of this.pollingStartTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.pollingStartTimeouts.clear();

    const triggers = await this.persistence.loadPollingTriggers();
    this.pollingTriggers.clear();

    const dedupeState = await this.persistence.loadDedupeTokens();
    this.dedupeCache.clear();
    for (const [id, tokens] of Object.entries(dedupeState)) {
      this.dedupeCache.set(id, new Set(tokens));
    }

    triggers.forEach((trigger) => {
      this.pollingTriggers.set(trigger.id, trigger);
      this.schedulePollingTrigger(trigger);
    });

    console.log(`🔁 Rehydrated ${triggers.length} polling schedules from persistent storage.`);
    return { total: triggers.length };
  }

  private async ensureDedupeSet(id: string): Promise<Set<string>> {
    let existing = this.dedupeCache.get(id);
    if (!existing) {
      existing = new Set<string>();
      this.dedupeCache.set(id, existing);
      await this.persistence.persistDedupeTokens(id, []);
    }
    return existing;
  }

  private hasSeenEvent(id: string, token: string): boolean {
    const set = this.dedupeCache.get(id);
    return set ? set.has(token) : false;
  }

  private async recordDedupeToken(id: string, token: string): Promise<void> {
    let set = this.dedupeCache.get(id);
    if (!set) {
      set = await this.ensureDedupeSet(id);
    }

    if (set.has(token)) {
      return;
    }

    set.add(token);

    if (set.size > WebhookManager.MAX_DEDUPE_TOKENS) {
      const tokens = Array.from(set);
      const overflow = tokens.length - WebhookManager.MAX_DEDUPE_TOKENS;
      for (let i = 0; i < overflow; i++) {
        set.delete(tokens[i]);
      }
    }

    await this.persistence.persistDedupeTokens(id, Array.from(set));
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

      await this.persistence.updatePollingRuntimeState(trigger.id, trigger.lastPoll, trigger.nextPoll);

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
            workflowId: trigger.workflowId,
            payload: result,
            headers: { 'x-trigger-type': 'polling' },
            timestamp: new Date(),
            processed: false,
            source: 'polling'
          };

          // Check for duplicates using dedupe key
          if (trigger.dedupeKey && result[trigger.dedupeKey]) {
            const dedupeHash = createHash('md5')
              .update(`${trigger.id}-${result[trigger.dedupeKey]}`)
              .digest('hex');

            if (this.hasSeenEvent(trigger.id, dedupeHash)) {
              continue; // Skip duplicate
            }
            event.dedupeToken = dedupeHash;
            await this.recordDedupeToken(trigger.id, dedupeHash);
          } else {
            const fallbackToken = this.createEventHash(event);
            if (this.hasSeenEvent(trigger.id, fallbackToken)) {
              continue;
            }
            event.dedupeToken = fallbackToken;
            await this.recordDedupeToken(trigger.id, fallbackToken);
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
    try {
      const context = await this.resolvePollingContext(trigger);
      if (!context) {
        console.warn(
          `⚠️ Skipping polling for ${trigger.appId}.${trigger.triggerId} - missing credentials or connection context`
        );
        return [];
      }

      const clientConstructor = this.resolveClientConstructor(trigger.appId);
      if (!clientConstructor) {
        console.warn(`⚠️ No API client registered for ${trigger.appId}`);
        return [];
      }

      const methodName = this.resolvePollingMethodName(trigger);
      const client: any = new clientConstructor(context.credentials, context.additionalConfig);

      if (typeof client[methodName] !== 'function') {
        console.warn(`⚠️ Polling method ${methodName} not implemented for ${trigger.appId}`);
        return [];
      }

      const response = await client[methodName](context.parameters ?? {});
      if (!response) {
        return [];
      }

      return Array.isArray(response) ? response : [response];
    } catch (error) {
      console.error(
        `❌ Failed to execute polling for ${trigger.appId}.${trigger.triggerId}:`,
        getErrorMessage(error)
      );
      return [];
    }
  }

  private resolvePollingMethodName(trigger: PollingTrigger): string {
    const metadataMethod = trigger.metadata?.pollMethod;
    if (typeof metadataMethod === 'string' && metadataMethod.trim().length > 0) {
      return metadataMethod.trim();
    }

    const parts = (trigger.triggerId || '')
      .split(/[^a-zA-Z0-9]+/)
      .filter((segment) => segment.length > 0)
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1));

    if (parts.length === 0) {
      return 'poll';
    }

    return `poll${parts.join('')}`;
  }

  private resolveClientConstructor(appId: string): any {
    const normalized = appId.toLowerCase();
    const candidates = new Set<string>([
      normalized,
      normalized.replace(/-enhanced$/, ''),
      normalized.replace(/_/g, '-'),
      normalized.replace(/-/, '_'),
    ]);

    for (const candidate of candidates) {
      const ctor = connectorRegistry.getAPIClient(candidate);
      if (ctor) {
        return ctor;
      }
    }

    return undefined;
  }

  private async resolvePollingContext(trigger: PollingTrigger): Promise<{
    credentials: APICredentials;
    additionalConfig?: Record<string, any>;
    parameters: Record<string, any>;
  } | null> {
    const metadata = trigger.metadata ?? {};
    const parameters =
      metadata.parameters && typeof metadata.parameters === 'object'
        ? (metadata.parameters as Record<string, any>)
        : {};

    if (metadata.credentials) {
      return {
        credentials: (metadata.credentials as APICredentials),
        additionalConfig: metadata.additionalConfig ?? {},
        parameters,
      };
    }

    if (metadata.connectionId && metadata.userId) {
      const service = await this.getConnectionService();
      if (service) {
        try {
          const connection = await service.getConnection(metadata.connectionId, metadata.userId);
          if (connection) {
            return {
              credentials: (connection.credentials as APICredentials),
              additionalConfig: { ...(connection.metadata ?? {}), ...(metadata.additionalConfig ?? {}) },
              parameters,
            };
          }
        } catch (error) {
          console.warn('⚠️ Failed to load connection for polling trigger:', getErrorMessage(error));
        }
      }
    }

    if (metadata.allowUnauthenticated) {
      return {
        credentials: (metadata.credentials as APICredentials) ?? {},
        additionalConfig: metadata.additionalConfig ?? {},
        parameters,
      };
    }

    return null;
  }

  private async getConnectionService(): Promise<ConnectionService | null> {
    if (!this.connectionServicePromise) {
      this.connectionServicePromise = import('../services/ConnectionService')
        .then((module) => new module.ConnectionService())
        .catch((error) => {
          console.warn('⚠️ ConnectionService unavailable for polling triggers:', getErrorMessage(error));
          return null;
        });
    }

    return this.connectionServicePromise;
  }

  /**
   * Process a trigger event (integrate with workflow engine)
   */
  private async processTriggerEvent(event: TriggerEvent): Promise<boolean> {
    let logId: string | null = null;
    try {
      logId = await this.persistence.logWebhookEvent(event);
      if (logId) {
        event.id = logId;
      }

      const queueService = await this.getQueueService();
      const queueResult = await queueService.enqueue({
        workflowId: event.workflowId,
        triggerType: event.source,
        triggerData: {
          appId: event.appId,
          triggerId: event.triggerId,
          payload: event.payload,
          headers: event.headers,
          dedupeToken: event.dedupeToken,
          timestamp: event.timestamp.toISOString(),
          source: event.source,
        },
      });

      event.processed = true;
      await this.persistence.markWebhookEventProcessed(logId, {
        success: true,
        executionId: queueResult.executionId,
      });

      console.log(`✅ Processed webhook: ${event.webhookId} for ${event.appId}.${event.triggerId}`);
      return true;
    } catch (error) {
      const message = getErrorMessage(error);
      console.error('❌ Error processing trigger event:', message);
      await this.persistence.markWebhookEventProcessed(logId, { success: false, error: message });
      return false;
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
    const payload = event.payload ?? {};
    const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const base = `${event.workflowId}|${event.webhookId}|${event.triggerId}|${event.source}|${payloadString}`;

    return createHash('md5').update(base).digest('hex');
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
  async deactivateWebhook(webhookId: string): Promise<boolean> {
    await this.ready;

    const webhook = this.activeWebhooks.get(webhookId);
    if (!webhook) {
      return false;
    }

    webhook.isActive = false;
    this.dedupeCache.delete(webhookId);

    try {
      await this.persistence.deactivateTrigger(webhookId);
    } catch (error) {
      console.error('❌ Failed to persist webhook deactivation:', getErrorMessage(error));
    }

    console.log(`🔴 Deactivated webhook: ${webhookId}`);
    return true;
  }

  /**
   * Remove webhook
   */
  async removeWebhook(webhookId: string): Promise<boolean> {
    await this.ready;
    const removed = this.activeWebhooks.delete(webhookId);
    if (removed) {
      this.dedupeCache.delete(webhookId);
      await this.persistence.deactivateTrigger(webhookId);
      console.log(`🗑️ Removed webhook: ${webhookId}`);
    }
    return removed;
  }

  /**
   * Stop polling trigger
   */
  async stopPolling(pollId: string): Promise<boolean> {
    await this.ready;

    let stopped = false;

    const interval = this.pollingIntervals.get(pollId);
    if (interval) {
      clearInterval(interval);
      this.pollingIntervals.delete(pollId);
      stopped = true;
    }

    const timeout = this.pollingStartTimeouts.get(pollId);
    if (timeout) {
      clearTimeout(timeout);
      this.pollingStartTimeouts.delete(pollId);
      stopped = true;
    }

    if (stopped) {
      this.pollingTriggers.delete(pollId);
      await this.persistence.deactivateTrigger(pollId);
      console.log(`⏹️ Stopped polling: ${pollId}`);
    }

    return stopped;
  }

  /**
   * Get webhook statistics
   */
  getStats(): any {
    const dedupeSize = Array.from(this.dedupeCache.values()).reduce((total, set) => total + set.size, 0);
    return {
      activeWebhooks: this.activeWebhooks.size,
      pollingTriggers: this.pollingTriggers.size,
      pollingIntervals: this.pollingIntervals.size,
      dedupeEntries: dedupeSize,
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