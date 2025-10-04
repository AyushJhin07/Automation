// WEBHOOK MANAGEMENT SYSTEM
// Handles webhook endpoints, polling triggers, and deduplication

import { getErrorMessage } from '../types/common';
import { createHash } from 'crypto';
import type { OrganizationRegion } from '../database/schema.js';
import { TriggerPersistenceService, triggerPersistenceService } from '../services/TriggerPersistenceService';
import type { PollingTrigger, TriggerEvent, WebhookTrigger } from './types';
import { connectorRegistry } from '../ConnectorRegistry';
import type { APICredentials } from '../integrations/BaseAPIClient';
import type { ConnectionService } from '../services/ConnectionService';
import {
  webhookVerifier,
  WebhookVerificationFailureReason,
  type WebhookVerificationResult,
} from './WebhookVerifier';
import {
  recordCrossRegionViolation,
  recordWebhookDedupeHit,
  recordWebhookDedupeMiss,
} from '../observability/index.js';
import { organizationService } from '../services/OrganizationService.js';

type QueueService = {
  enqueue: (request: {
    workflowId: string;
    userId?: string;
    triggerType?: string;
    triggerData?: Record<string, any> | null;
    organizationId: string;
  }) => Promise<{ executionId: string }>;
};

type SignatureEnforcementConfig = {
  providerId: string;
  required: boolean;
  timestampToleranceSeconds?: number;
  signatureHeader?: string;
  replayWindowSeconds?: number;
};

export class WebhookManager {
  private static instance: WebhookManager | null = null;
  private static queueOverride: QueueService | null = null;
  private static configuredQueue: QueueService | null = null;
  private activeWebhooks: Map<string, WebhookTrigger> = new Map();
  private pollingTriggers: Map<string, PollingTrigger> = new Map();
  private readonly persistence = triggerPersistenceService;
  private readonly ready: Promise<void>;
  private readonly defaultReplayToleranceMs: number;
  private connectionServicePromise?: Promise<ConnectionService | null>;
  private initializationError?: string;
  private readonly workerRegion: OrganizationRegion;
  private readonly regionCache = new Map<string, OrganizationRegion>();
  private readonly supportedRegions: Set<OrganizationRegion> = new Set(['us', 'eu', 'apac']);

