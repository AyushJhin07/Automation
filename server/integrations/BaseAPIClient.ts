// BASE API CLIENT FOR ALL APPLICATION INTEGRATIONS
// Provides common functionality for HTTP requests, authentication, rate limiting, etc.

import { getErrorMessage } from '../types/common';
import Ajv, { JSONSchemaType, ValidateFunction } from 'ajv';
import { isIP } from 'node:net';
import type { ConnectionService, OrganizationNetworkAllowlist } from '../services/ConnectionService';
import { updateConnectorRateBudgetMetric } from '../observability/index.js';
import { rateLimiter, type RateLimitRules } from './RateLimiter';

let cachedConnectionService: ConnectionService | null | undefined;

async function getConnectionService(): Promise<ConnectionService | null> {
  if (cachedConnectionService !== undefined) {
    return cachedConnectionService;
  }

  try {
    const module = await import('../services/ConnectionService.js');
    cachedConnectionService = module.connectionService ?? null;
  } catch (error) {
    console.warn('[BaseAPIClient] Failed to load ConnectionService:', error);
    cachedConnectionService = null;
  }

  return cachedConnectionService;
}

export interface APICredentials {
  apiKey?: string;
  accessToken?: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  webhookUrl?: string;
  /**
   * Optional callback invoked when an OAuth client refreshes its access token.
   * Implementations that support saved connections can provide this hook so
   * updated credentials are persisted back to the connection store.
   */
  onTokenRefreshed?: (tokens: {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: number;
  }) => void | Promise<void>;
  __organizationId?: string;
  __connectionId?: string;
  __userId?: string;
  __organizationNetworkAllowlist?: OrganizationNetworkAllowlist;
  [key: string]: any;
}

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  statusCode?: number;
  headers?: Record<string, string>;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetTime: number;
}

const DEFAULT_RATE_LIMIT_HEADERS = {
  limit: ['x-ratelimit-limit', 'x-rate-limit-limit', 'ratelimit-limit'],
  remaining: ['x-ratelimit-remaining', 'x-rate-limit-remaining', 'ratelimit-remaining'],
  reset: ['x-ratelimit-reset', 'x-rate-limit-reset', 'ratelimit-reset'],
  retryAfter: ['retry-after'],
} as const;

type RateLimitMetadata = {
  limit?: number;
  remaining?: number;
  resetMs?: number;
  retryAfterMs?: number;
};

type ResponseMiddlewareContext = {
  response: Response;
  request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: any;
    init: RequestInit;
  };
  connectorId?: string;
  connectionId?: string | null;
  organizationId?: string | null;
  rateLimits?: RateLimitRules | null;
  rateLimitMetadata?: RateLimitMetadata | null;
};

type ResponseMiddleware = (context: ResponseMiddlewareContext) => Promise<void> | void;

export interface DynamicOptionValue {
  value: string;
  label: string;
  data?: Record<string, any> | null;
}

export interface DynamicOptionHandlerContext {
  search?: string;
  cursor?: string;
  limit?: number;
  dependencies?: Record<string, any>;
  operationId?: string;
  operationType?: string;
  parameterPath?: string;
  [key: string]: any;
}

export interface DynamicOptionResult {
  success: boolean;
  options: DynamicOptionValue[];
  nextCursor?: string | null;
  totalCount?: number | null;
  error?: string;
  raw?: any;
}

type DynamicOptionHandler = (context: DynamicOptionHandlerContext) => Promise<DynamicOptionResult>;

type TokenRefreshPayload = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number | string | null;
  [key: string]: any;
};

export abstract class BaseAPIClient {
  private static readonly ajv = new Ajv({ allErrors: true, strict: false });
  private static readonly schemaCache = new WeakMap<object, ValidateFunction>();

  protected baseURL: string;
  protected credentials: APICredentials;
  protected rateLimitInfo?: RateLimitInfo;
  private connectorId?: string;
  private connectorRateLimits?: RateLimitRules | null;
  private lastRateLimitWaitMs = 0;
  private lastRateLimitAttempts = 0;
  private rateLimitBackoffLevel = 0;
  private readonly responseMiddleware: ResponseMiddleware[];
  private __functionHandlers?: Map<string, (params: Record<string, any>) => Promise<APIResponse<any>>>;
  private __dynamicOptionHandlers?: Map<string, DynamicOptionHandler>;

  private static getSchemaValidator(schema: object): ValidateFunction {
    let validator = BaseAPIClient.schemaCache.get(schema);
    if (!validator) {
      validator = BaseAPIClient.ajv.compile(schema);
      BaseAPIClient.schemaCache.set(schema, validator);
    }
    return validator;
  }