  private static readonly MAX_DEDUPE_TOKENS = TriggerPersistenceService.DEFAULT_MAX_DEDUPE_TOKENS;
  private static readonly DEFAULT_REPLAY_TOLERANCE_SECONDS = 15 * 60; // 15 minutes

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
    this.workerRegion = this.resolveRegionFromEnv();
    this.ready = this.initializeFromPersistence();
    this.defaultReplayToleranceMs = this.resolveReplayToleranceMs();
  }

  private normalizePollingTrigger(trigger: PollingTrigger): PollingTrigger {
    const nextPoll = trigger.nextPoll instanceof Date ? trigger.nextPoll : new Date(trigger.nextPoll);
    const nextPollAtSource = trigger.nextPollAt ?? nextPoll;
    const nextPollAt = nextPollAtSource instanceof Date ? nextPollAtSource : new Date(nextPollAtSource);
    return {
      ...trigger,
      nextPoll,
      nextPollAt,
    };
  }

  private async initializeFromPersistence(): Promise<void> {
    try {
      const [webhooks, polling] = await Promise.all([
        this.persistence.loadWebhookTriggers(),
        this.persistence.loadPollingTriggers(),
      ]);

      for (const trigger of webhooks) {
        const region = await this.resolveTriggerRegion(trigger);
        if (region !== this.workerRegion) {
          continue;
        }

        const metadata = {
          ...(trigger.metadata ?? {}),
          region,
        };

        this.activeWebhooks.set(trigger.id, {
          ...trigger,
          region,
          metadata,
        });
      }

      for (const trigger of polling) {
        const region = await this.resolveTriggerRegion(trigger);
        if (region !== this.workerRegion) {
          continue;
        }

        const normalized = this.normalizePollingTrigger({
          ...trigger,
          region,
          metadata: {
            ...(trigger.metadata ?? {}),
            region,
          },
        });

        this.pollingTriggers.set(trigger.id, normalized);
      }

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

  private resolveReplayToleranceMs(): number {
    const envValue = process.env.WEBHOOK_REPLAY_TOLERANCE_SECONDS;
    const parsed = envValue !== undefined ? Number(envValue) : Number.NaN;
    const seconds = Number.isFinite(parsed) && parsed >= 0
      ? parsed
      : WebhookManager.DEFAULT_REPLAY_TOLERANCE_SECONDS;
    return seconds * 1000;
  }

  private resolveRegionFromEnv(): OrganizationRegion {
    const raw = (process.env.DATA_RESIDENCY_REGION ?? 'us').toLowerCase();
    if (this.isSupportedRegion(raw)) {
      return raw as OrganizationRegion;
    }
    if (raw && raw !== 'us') {
      console.warn(
        `⚠️ Unrecognized DATA_RESIDENCY_REGION="${raw}" for WebhookManager. Falling back to "us".`
      );
    }
    return 'us';
  }

  private isSupportedRegion(value: unknown): value is OrganizationRegion {
    return typeof value === 'string' && this.supportedRegions.has(value as OrganizationRegion);
  }

  private async resolveOrganizationRegion(organizationId?: string | null): Promise<OrganizationRegion> {
    if (!organizationId) {
      return this.workerRegion;
    }

    const cached = this.regionCache.get(organizationId);
    if (cached) {
      return cached;
    }

    try {
      const region = await organizationService.getOrganizationRegion(organizationId);
      this.regionCache.set(organizationId, region);
      return region;
    } catch (error) {
      console.warn(
        `⚠️ Failed to resolve region for organization ${organizationId}: ${getErrorMessage(error)}. Falling back to worker region ${this.workerRegion}.`
      );
      return this.workerRegion;
    }
  }

  private async resolveTriggerRegion(trigger: {
    organizationId?: string;
    region?: OrganizationRegion;
    metadata?: Record<string, any>;
  }): Promise<OrganizationRegion> {
    const explicit = trigger.region ?? (trigger.metadata?.region as OrganizationRegion | undefined);
    if (explicit && this.isSupportedRegion(explicit)) {
      return explicit;
    }

    const organizationId = trigger.organizationId ?? (trigger.metadata?.organizationId as string | undefined) ?? null;
    return this.resolveOrganizationRegion(organizationId);
  }

  private parseTimestampValue(value: unknown): Date | null {
    if (value === undefined || value === null) {
      return null;
    }

    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }

    if (typeof value === 'number') {
      const millis = value > 1e12 ? value : value * 1000;
      const date = new Date(millis);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length === 0) {
        return null;
      }

      const numeric = Number(trimmed);
      if (Number.isFinite(numeric)) {
        const millis = numeric > 1e12 ? numeric : numeric * 1000;
        const date = new Date(millis);
        if (!Number.isNaN(date.getTime())) {
          return date;
        }
      }

      const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private lookupSignatureEnforcement(appId: string, triggerId: string): SignatureEnforcementConfig | null {
    try {
      const definition = connectorRegistry.getConnectorDefinition(appId);
      if (!definition) {
        return null;
      }

      const triggerDef = definition.triggers?.find((item) => item.id === triggerId);
      if (!triggerDef) {
        return null;
      }

      const metadata = (triggerDef as any).metadata;
      if (!metadata || typeof metadata !== 'object') {
        return null;
      }

      const signatureConfig = (metadata as any).signatureVerification;
      if (!signatureConfig || typeof signatureConfig.providerId !== 'string') {
        return null;
      }

      const replayWindow = Number.isFinite(metadata.replayWindowSeconds)
        ? Number(metadata.replayWindowSeconds)
        : Number.isFinite(signatureConfig.replayWindowSeconds)
        ? Number(signatureConfig.replayWindowSeconds)
        : undefined;

      return {
        providerId: signatureConfig.providerId,
        required: signatureConfig.required !== false,
        timestampToleranceSeconds: Number.isFinite(signatureConfig.timestampToleranceSeconds)
          ? Number(signatureConfig.timestampToleranceSeconds)
          : undefined,
        signatureHeader: typeof signatureConfig.signatureHeader === 'string'
          ? signatureConfig.signatureHeader
          : undefined,
        replayWindowSeconds: replayWindow,
      };
    } catch (error) {
      console.warn(
        `⚠️ Failed to resolve signature enforcement for ${appId}.${triggerId}:`,
        getErrorMessage(error)
      );
      return null;
    }
  }

  private resolveStoredSignatureConfig(webhook: WebhookTrigger): SignatureEnforcementConfig | null {
    const metadata = webhook.metadata as Record<string, any> | undefined;
    const stored = metadata?.signatureVerification;
    if (stored && typeof stored.providerId === 'string') {
      return {
        providerId: stored.providerId,
        required: stored.required !== false,
        timestampToleranceSeconds: Number.isFinite(stored.timestampToleranceSeconds)
          ? Number(stored.timestampToleranceSeconds)
          : undefined,
        signatureHeader: typeof stored.signatureHeader === 'string' ? stored.signatureHeader : undefined,
        replayWindowSeconds: Number.isFinite(stored.replayWindowSeconds)
          ? Number(stored.replayWindowSeconds)
          : undefined,
      };
    }
    return null;
  }

  private resolveSignatureConfig(webhook: WebhookTrigger): SignatureEnforcementConfig | null {
    return this.resolveStoredSignatureConfig(webhook) ?? this.lookupSignatureEnforcement(webhook.appId, webhook.triggerId);
  }

  private resolveReplayWindowSeconds(
    webhook: WebhookTrigger,
    signatureConfig: SignatureEnforcementConfig | null | undefined
  ): number {
    const metadata = (webhook.metadata ?? {}) as Record<string, any>;
    const adminOverride = metadata?.replayWindowSecondsOverride ?? metadata?.adminReplayWindowSeconds;
    const adminValue = Number(adminOverride);
    if (Number.isFinite(adminValue) && adminValue >= 0) {
      return adminValue;
    }

    const metadataValue = Number(metadata?.replayWindowSeconds);
    if (Number.isFinite(metadataValue) && metadataValue >= 0) {
      return metadataValue;
    }

    if (signatureConfig?.replayWindowSeconds !== undefined && signatureConfig.replayWindowSeconds >= 0) {
      return signatureConfig.replayWindowSeconds;
    }

    if (signatureConfig?.timestampToleranceSeconds !== undefined && signatureConfig.timestampToleranceSeconds >= 0) {
      return signatureConfig.timestampToleranceSeconds;
    }

    return Math.floor(this.defaultReplayToleranceMs / 1000);
  }

  private resolvePollingReplayWindowSeconds(trigger: PollingTrigger): number {
    const metadata = (trigger.metadata ?? {}) as Record<string, any>;
    const override = metadata?.replayWindowSecondsOverride ?? metadata?.adminReplayWindowSeconds;
    const overrideValue = Number(override);
    if (Number.isFinite(overrideValue) && overrideValue >= 0) {
      return overrideValue;
    }

    const configured = Number(metadata?.replayWindowSeconds);
    if (Number.isFinite(configured) && configured >= 0) {
      return configured;
    }

    return Math.floor(this.defaultReplayToleranceMs / 1000);
  }

  private resolveProviderId(webhook: WebhookTrigger, signatureConfig: SignatureEnforcementConfig | null | undefined): string {
    return signatureConfig?.providerId ?? webhook.appId ?? 'default';
  }

  private resolvePollingProviderId(trigger: PollingTrigger): string {
    return trigger.appId ?? 'polling';
  }

  private getHeaderValue(headers: Record<string, string>, headerName?: string): string | undefined {
    if (!headerName) {
      return undefined;
    }
    const target = headerName.toLowerCase();
    for (const [name, value] of Object.entries(headers ?? {})) {
      if (typeof value === 'string' && name.toLowerCase() === target) {
        return value;
      }
    }
    return undefined;
  }

  private resolveVerificationProvider(webhook: WebhookTrigger, config: SignatureEnforcementConfig | null): string | null {
    if (config?.providerId) {
      return config.providerId;
    }
    if (webhook.secret) {
      if (webhookVerifier.hasProvider(webhook.appId)) {
        return webhook.appId;
      }
      return 'generic_hmac';
    }
    return null;
  }

  private async ensureSignatureVerified(
    webhook: WebhookTrigger,
    event: TriggerEvent,
    headers: Record<string, string>,
    rawBody: string | undefined,
    config: SignatureEnforcementConfig | null
  ): Promise<boolean> {
    const providerId = this.resolveVerificationProvider(webhook, config);
    if (!providerId) {
      return true;
    }

    const secret = webhook.secret ?? '';
    const isRequired = config ? config.required !== false : secret.length > 0;

    if (!secret) {
      if (!isRequired) {
        return true;
      }

      const failureResult: WebhookVerificationResult = {
        isValid: false,
        provider: providerId,
        failureReason: WebhookVerificationFailureReason.MISSING_SECRET,
        message: 'Webhook secret missing for signature verification',
        signatureHeader: config?.signatureHeader,
      };
      await this.recordVerificationFailure(event, failureResult);
      console.warn(`🔒 Missing webhook secret for ${webhook.id}; rejecting event`);
      return false;
    }

    const verificationResult = await webhookVerifier.verifyWebhook(providerId, {
      headers,
      payload: event.payload,
      rawBody,
      secret,
      toleranceSecondsOverride: config?.timestampToleranceSeconds,
    });

    if (!verificationResult.isValid) {
      if (verificationResult.providedSignature) {
        event.signature = verificationResult.providedSignature;
      }
      await this.recordVerificationFailure(event, verificationResult);
      console.warn(
        `🔒 Invalid webhook signature for ${webhook.id}:`,
        verificationResult.message ?? verificationResult.failureReason ?? 'unknown reason'
      );
      return false;
    }

    if (verificationResult.providedSignature) {
      event.signature = verificationResult.providedSignature;
    }

    return true;
  }

  private async recordVerificationFailure(event: TriggerEvent, result: WebhookVerificationResult): Promise<void> {
    const message = result.message ?? `Webhook signature verification failed (${result.failureReason ?? 'unknown'})`;
    const logId = await this.persistence.logWebhookEvent(event);
    if (logId) {
      event.id = logId;
    }
    await this.persistence.markWebhookEventProcessed(logId, {
      success: false,
      error: message,
      region: event.region ?? this.workerRegion,
    });
  }

    return null;
  }

  private resolveEventTimestamp(headers: Record<string, string>, payload: any): Date | null {
    const lowerCaseHeaders: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(headers)) {
      lowerCaseHeaders[key.toLowerCase()] = value;
    }

    const headerKeys = [
      'x-webhook-timestamp',
      'x-signature-timestamp',
      'x-request-timestamp',
      'x-slack-request-timestamp',
      'x-timestamp',
    ];

    for (const key of headerKeys) {
      const candidate = headers[key] ?? lowerCaseHeaders[key];
      const parsed = this.parseTimestampValue(candidate);
      if (parsed) {
        return parsed;
      }
    }

    if (payload && typeof payload === 'object') {
      const payloadCandidates = [
        (payload as any).timestamp,
        (payload as any).eventTimestamp,
        (payload as any).event_timestamp,
        (payload as any).eventTime,
        (payload as any).event_time,
      ];

      for (const candidate of payloadCandidates) {
        const parsed = this.parseTimestampValue(candidate);
        if (parsed) {
          return parsed;
        }
      }
    }

    return null;
  }

  private isTimestampWithinTolerance(timestamp: Date, toleranceMs: number): boolean {
    if (!(timestamp instanceof Date) || Number.isNaN(timestamp.getTime())) {
      return true;
    }

    if (toleranceMs <= 0) {
      return true;
    }

    const delta = Math.abs(Date.now() - timestamp.getTime());
    return delta <= toleranceMs;
  }

  private dispose(): void {
    this.activeWebhooks.clear();
    this.pollingTriggers.clear();
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

      const normalizedMetadata = { ...(trigger.metadata ?? {}) };
      if (!normalizedMetadata.signatureVerification) {
        const signatureConfig = this.lookupSignatureEnforcement(trigger.appId, trigger.triggerId);
        if (signatureConfig) {
          normalizedMetadata.signatureVerification = signatureConfig;
        }
      }
      if (trigger.organizationId && !normalizedMetadata.organizationId) {
        normalizedMetadata.organizationId = trigger.organizationId;
      }
      if (trigger.userId && !normalizedMetadata.userId) {
        normalizedMetadata.userId = trigger.userId;
      }

      const region = await this.resolveTriggerRegion(trigger);
      normalizedMetadata.region = region;

      const webhookTrigger: WebhookTrigger = {
        ...trigger,
        metadata: normalizedMetadata,
        id: webhookId,
        endpoint,
        isActive: true,
        region,
      };

      this.activeWebhooks.set(webhookId, webhookTrigger);

      await this.persistence.saveWebhookTrigger(webhookTrigger);

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

      const signatureConfig = this.resolveSignatureConfig(webhook);

      const organizationId =
        (webhook.metadata && (webhook.metadata as any).organizationId) ||
        webhook.organizationId;

      if (!organizationId) {
        console.warn(`⚠️ Missing organization context for webhook ${webhookId}`);
        return false;
      }

      const triggerRegion = await this.resolveTriggerRegion({
        organizationId,
        region: webhook.region,
        metadata: webhook.metadata,
      });

      if (triggerRegion !== this.workerRegion) {
        console.log(
          `🌐 Skipping webhook ${webhookId} because its region ${triggerRegion} does not match worker region ${this.workerRegion}.`
        );
        return false;
      }

      const userId =
        (webhook.metadata && (webhook.metadata as any).userId) ||
        webhook.userId;

      const timestamp = this.resolveEventTimestamp(headers, payload) ?? new Date();

      const event: TriggerEvent = {
        webhookId,
        appId: webhook.appId,
        triggerId: webhook.triggerId,
        workflowId: webhook.workflowId,
        payload,
        headers,
        timestamp,
        signature: undefined,
        processed: false,
        source: 'webhook',
        organizationId,
        userId,
        region: triggerRegion,
      };

      const defaultSignature =
        this.getHeaderValue(headers, signatureConfig?.signatureHeader) ||
        this.getHeaderValue(headers, 'x-signature') ||
        this.getHeaderValue(headers, 'x-hub-signature-256') ||
        this.getHeaderValue(headers, 'stripe-signature');
      if (defaultSignature) {
        event.signature = defaultSignature;
      }

      const verified = await this.ensureSignatureVerified(
        webhook,
        event,
        headers,
        rawBody,
        signatureConfig
      );

      if (!verified) {
        return false;
      }

      const replayWindowSeconds = this.resolveReplayWindowSeconds(webhook, signatureConfig);
      const toleranceMs = replayWindowSeconds * 1000;

      if (!this.isTimestampWithinTolerance(event.timestamp, toleranceMs)) {
        console.warn(
          `⚠️ Webhook event rejected: timestamp outside tolerance window (webhook=${webhookId})`
        );
        return false;
      }

      // Apply simple filters if configured in trigger metadata
      const filters = (webhook.metadata && (webhook.metadata as any).filters) as Record<string, any> | undefined;
      if (filters && typeof filters === 'object') {
        const pass = this.applyFilters(filters, payload);
        if (!pass) {
          console.log(`🪄 Webhook filtered out for ${webhook.appId}.${webhook.triggerId}`);
          return true; // treat as success but drop
        }
      }

      const providerId = this.resolveProviderId(webhook, signatureConfig);
      const eventHash = this.createEventHash(event);
      event.dedupeToken = eventHash;

      const logId = await this.persistence.logWebhookEvent(event);
      if (logId) {
        event.id = logId;
      }

      const dedupeResult = await this.persistence.recordWebhookDedupeEntry({
        webhookId: webhook.id,
        providerId,
        token: eventHash,
        ttlMs: toleranceMs,
        createdAt: event.timestamp,
        region: event.region ?? this.workerRegion,
      });

      if (dedupeResult === 'duplicate') {
        const message = `duplicate event within ${replayWindowSeconds}s window`;
        console.log(`🔄 Duplicate webhook event ignored: ${webhookId}`);
        await this.persistence.markWebhookEventProcessed(logId, {
          success: false,
          error: message,
          duplicate: true,
          dropReason: message,
          region: event.region ?? this.workerRegion,
        });
        recordWebhookDedupeHit({
          provider_id: providerId,
          app_id: webhook.appId,
          trigger_id: webhook.triggerId,
          source: 'webhook',
        });
        return true;
      }

      recordWebhookDedupeMiss({
        provider_id: providerId,
        app_id: webhook.appId,
        trigger_id: webhook.triggerId,
        source: 'webhook',
      });

      // Update last triggered time
      webhook.lastTriggered = new Date();
      webhook.metadata = {
        ...webhook.metadata,
        lastTriggered: webhook.lastTriggered.toISOString(),
      };
      await this.persistence.saveWebhookTrigger(webhook);

      // Process the trigger (this would integrate with workflow engine)
      await this.processTriggerEvent(event, { toleranceMs, logId });

      console.log(`✅ Processed webhook: ${event.webhookId} for ${event.appId}.${event.triggerId}`);
      return true;

    } catch (error) {
      console.error(`❌ Error handling webhook ${webhookId}:`, getErrorMessage(error));
      return false;
    }
  }

  private applyFilters(filters: Record<string, any>, payload: any): boolean {
    try {
      // Support simple equals and contains for top-level paths using dot notation
      const getVal = (path: string) => path.split('.').reduce((acc: any, key: string) => (acc ? acc[key] : undefined), payload);
      for (const [k, v] of Object.entries(filters)) {
        const val = getVal(k);
        if (v && typeof v === 'object' && v.contains !== undefined) {
          const needle = String(v.contains).toLowerCase();
          const hay = String(val ?? '').toLowerCase();
          if (!hay.includes(needle)) return false;
        } else {
          if (String(val) !== String(v)) return false;
        }
      }
      return true;
    } catch {
      return true; // fail-open to avoid blocking events
    }
  }

  /**
   * Register a polling trigger
   */
  async registerPollingTrigger(trigger: PollingTrigger): Promise<void> {
    try {
      await this.ready;
      const pollId = trigger.id;

      const region = await this.resolveTriggerRegion(trigger);
      const normalized = this.normalizePollingTrigger({
        ...trigger,
        region,
        metadata: {
          ...(trigger.metadata ?? {}),
          region,
        },
      });
      if (normalized.lastPoll && !(normalized.lastPoll instanceof Date)) {
        normalized.lastPoll = new Date(normalized.lastPoll);
      }

      normalized.nextPollAt = normalized.nextPollAt ?? normalized.nextPoll;
      normalized.nextPoll = normalized.nextPoll ?? normalized.nextPollAt;

      await this.persistence.savePollingTrigger(normalized);

      if (region === this.workerRegion) {
        this.pollingTriggers.set(pollId, normalized);
        console.log(`⏰ Registered polling trigger: ${trigger.appId}.${trigger.triggerId} (every ${trigger.interval}s)`);
      } else {
        console.log(
          `🌐 Registered polling trigger ${trigger.appId}.${trigger.triggerId} for region ${region}; worker region is ${this.workerRegion}, skipping local scheduling.`
        );
      }

    } catch (error) {
      console.error('❌ Failed to register polling trigger:', getErrorMessage(error));
      throw error;
    }
  }

  public async runPollingTrigger(trigger: PollingTrigger): Promise<void> {
    await this.ready;

    const region = await this.resolveTriggerRegion(trigger);
    if (region !== this.workerRegion) {
      return;
    }

    const normalized = this.normalizePollingTrigger({
      ...trigger,
      region,
      metadata: {
        ...(trigger.metadata ?? {}),
        region,
      },
    });
    this.pollingTriggers.set(normalized.id, normalized);

    await this.executePoll(normalized);
  }

  public async runPollingTriggerById(triggerId: string): Promise<void> {
    await this.ready;
    const trigger = this.pollingTriggers.get(triggerId);
    if (!trigger) {
      console.warn(`⚠️ Attempted to run unknown polling trigger ${triggerId}`);
      return;
    }

    if (trigger.region && trigger.region !== this.workerRegion) {
      return;
    }

    await this.executePoll(trigger);
  }

  public async rehydratePollingSchedules(): Promise<{ total: number }> {
    await this.ready;

    const triggers = await this.persistence.loadPollingTriggers();
    this.pollingTriggers.clear();

    triggers.forEach((trigger) => {
      const normalized = this.normalizePollingTrigger(trigger);
      this.pollingTriggers.set(trigger.id, normalized);
    });

    console.log(`🔁 Rehydrated ${triggers.length} polling triggers from persistent storage.`);
    return { total: triggers.length };
  }

  /**
   * Execute a polling trigger
   */
  private async executePoll(trigger: PollingTrigger): Promise<void> {
    try {
      if (!trigger.isActive) {
        return;
      }

      const metadataRegion = trigger.metadata?.region as OrganizationRegion | undefined;
      const resolvedRegion = trigger.region ?? metadataRegion ?? (await this.resolveTriggerRegion(trigger));
      if (resolvedRegion !== this.workerRegion) {
        return;
      }

      trigger.region = resolvedRegion;
      trigger.metadata = {
        ...(trigger.metadata ?? {}),
        region: resolvedRegion,
      };

      console.log(`🔄 Polling ${trigger.appId}.${trigger.triggerId}...`);

      // Update poll times
      const now = new Date();
      trigger.lastPoll = now;
      const scheduledNext = trigger.nextPollAt ?? trigger.nextPoll ?? new Date(now.getTime() + trigger.interval * 1000);
      const scheduledDate = scheduledNext instanceof Date ? scheduledNext : new Date(scheduledNext);
      const computedNext = new Date(Math.max(scheduledDate.getTime(), now.getTime() + Math.max(1, trigger.interval) * 1000));
      trigger.nextPoll = computedNext;
      trigger.nextPollAt = computedNext;

      await this.persistence.updatePollingRuntimeState(trigger.id, {
        lastPoll: trigger.lastPoll,
        nextPollAt: trigger.nextPollAt,
        region: trigger.region,
      });

      // Execute the specific polling logic based on app and trigger
      const results = await this.executeAppSpecificPoll(trigger);

      if (results && results.length > 0) {
        console.log(`📊 Poll found ${results.length} new items for ${trigger.appId}.${trigger.triggerId}`);

        // Process each result as a trigger event
        for (const result of results) {
          const organizationId =
            (trigger.metadata && (trigger.metadata as any).organizationId) ||
            trigger.organizationId;
          if (!organizationId) {
            console.warn(`⚠️ Missing organization context for polling trigger ${trigger.id}`);
            continue;
          }

          const userId =
            (trigger.metadata && (trigger.metadata as any).userId) ||
            trigger.userId;

          const event: TriggerEvent = {
            webhookId: `poll-${trigger.id}`,
            appId: trigger.appId,
            triggerId: trigger.triggerId,
            workflowId: trigger.workflowId,
            payload: result,
            headers: { 'x-trigger-type': 'polling' },
            timestamp: new Date(),
            processed: false,
            source: 'polling',
            organizationId,
            userId,
            region: trigger.region ?? this.workerRegion,
          };

          const replayWindowSeconds = this.resolvePollingReplayWindowSeconds(trigger);
          const toleranceMs = replayWindowSeconds * 1000;
          const providerId = this.resolvePollingProviderId(trigger);

          const dedupeToken = trigger.dedupeKey && result[trigger.dedupeKey]
            ? createHash('md5').update(`${trigger.id}-${result[trigger.dedupeKey]}`).digest('hex')
            : this.createEventHash(event);

          event.dedupeToken = dedupeToken;

          const dedupeResult = await this.persistence.recordWebhookDedupeEntry({
            webhookId: trigger.id,
            providerId,
            token: dedupeToken,
            ttlMs: toleranceMs,
            createdAt: event.timestamp,
          });

          if (dedupeResult === 'duplicate') {
            recordWebhookDedupeHit({
              provider_id: providerId,
              app_id: trigger.appId,
              trigger_id: trigger.triggerId,
              source: 'polling',
            });
            continue;
          }

          recordWebhookDedupeMiss({
            provider_id: providerId,
            app_id: trigger.appId,
            trigger_id: trigger.triggerId,
            source: 'polling',
          });

          await this.processTriggerEvent(event, { toleranceMs });
        }
      }

      // Persist last poll time (enables since-based filtering by downstream)
      this.pollingTriggers.set(trigger.id, { ...trigger });
      await this.persistence.savePollingTrigger(trigger);

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
      const methodName = this.resolvePollingMethodName(trigger);

      // Enrich parameters with since timestamp when available
      const baseParams = (context.parameters ?? {}) as Record<string, any>;
      const since = trigger.lastPoll ? new Date(trigger.lastPoll).toISOString() : undefined;
      const enrichedParams = since && baseParams.since === undefined
        ? { ...baseParams, since }
        : baseParams;

      if (clientConstructor) {
        const client: any = new clientConstructor(context.credentials, context.additionalConfig);
        if (typeof client[methodName] === 'function') {
          const response = await client[methodName](enrichedParams);
          if (!response) return [];
          return Array.isArray(response) ? response : [response];
        }
        console.warn(`⚠️ Polling method ${methodName} not implemented for ${trigger.appId}`);
      } else {
        console.warn(`⚠️ No API client registered for ${trigger.appId}`);
      }

      // Fallback: generic executor for JSON-defined triggers (feature-flag driven)
      try {
        const { env } = await import('../env.js');
        if (env.GENERIC_EXECUTOR_ENABLED) {
          const { genericExecutor } = await import('../integrations/GenericExecutor.js');
          const generic = await genericExecutor.execute({
            appId: trigger.appId,
            functionId: trigger.triggerId,
            parameters: enrichedParams,
            credentials: context.credentials,
          });
          if (generic.success) {
            const data = generic.data;
            if (Array.isArray(data)) return data;
            if (data && Array.isArray(data.items)) return data.items;
            return data ? [data] : [];
          } else {
            console.warn(`⚠️ Generic polling failed for ${trigger.appId}.${trigger.triggerId}: ${generic.error}`);
          }
        }
      } catch (err) {
        console.warn('⚠️ Generic polling path unavailable:', (err as any)?.message || String(err));
      }

      return [];
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
          const organizationId = (metadata as any).organizationId;
          if (!organizationId) {
            console.warn('⚠️ Missing organizationId for polling trigger connection resolution');
          } else {
            const connection = await service.getConnection(
              metadata.connectionId,
              metadata.userId,
              organizationId
            );
            if (connection) {
              return {
                credentials: (connection.credentials as APICredentials),
                additionalConfig: { ...(connection.metadata ?? {}), ...(metadata.additionalConfig ?? {}) },
                parameters,
              };
            }
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
  private async processTriggerEvent(
    event: TriggerEvent,
    options: { toleranceMs: number; logId?: string }
  ): Promise<boolean> {
    let logId: string | null = options.logId ?? null;
    try {
      if (!logId) {
        logId = await this.persistence.logWebhookEvent(event);
        if (logId) {
          event.id = logId;
        }
      }

      if (!event.organizationId) {
        console.warn('⚠️ Trigger event missing organization context; skipping');
        return false;
      }

      if (event.region && event.region !== this.workerRegion) {
        recordCrossRegionViolation({
          subsystem: 'webhook-worker',
          expectedRegion: this.workerRegion,
          actualRegion: event.region,
          identifier: event.webhookId,
        });
        const message = `event region ${event.region} does not match worker region ${this.workerRegion}`;
        console.log(`🌐 Skipping trigger event ${event.webhookId} because ${message}`);
        await this.persistence.markWebhookEventProcessed(logId, {
          success: false,
          error: message,
          region: event.region,
        });
        return false;
      }

      if (!this.isTimestampWithinTolerance(event.timestamp, options.toleranceMs)) {
        const toleranceSeconds = Math.floor(options.toleranceMs / 1000);
        const message = `timestamp outside replay tolerance (${toleranceSeconds}s)`;
        console.warn(`⚠️ Trigger event rejected due to ${message}`);
        await this.persistence.markWebhookEventProcessed(logId, {
          success: false,
          error: message,
          region: event.region ?? this.workerRegion,
        });
        return false;
      }

      const queueService = await this.getQueueService();
      const queueResult = await queueService.enqueue({
        workflowId: event.workflowId,
        userId: event.userId,
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
        organizationId: event.organizationId,
      });

      event.processed = true;
      await this.persistence.markWebhookEventProcessed(logId, {
        success: true,
        executionId: queueResult.executionId,
        region: event.region ?? this.workerRegion,
      });

      console.log(`✅ Processed webhook: ${event.webhookId} for ${event.appId}.${event.triggerId}`);
      return true;
    } catch (error) {
      const message = getErrorMessage(error);
      console.error('❌ Error processing trigger event:', message);
      await this.persistence.markWebhookEventProcessed(logId, {
        success: false,
        error: message,
        region: event.region ?? this.workerRegion,
      });
      return false;
    }
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

    try {
      await this.persistence.deactivateTrigger(webhookId, webhook.region);
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
    const webhook = this.activeWebhooks.get(webhookId);
    const removed = this.activeWebhooks.delete(webhookId);
    if (removed) {
      await this.persistence.deactivateTrigger(webhookId, webhook?.region);
      console.log(`🗑️ Removed webhook: ${webhookId}`);
    }
    return removed;
  }

  /**
   * Stop polling trigger
   */
  async stopPolling(pollId: string): Promise<boolean> {
    await this.ready;

    const trigger = this.pollingTriggers.get(pollId);
    if (!trigger) {
      return false;
    }

    this.pollingTriggers.delete(pollId);
    await this.persistence.deactivateTrigger(pollId, trigger.region);
    console.log(`⏹️ Stopped polling: ${pollId}`);

    return true;
  }

  /**
   * Get webhook statistics
   */
  getStats(): any {
    return {
      activeWebhooks: this.activeWebhooks.size,
      pollingTriggers: this.pollingTriggers.size,
      dedupeEntries: null,
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