  constructor(
    baseURL: string,
    credentials: APICredentials,
    options?: { connectorId?: string; connectionId?: string; rateLimits?: RateLimitRules | null }
  ) {
    this.baseURL = baseURL;
    this.credentials = credentials;
    this.__functionHandlers = new Map();
    this.__dynamicOptionHandlers = new Map();

    if (options?.connectionId && !this.credentials.__connectionId) {
      this.credentials.__connectionId = options.connectionId;
    }

    const inferredConnectorId =
      options?.connectorId || (this.credentials as Record<string, any>).__connectorId || this.deriveConnectorId();
    if (inferredConnectorId) {
      this.connectorId = inferredConnectorId;
      (this.credentials as Record<string, any>).__connectorId = inferredConnectorId;
    }

    this.connectorRateLimits = options?.rateLimits ?? null;
    this.responseMiddleware = [];
    this.registerResponseMiddleware(context => {
      const metadata = this.updateRateLimitInfo(context.response.headers);
      context.rateLimitMetadata = metadata;
      this.handleRateLimitEffects(context.response, metadata);
    });
  }

  public setConnectorContext(
    connectorId: string,
    connectionId?: string | null,
    rateLimits?: RateLimitRules | null
  ): void {
    if (connectorId) {
      this.connectorId = connectorId;
      (this.credentials as Record<string, any>).__connectorId = connectorId;
    }
    if (connectionId) {
      this.credentials.__connectionId = connectionId;
    }
    if (rateLimits !== undefined) {
      this.connectorRateLimits = rateLimits ?? null;
    }
  }

  protected getLastRateLimiterMetrics(): { waitMs: number; attempts: number } {
    return { waitMs: this.lastRateLimitWaitMs, attempts: this.lastRateLimitAttempts };
  }

  protected registerResponseMiddleware(middleware: ResponseMiddleware): void {
    if (typeof middleware === 'function') {
      this.responseMiddleware.push(middleware);
    }
  }

  private async runResponseMiddleware(context: ResponseMiddlewareContext): Promise<void> {
    for (const middleware of this.responseMiddleware) {
      try {
        await middleware(context);
      } catch (error) {
        console.warn('[BaseAPIClient] Response middleware failed:', error);
      }
    }
  }

  protected async applyTokenRefresh(update: TokenRefreshPayload): Promise<void> {
    this.credentials.accessToken = update.accessToken;

    if (update.refreshToken !== undefined) {
      this.credentials.refreshToken = update.refreshToken;
    }

    const rawExpiresAt = update.expiresAt;
    if (rawExpiresAt !== undefined) {
      const expiresAt =
        typeof rawExpiresAt === 'string'
          ? Date.parse(rawExpiresAt)
          : typeof rawExpiresAt === 'number'
            ? rawExpiresAt
            : null;

      if (expiresAt && Number.isFinite(expiresAt)) {
        (this.credentials as Record<string, any>).expiresAt = expiresAt;
      } else {
        delete (this.credentials as Record<string, any>).expiresAt;
      }
    }

    for (const [key, value] of Object.entries(update)) {
      if (key === 'accessToken' || key === 'refreshToken' || key === 'expiresAt') {
        continue;
      }
      if (value !== undefined) {
        (this.credentials as Record<string, any>)[key] = value;
      }
    }

    const callback = this.credentials.onTokenRefreshed;
    if (typeof callback === 'function') {
      await callback({
        accessToken: this.credentials.accessToken ?? update.accessToken,
        refreshToken: this.credentials.refreshToken,
        expiresAt:
          typeof (this.credentials as Record<string, any>).expiresAt === 'number'
            ? (this.credentials as Record<string, any>).expiresAt
            : typeof rawExpiresAt === 'number'
              ? rawExpiresAt
              : undefined,
      });
    }
  }

  /**
   * Make authenticated HTTP request
   */
  protected async makeRequest<T = any>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    endpoint: string,
    data?: any,
    headers: Record<string, string> = {}
  ): Promise<APIResponse<T>> {
    try {
      const url = this.buildRequestUrl(endpoint);
      await this.assertHostAllowed(url);

      const limiterResult = await rateLimiter.acquire({
        connectorId: this.connectorId ?? this.deriveConnectorId() ?? 'unknown',
        connectionId: this.credentials.__connectionId,
        organizationId: this.credentials.__organizationId,
        rules: this.connectorRateLimits,
      });

      this.lastRateLimitWaitMs = limiterResult.waitMs;
      this.lastRateLimitAttempts = limiterResult.attempts;

      const releaseLimiter = limiterResult.release;

      try {
        // Add authentication headers
        const authHeaders = this.getAuthHeaders();
        const requestHeaders = {
          'Content-Type': 'application/json',
          'User-Agent': 'ScriptSpark-Automation/1.0',
          ...authHeaders,
          ...headers
        };

        // Check rate limits before making request
        if (this.rateLimitInfo && this.isRateLimited()) {
          const waitTime = this.rateLimitInfo.resetTime - Date.now();
          if (waitTime > 0) {
            await this.sleep(waitTime);
          }
        }

        const requestOptions: RequestInit = {
          method,
          headers: requestHeaders,
          body: data ? JSON.stringify(data) : undefined
        };

        const response = await fetch(url, requestOptions);

        await this.runResponseMiddleware({
          response,
          request: {
            method,
            url,
            headers: requestHeaders,
            body: data,
            init: requestOptions,
          },
          connectorId: this.connectorId,
          connectionId: this.credentials.__connectionId ?? null,
          organizationId: this.credentials.__organizationId ?? null,
          rateLimits: this.connectorRateLimits ?? null,
        });

        const responseText = await response.text();
        let responseData: T;

        try {
          responseData = responseText ? JSON.parse(responseText) : null;
        } catch (parseError) {
          responseData = responseText as any;
        }

        if (!response.ok) {
          return {
            success: false,
            error: `HTTP ${response.status}: ${response.statusText}`,
            statusCode: response.status,
            data: responseData
          };
        }

        return {
          success: true,
          data: responseData,
          statusCode: response.status,
          headers: Object.fromEntries(response.headers.entries())
        };
      } finally {
        releaseLimiter?.();
      }

    } catch (error) {
      return {
        success: false,
        error: getErrorMessage(error),
        statusCode: 0
      };
    }
  }

  private buildRequestUrl(endpoint: string): string {
    if (/^https?:\/\//i.test(endpoint)) {
      return endpoint;
    }

    if (!this.baseURL) {
      throw new Error('Base URL is not configured for this API client');
    }

    if (endpoint.startsWith('/') && this.baseURL.endsWith('/')) {
      return `${this.baseURL}${endpoint.slice(1)}`;
    }

    if (endpoint.startsWith('/') || this.baseURL.endsWith('/')) {
      return `${this.baseURL}${endpoint}`;
    }

    return `${this.baseURL}/${endpoint}`;
  }

  private deriveConnectorId(): string | undefined {
    const rawName = this.constructor?.name ?? '';
    if (!rawName) {
      return undefined;
    }
    const trimmed = rawName.replace(/APIClient$/i, '');
    if (!trimmed) {
      return undefined;
    }
    return trimmed
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
      .toLowerCase();
  }

  private getNetworkAllowlist(): OrganizationNetworkAllowlist | null {
    const allowlist = this.credentials.__organizationNetworkAllowlist;
    if (!allowlist) {
      return null;
    }

    const normalize = (values?: string[]): string[] => {
      if (!Array.isArray(values)) {
        return [];
      }
      const cleaned = values
        .map((value) => (typeof value === 'string' ? value.trim().toLowerCase() : String(value ?? '').trim().toLowerCase()))
        .filter((value) => value.length > 0);
      return Array.from(new Set(cleaned));
    };

    return {
      domains: normalize(allowlist.domains),
      ipRanges: normalize(allowlist.ipRanges),
    };
  }

  private async assertHostAllowed(url: string): Promise<void> {
    const allowlist = this.getNetworkAllowlist();
    if (!allowlist) {
      return;
    }

    const hasDomainRules = allowlist.domains.length > 0;
    const hasIpRules = allowlist.ipRanges.length > 0;
    if (!hasDomainRules && !hasIpRules) {
      return;
    }

    let hostname: string;
    let port: string | undefined;
    try {
      const parsed = new URL(url);
      hostname = parsed.hostname.toLowerCase();
      port = parsed.port || undefined;
    } catch {
      return;
    }

    const hostnameAllowed = hasDomainRules && this.isHostnameAllowed(hostname, allowlist.domains);
    const ipAllowed = hasIpRules && this.isIpAllowed(hostname, allowlist.ipRanges);

    if (hostnameAllowed || ipAllowed) {
      return;
    }

    const attemptedHost = port ? `${hostname}:${port}` : hostname;
    const organizationId = this.credentials.__organizationId;
    const connectionId = this.credentials.__connectionId;
    const userId = this.credentials.__userId;

    const service = await getConnectionService();
    service?.recordDeniedNetworkAccess({
      organizationId,
      connectionId,
      userId,
      attemptedHost,
      attemptedUrl: url,
      reason: 'host_not_allowlisted',
      allowlist,
    });

    throw new Error(`Network request blocked: ${attemptedHost} is not allowlisted for this organization`);
  }

  private isHostnameAllowed(hostname: string, domains: string[]): boolean {
    for (const domain of domains) {
      if (!domain) continue;
      if (domain === '*') {
        return true;
      }
      if (domain.startsWith('*.')) {
        const suffix = domain.slice(2);
        if (!suffix) continue;
        if (hostname === suffix || hostname.endsWith(`.${suffix}`)) {
          return true;
        }
        continue;
      }
      if (hostname === domain) {
        return true;
      }
      if (hostname.endsWith(`.${domain}`)) {
        return true;
      }
    }
    return false;
  }

  private isIpAllowed(hostname: string, ranges: string[]): boolean {
    const version = isIP(hostname);
    if (!version) {
      return false;
    }

    for (const range of ranges) {
      if (!range) continue;
      if (!range.includes('/')) {
        if (hostname === range) {
          return true;
        }
        continue;
      }

      if (version === 4 && this.isIpv4InCidr(hostname, range)) {
        return true;
      }

      if (version === 6 && this.isIpv6InCidr(hostname, range)) {
        return true;
      }
    }

    return false;
  }

  private isIpv4InCidr(ip: string, cidr: string): boolean {
    const [range, prefixStr] = cidr.split('/');
    const prefix = Number(prefixStr);
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
      return false;
    }

    if (isIP(range) !== 4) {
      return false;
    }

    const ipValue = BaseAPIClient.ipv4ToInt(ip);
    const rangeValue = BaseAPIClient.ipv4ToInt(range);
    if (ipValue === null || rangeValue === null) {
      return false;
    }

    const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
    return (ipValue & mask) === (rangeValue & mask);
  }

  private isIpv6InCidr(ip: string, cidr: string): boolean {
    const [range, prefixStr] = cidr.split('/');
    const prefix = Number(prefixStr);
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > 128) {
      return false;
    }

    if (isIP(range) !== 6) {
      return false;
    }

    const ipValue = this.ipv6ToBigInt(ip);
    const rangeValue = this.ipv6ToBigInt(range);
    if (ipValue === null || rangeValue === null) {
      return false;
    }

    if (prefix === 0) {
      return true;
    }

    const shift = 128 - prefix;
    return (ipValue >> BigInt(shift)) === (rangeValue >> BigInt(shift));
  }

  private static ipv4ToInt(ip: string): number | null {
    const parts = ip.split('.');
    if (parts.length !== 4) {
      return null;
    }

    let value = 0;
    for (const part of parts) {
      const segment = Number(part);
      if (!Number.isInteger(segment) || segment < 0 || segment > 255) {
        return null;
      }
      value = (value << 8) + segment;
    }

    return value >>> 0;
  }

  private ipv6ToBigInt(ip: string): bigint | null {
    if (isIP(ip) !== 6) {
      return null;
    }

    const partsRaw = ip.split('::');
    if (partsRaw.length > 2) {
      return null;
    }

    const [headRaw, tailRaw] = partsRaw;
    const headParts = headRaw ? headRaw.split(':').filter(Boolean) : [];
    const tailParts = tailRaw ? tailRaw.split(':').filter(Boolean) : [];

    let segments: string[];
    if (tailRaw !== undefined) {
      const missing = 8 - (headParts.length + tailParts.length);
      segments = [
        ...headParts,
        ...Array(Math.max(missing, 0)).fill('0'),
        ...tailParts,
      ];
    } else {
      segments = headParts;
    }

    if (segments.length !== 8) {
      return null;
    }

    let value = BigInt(0);
    for (const segment of segments) {
      const parsed = parseInt(segment || '0', 16);
      if (Number.isNaN(parsed) || parsed < 0 || parsed > 0xffff) {
        return null;
      }
      value = (value << BigInt(16)) + BigInt(parsed);
    }

    return value;
  }

  /**
   * Register a function handler for generic execution
   */
  protected registerHandler(functionId: string, handler: (params: Record<string, any>) => Promise<APIResponse<any>>): void {
    if (!this.__functionHandlers) this.__functionHandlers = new Map();
    this.__functionHandlers.set(String(functionId).toLowerCase(), handler);
  }

  protected registerDynamicOptionHandler(handlerId: string, handler: DynamicOptionHandler): void {
    if (!this.__dynamicOptionHandlers) this.__dynamicOptionHandlers = new Map();
    this.__dynamicOptionHandlers.set(String(handlerId || '').toLowerCase(), handler);
  }

  protected registerDynamicOptionHandlers(handlers: Record<string, DynamicOptionHandler>): void {
    for (const [id, handler] of Object.entries(handlers)) {
      this.registerDynamicOptionHandler(id, handler);
    }
  }

  public hasDynamicOptionHandler(handlerId: string): boolean {
    if (!handlerId) {
      return false;
    }
    return Boolean(this.__dynamicOptionHandlers?.has(String(handlerId).toLowerCase()));
  }

  public async getDynamicOptions(
    handlerId: string,
    context: DynamicOptionHandlerContext = {}
  ): Promise<DynamicOptionResult> {
    const handlers = this.__dynamicOptionHandlers || new Map();
    const handler = handlers.get(String(handlerId || '').toLowerCase());

    if (!handler) {
      return {
        success: false,
        options: [],
        error: `Unknown dynamic option handler: ${handlerId}`,
      };
    }

    try {
      const result = await handler(context);
      if (!result || typeof result !== 'object') {
        return {
          success: false,
          options: [],
          error: `Dynamic option handler ${handlerId} returned an invalid result`,
        };
      }

      return {
        success: result.success !== false,
        options: Array.isArray(result.options) ? result.options : [],
        nextCursor: result.nextCursor ?? undefined,
        totalCount: result.totalCount ?? undefined,
        error: result.success === false ? (result.error || `Dynamic option handler ${handlerId} failed`) : result.error,
        raw: result.raw,
      };
    } catch (error) {
      return {
        success: false,
        options: [],
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Register multiple function handlers at once
   */
  protected registerHandlers(handlers: Record<string, (params: Record<string, any>) => Promise<APIResponse<any>>>): void {
    for (const [id, fn] of Object.entries(handlers)) {
      this.registerHandler(id, fn);
    }
  }

  /**
   * Register aliases that map catalog action IDs onto concrete client methods.
   * The provided map should use catalog IDs as keys and method names on the
   * concrete client as values.
   */
  protected registerAliasHandlers(aliases: Record<string, string>): void {
    for (const [alias, methodName] of Object.entries(aliases)) {
      const handler = (this as Record<string, unknown>)[methodName];
      if (typeof handler !== 'function') {
        throw new Error(
          `${this.constructor.name}: Cannot register alias "${alias}" for missing method "${methodName}".`
        );
      }

      this.registerHandler(alias, (params: Record<string, any>) => (handler as Function).call(this, params));
    }
  }

  /**
   * Generic function execution entry point
   * Concrete clients can rely on registered handlers to avoid IntegrationManager switches
   */
  public async execute(functionId: string, params: Record<string, any> = {}): Promise<APIResponse<any>> {
    const id = String(functionId || '').toLowerCase();
    const handlers = this.__functionHandlers || new Map();
    const handler = handlers.get(id);
    if (!handler) {
      return { success: false, error: `Unknown function handler: ${functionId}` };
    }
    try {
      return await handler(params);
    } catch (error) {
      return { success: false, error: getErrorMessage(error) };
    }
  }

  /**
   * GET request
   */
  protected async get<T = any>(endpoint: string, headers?: Record<string, string>): Promise<APIResponse<T>> {
    return this.makeRequest<T>('GET', endpoint, undefined, headers);
  }

  /**
   * POST request
   */
  protected async post<T = any>(endpoint: string, data?: any, headers?: Record<string, string>): Promise<APIResponse<T>> {
    return this.makeRequest<T>('POST', endpoint, data, headers);
  }

  /**
   * PUT request
   */
  protected async put<T = any>(endpoint: string, data?: any, headers?: Record<string, string>): Promise<APIResponse<T>> {
    return this.makeRequest<T>('PUT', endpoint, data, headers);
  }

  /**
   * DELETE request
   */
  protected async delete<T = any>(endpoint: string, headers?: Record<string, string>): Promise<APIResponse<T>> {
    return this.makeRequest<T>('DELETE', endpoint, undefined, headers);
  }

  /**
   * PATCH request
   */
  protected async patch<T = any>(endpoint: string, data?: any, headers?: Record<string, string>): Promise<APIResponse<T>> {
    return this.makeRequest<T>('PATCH', endpoint, data, headers);
  }

  /**
   * Get authentication headers (to be implemented by subclasses)
   */
  protected abstract getAuthHeaders(): Record<string, string>;

  /**
   * Test API connection
   */
  public abstract testConnection(): Promise<APIResponse<any>>;

  /**
   * Update credentials
   */
  public updateCredentials(credentials: APICredentials): void {
    this.credentials = { ...this.credentials, ...credentials };
  }

  /**
   * Check if currently rate limited
   */
  protected isRateLimited(): boolean {
    if (!this.rateLimitInfo) return false;
    return this.rateLimitInfo.remaining <= 0 && Date.now() < this.rateLimitInfo.resetTime;
  }

  /**
   * Update rate limit info from response headers
   */
  protected updateRateLimitInfo(headers: Headers): RateLimitMetadata | null {
    const metadata = this.extractRateLimitMetadata(headers);

    if (
      metadata &&
      metadata.limit !== undefined &&
      metadata.remaining !== undefined &&
      metadata.resetMs !== undefined
    ) {
      this.rateLimitInfo = {
        limit: metadata.limit,
        remaining: metadata.remaining,
        resetTime: metadata.resetMs,
      };
    }

    return metadata;
  }

  /**
   * Sleep for specified milliseconds
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private extractRateLimitMetadata(headers: Headers): RateLimitMetadata | null {
    const limit = this.parseIntegerHeader(this.readRateLimitHeader(headers, 'limit'));
    const remaining = this.parseIntegerHeader(this.readRateLimitHeader(headers, 'remaining'));
    const reset = this.parseResetHeader(this.readRateLimitHeader(headers, 'reset'));
    const retryAfter = this.parseRetryAfterHeader(this.readRateLimitHeader(headers, 'retryAfter'));

    const metadata: RateLimitMetadata = {};
    if (limit !== undefined) metadata.limit = limit;
    if (remaining !== undefined) metadata.remaining = remaining;
    if (reset !== undefined) metadata.resetMs = reset;
    if (retryAfter?.delayMs !== undefined) metadata.retryAfterMs = retryAfter.delayMs;
    if (metadata.resetMs === undefined && retryAfter?.resetMs !== undefined) {
      metadata.resetMs = retryAfter.resetMs;
    }

    const hasValue =
      metadata.limit !== undefined ||
      metadata.remaining !== undefined ||
      metadata.resetMs !== undefined ||
      metadata.retryAfterMs !== undefined;

    return hasValue ? metadata : null;
  }

  private readRateLimitHeader(headers: Headers, kind: keyof typeof DEFAULT_RATE_LIMIT_HEADERS): string | null {
    const candidates = this.getRateLimitHeaderCandidates(kind);
    for (const name of candidates) {
      const value = headers.get(name);
      if (value !== null && value !== undefined && value !== '') {
        return value;
      }
    }
    return null;
  }

  private getRateLimitHeaderCandidates(kind: keyof typeof DEFAULT_RATE_LIMIT_HEADERS): string[] {
    const overrides = this.connectorRateLimits?.rateHeaders?.[kind] ?? [];
    const defaults = DEFAULT_RATE_LIMIT_HEADERS[kind];
    const seen = new Set<string>();
    const ordered: string[] = [];

    for (const name of [...overrides, ...defaults]) {
      if (!name) continue;
      const normalized = name.toLowerCase();
      if (seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      ordered.push(normalized);
    }

    return ordered;
  }

  private parseIntegerHeader(value: string | null): number | undefined {
    if (value === null || value === undefined) {
      return undefined;
    }
    const numeric = Number(value.trim());
    return Number.isFinite(numeric) ? Math.round(numeric) : undefined;
  }

  private parseResetHeader(value: string | null): number | undefined {
    if (!value) {
      return undefined;
    }
    const trimmed = value.trim();
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      if (numeric > 1_000_000_000_000) {
        return Math.round(numeric);
      }
      if (numeric > 1_000_000_000) {
        return Math.round(numeric * 1000);
      }
      if (numeric >= 1_000_000) {
        return Date.now() + Math.round(numeric);
      }
      if (numeric >= 0) {
        return Date.now() + Math.round(numeric * 1000);
      }
    }

    const parsed = Date.parse(trimmed);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  private parseRetryAfterHeader(value: string | null): { delayMs?: number; resetMs?: number } | null {
    if (!value) {
      return null;
    }
    const trimmed = value.trim();
    const numeric = Number(trimmed);

    if (Number.isFinite(numeric)) {
      const delayMs = Math.max(0, Math.round(numeric * 1000));
      return { delayMs, resetMs: Date.now() + delayMs };
    }

    const parsed = Date.parse(trimmed);
    if (!Number.isNaN(parsed)) {
      return { delayMs: Math.max(0, parsed - Date.now()), resetMs: parsed };
    }

    return null;
  }

  private computeRateLimitBackoffDelay(level = this.rateLimitBackoffLevel): number {
    const exponent = Math.max(0, level - 1);
    const baseDelay = 1000;
    return Math.min(60000, Math.round(baseDelay * Math.pow(2, exponent)));
  }

  private applyJitter(waitMs: number): number {
    if (!Number.isFinite(waitMs) || waitMs <= 0) {
      return 0;
    }

    const jitter = 0.25;
    const minFactor = 1 - jitter;
    const factor = minFactor + Math.random() * (jitter * 2);
    return Math.max(0, Math.round(waitMs * factor));
  }

  private handleRateLimitEffects(response: Response, metadata: RateLimitMetadata | null): void {
    const connectorId = this.connectorId ?? this.deriveConnectorId() ?? 'unknown';
    const connectionId = this.credentials.__connectionId ?? null;
    const organizationId = this.credentials.__organizationId ?? null;

    if (metadata) {
      updateConnectorRateBudgetMetric({
        connectorId,
        connectionId,
        organizationId,
        remaining: metadata.remaining,
        limit: metadata.limit,
        resetMs: metadata.resetMs,
      });
    } else {
      updateConnectorRateBudgetMetric({ connectorId, connectionId, organizationId });
    }

    const shouldPenalize =
      response.status === 429 || Boolean(metadata?.retryAfterMs && metadata.retryAfterMs > 0);

    if (!shouldPenalize) {
      this.rateLimitBackoffLevel = 0;
      return;
    }

    let effectiveLevel = this.rateLimitBackoffLevel;
    if (response.status === 429) {
      this.rateLimitBackoffLevel = Math.min(this.rateLimitBackoffLevel + 1, 6);
      effectiveLevel = this.rateLimitBackoffLevel;
    } else {
      effectiveLevel = Math.max(effectiveLevel, 1);
    }

    const baseDelay =
      metadata?.retryAfterMs && metadata.retryAfterMs > 0
        ? metadata.retryAfterMs
        : this.computeRateLimitBackoffDelay(effectiveLevel);

    const waitMs = this.applyJitter(baseDelay);
    if (waitMs <= 0) {
      return;
    }

    rateLimiter.schedulePenalty({
      connectorId,
      connectionId,
      organizationId,
      waitMs,
      scope: this.connectorRateLimits?.concurrency?.scope ?? undefined,
    });
  }

  /**
   * Build query string from parameters
   */
  protected buildQueryString(params: Record<string, any>): string {
    const searchParams = new URLSearchParams();
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          value.forEach(item => searchParams.append(key, String(item)));
        } else {
          searchParams.append(key, String(value));
        }
      }
    });

    const queryString = searchParams.toString();
    return queryString ? `?${queryString}` : '';
  }

  /**
   * Validate required parameters
   */
  protected validateRequiredParams(params: Record<string, any>, required: string[]): void {
    const missing = required.filter(param => 
      params[param] === undefined || params[param] === null || params[param] === ''
    );

    if (missing.length > 0) {
      throw new Error(`Missing required parameters: ${missing.join(', ')}`);
    }
  }

  /**
   * Handle pagination for APIs that support it
   */
  protected async getAllPages<T>(
    endpoint: string,
    pageParam: string = 'page',
    limitParam: string = 'limit',
    limit: number = 100
  ): Promise<APIResponse<T[]>> {
    const allResults: T[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const queryParams = { [pageParam]: page, [limitParam]: limit };
      const response = await this.get<{ data: T[]; hasMore?: boolean; total?: number }>(
        `${endpoint}${this.buildQueryString(queryParams)}`
      );

      if (!response.success) {
        return response as APIResponse<T[]>;
      }

      if (response.data?.data) {
        allResults.push(...response.data.data);
        hasMore = response.data.hasMore !== false && response.data.data.length === limit;
      } else {
        hasMore = false;
      }

      page++;
    }

    return {
      success: true,
      data: allResults
    };
  }

  protected validatePayload<T>(schema: JSONSchemaType<T>, payload: unknown): T {
    const validator = BaseAPIClient.getSchemaValidator(schema as unknown as object);
    if (validator(payload)) {
      return payload as T;
    }

    const errors = (validator.errors || []).map(error => {
      const location = error.instancePath || error.schemaPath;
      return `${location}: ${error.message || 'invalid value'}`;
    });
    throw new Error(`Payload validation failed: ${errors.join('; ')}`);
  }

  protected async withRetries<T>(
    operation: () => Promise<APIResponse<T>>,
    options: {
      retries?: number;
      initialDelayMs?: number;
      maxDelayMs?: number;
      backoffMultiplier?: number;
      shouldRetry?: (response: APIResponse<T>) => boolean;
      onRetry?: (attempt: number, response: APIResponse<T>) => void;
    } = {}
  ): Promise<APIResponse<T>> {
    const {
      retries = 2,
      initialDelayMs = 500,
      maxDelayMs = 5000,
      backoffMultiplier = 2,
      shouldRetry = (response: APIResponse<T>) => {
        if (response.success) {
          return false;
        }
        if (response.statusCode === 429) {
          return true;
        }
        if (typeof response.statusCode === 'number' && response.statusCode >= 500) {
          return true;
        }
        return response.statusCode === 0;
      },
      onRetry
    } = options;

    let attempt = 0;
    let delay = Math.max(0, initialDelayMs);
    let lastResponse: APIResponse<T> | undefined;

    while (attempt <= retries) {
      try {
        const response = await operation();
        lastResponse = response;

        if (!shouldRetry(response) || attempt === retries) {
          return response;
        }

        onRetry?.(attempt + 1, response);
      } catch (error) {
        const failure: APIResponse<T> = {
          success: false,
          error: getErrorMessage(error),
          statusCode: 0
        };
        lastResponse = failure;

        if (!shouldRetry(failure) || attempt === retries) {
          return failure;
        }

        onRetry?.(attempt + 1, failure);
      }

      if (delay > 0) {
        await this.sleep(delay);
      }
      delay = Math.min(delay * backoffMultiplier, maxDelayMs);
      attempt++;
    }

    return lastResponse ?? { success: false, error: 'Operation failed without yielding a response.' };
  }

  protected async collectCursorPaginated<TItem, TResponse>(
    options: {
      fetchPage: (cursor?: string | null) => Promise<APIResponse<TResponse>>;
      extractItems: (response: TResponse) => TItem[] | undefined;
      extractCursor?: (response: TResponse) => string | null | undefined;
      initialCursor?: string | null;
      maxPages?: number;
      onPage?: (page: { items: TItem[]; cursor?: string | null; page: number }) => void;
    }
  ): Promise<APIResponse<TItem[]>> {
    const {
      fetchPage,
      extractItems,
      extractCursor = () => null,
      initialCursor = null,
      maxPages = 50,
      onPage
    } = options;

    const results: TItem[] = [];
    let cursor: string | null | undefined = initialCursor;

    for (let page = 0; page < maxPages; page++) {
      const response = await fetchPage(cursor ?? undefined);
      if (!response.success || !response.data) {
        return response as APIResponse<TItem[]>;
      }

      const items = extractItems(response.data) ?? [];
      results.push(...items);
      onPage?.({ items, cursor, page: page + 1 });

      cursor = extractCursor(response.data);
      if (!cursor) {
        break;
      }
    }

    return {
      success: true,
      data: results
    };
  }

  /**
   * Register a webhook with the external service
   * Override this method in specific API clients
   */
  async registerWebhook(webhookUrl: string, events: string[], secret?: string): Promise<APIResponse<{ webhookId: string; secret?: string }>> {
    console.log(`🪝 Registering webhook for ${this.constructor.name}: ${webhookUrl}`);
    
    // Default implementation - override in specific clients
    return {
      success: false,
      error: 'Webhook registration not implemented for this service'
    };
  }

  /**
   * Unregister a webhook from the external service
   * Override this method in specific API clients
   */
  async unregisterWebhook(webhookId: string): Promise<APIResponse<void>> {
    console.log(`🗑️ Unregistering webhook ${webhookId} for ${this.constructor.name}`);
    
    // Default implementation - override in specific clients
    return {
      success: false,
      error: 'Webhook unregistration not implemented for this service'
    };
  }

  /**
   * List registered webhooks for this service
   * Override this method in specific API clients
   */
  async listWebhooks(): Promise<APIResponse<any[]>> {
    console.log(`📋 Listing webhooks for ${this.constructor.name}`);
    
    // Default implementation - override in specific clients
    return {
      success: false,
      error: 'Webhook listing not implemented for this service'
    };
  }

  /**
   * Validate webhook signature
   * Override this method in specific API clients for custom validation
   */
  validateWebhookSignature(payload: string, signature: string, secret: string): boolean {
    console.log(`🔒 Validating webhook signature for ${this.constructor.name}`);
    
    // Default implementation - override in specific clients
    // This is handled by WebhookManager with vendor-specific logic
    return true;
  }
}
