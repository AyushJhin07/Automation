import type { APICredentials, APIResponse } from './BaseAPIClient';
import { connectorRegistry } from '../ConnectorRegistry';
import { validateParams } from './RequestValidator';
import { normalizeListResponse } from './Normalizers';
import { rateLimiter, type RateLimitRules } from './RateLimiter';
import { recordExecution } from '../services/ExecutionAuditService';
import { getRequestContext } from '../utils/ExecutionContext';
import { organizationService } from '../services/OrganizationService';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';

interface ExecuteParams {
  appId: string;
  functionId: string;
  parameters: Record<string, any>;
  credentials: APICredentials;
}

interface BackoffEvent {
  type: 'rate_limiter' | 'http_retry' | 'network_retry';
  waitMs: number;
  attempt: number;
  reason?: string;
  statusCode?: number;
  limiterAttempts?: number;
}

export class GenericExecutor {
  public async executePaginated(
    params: ExecuteParams & { maxPages?: number }
  ): Promise<APIResponse<any>> {
    const maxPages = Math.max(1, params.maxPages ?? 5);
    const all: any[] = [];
    let cursor: any = undefined;
    let lastMeta: any = undefined;

    for (let i = 0; i < maxPages; i++) {
      const mergedParams = cursor ? { ...params.parameters, ...cursor } : params.parameters;
      const res = await this.execute({
        appId: params.appId,
        functionId: params.functionId,
        parameters: mergedParams,
        credentials: params.credentials,
      });
      if (!res.success) {
        return res;
      }
      const data = res.data;
      lastMeta = data?.meta || undefined;
      const items = this.extractItems(data);
      if (items && items.length) all.push(...items);
      const next = this.extractNext(data);
      if (!next) break;
      cursor = next;
    }

    return { success: true, data: { items: all, meta: lastMeta, pages: all.length } };
  }

  private extractItems(data: any): any[] | null {
    if (!data) return null;
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.items)) return data.items;
    if (Array.isArray(data.results)) return data.results;
    if (Array.isArray(data.data)) return data.data;
    return null;
  }

  private extractNext(data: any): Record<string, any> | null {
    if (!data) return null;
    const meta = data.meta || data.paging || data.links || data.response_metadata || {};
    // Heuristics: prefer cursor tokens
    if (meta.next_cursor) return { cursor: meta.next_cursor, page_token: meta.next_cursor, starting_after: meta.next_cursor };
    if (meta.next) {
      if (typeof meta.next === 'string' && meta.next.includes('?')) {
        const qs = meta.next.split('?')[1];
        const params = Object.fromEntries(new URLSearchParams(qs));
        return params as any;
      }
      return { page: meta.next, offset: meta.next } as any;
    }
    if (data.has_more && Array.isArray(data.data)) {
      // Stripe-style: use last id as starting_after
      const last = data.data[data.data.length - 1];
      if (last && last.id) return { starting_after: last.id };
    }
    return null;
  }

  private mergeRateLimitRules(
    connector?: RateLimitRules | null,
    operation?: RateLimitRules | null
  ): RateLimitRules | null {
    if (!connector && !operation) {
      return null;
    }

    const selectMin = (a?: number, b?: number): number | undefined => {
      if (typeof a === 'number' && Number.isFinite(a) && a > 0) {
        if (typeof b === 'number' && Number.isFinite(b) && b > 0) {
          return Math.min(a, b);
        }
        return a;
      }
      if (typeof b === 'number' && Number.isFinite(b) && b > 0) {
        return b;
      }
      return undefined;
    };

    const merged: RateLimitRules = { ...(connector ?? {}), ...(operation ?? {}) };

    const rps = selectMin(connector?.requestsPerSecond, operation?.requestsPerSecond);
    if (rps !== undefined) {
      merged.requestsPerSecond = rps;
    }
    const rpm = selectMin(connector?.requestsPerMinute, operation?.requestsPerMinute);
    if (rpm !== undefined) {
      merged.requestsPerMinute = rpm;
    }
    const burst = selectMin(connector?.burst, operation?.burst);
    if (burst !== undefined) {
      merged.burst = burst;
    }

    if (connector?.concurrency || operation?.concurrency) {
      const maxConcurrent = selectMin(
        connector?.concurrency?.maxConcurrent,
        operation?.concurrency?.maxConcurrent
      );
      merged.concurrency = {
        maxConcurrent:
          maxConcurrent ?? operation?.concurrency?.maxConcurrent ?? connector?.concurrency?.maxConcurrent,
        scope: operation?.concurrency?.scope ?? connector?.concurrency?.scope,
      };
    }

    if (connector?.rateHeaders || operation?.rateHeaders) {
      const headers = {
        ...(connector?.rateHeaders ?? {}),
        ...(operation?.rateHeaders ?? {}),
      };
      const hasHeader = Object.values(headers).some(value =>
        Array.isArray(value) ? value.length > 0 : Boolean(value)
      );
      if (hasHeader) {
        merged.rateHeaders = headers;
      }
    }

    return Object.keys(merged).length > 0 ? merged : null;
  }
  public async testConnection(appId: string, credentials: APICredentials): Promise<APIResponse<any>> {
    const def = connectorRegistry.getConnectorDefinition(appId);
    if (!def) {
      return { success: false, error: `Unknown connector: ${appId}` };
    }
    // Prefer explicit test_connection action
    const test = (def.actions || []).find(a => a.id === 'test_connection');
    if (test && (test as any).endpoint && (test as any).method) {
      return this.execute({ appId, functionId: 'test_connection', parameters: {}, credentials });
    }
    // Fallback to definition-level testConnection { endpoint, method }
    const tc: any = (def as any).testConnection;
    if (tc?.endpoint && tc?.method) {
      const baseUrl: string = (def as any).baseUrl || '';
      const method = String(tc.method).toUpperCase();
      const { headers, query: authQ } = this.applyAuthAndHeaders(def.authentication as any, credentials);
      const { url, query } = this.buildRequest(baseUrl, tc.endpoint, method as any, {});
      const qs = new URLSearchParams({ ...authQ, ...query } as any).toString();
      const finalUrl = qs ? `${url}?${qs}` : url;
      try {
        const resp = await fetch(finalUrl, { method, headers } as any);
        const text = await resp.text();
        let data: any;
        try { data = text ? JSON.parse(text) : undefined; } catch { data = text; }
        if (!resp.ok) return { success: false, error: `HTTP ${resp.status}: ${resp.statusText}`, data };
        return { success: true, data };
      } catch (e: any) {
        return { success: false, error: e?.message || String(e) };
      }
    }

    // Vendor heuristics
    try {
      const baseUrl: string = (def as any).baseUrl || '';
      // HubSpot: simple owners query validates token
      if ((appId === 'hubspot' || appId === 'hubspot-enhanced') && baseUrl) {
        const { headers } = this.applyAuthAndHeaders(def.authentication as any, credentials, {});
        const url = `${baseUrl.replace(/\/$/, '')}/crm/v3/owners?limit=1`;
        const resp = await fetch(url, { method: 'GET', headers } as any);
        if (!resp.ok) return { success: false, error: `HTTP ${resp.status}: ${resp.statusText}` };
        return { success: true, data: { status: 'connected' } };
      }
      // Stripe: list charges with limit=1 using secret key
      if ((appId === 'stripe' || appId === 'stripe-enhanced') && baseUrl) {
        const { headers } = this.applyAuthAndHeaders(def.authentication as any, credentials, {});
        const url = `${baseUrl.replace(/\/$/, '')}/v1/charges?limit=1`;
        const resp = await fetch(url, { method: 'GET', headers } as any);
        if (!resp.ok) return { success: false, error: `HTTP ${resp.status}: ${resp.statusText}` };
        return { success: true, data: { status: 'connected' } };
      }
    } catch (_) {}
    // Fallback: declare ready (we cannot safely probe vendor without params)
    return { success: true, data: { status: 'ready', message: 'Generic executor available' } };
  }

  public async execute({ appId, functionId, parameters, credentials }: ExecuteParams): Promise<APIResponse<any>> {
    const def = connectorRegistry.getConnectorDefinition(appId);
    if (!def) {
      return { success: false, error: `Unknown connector: ${appId}` };
    }

    // Find action or trigger by id
    const action = (def.actions || []).find(a => a.id === functionId) as any;
    const trigger = !action ? (def.triggers || []).find(t => t.id === functionId) as any : undefined;
    const fn = action || trigger;
    if (!fn) {
      return { success: false, error: `Function not found: ${appId}.${functionId}` };
    }

    // Validate parameters if schema is present
    const validation = validateParams(appId, functionId, (fn as any).parameters, parameters);
    if (validation) return validation;

    let baseUrl: string = (def as any).baseUrl || '';
    const endpoint: string = (fn as any).endpoint || '';
    const method: HttpMethod = (((fn as any).method || 'POST') as string).toUpperCase() as HttpMethod;

    const connectorRateLimits = def?.rateLimits ?? null;
    const operationRateLimits = (fn as any)?.rateLimits ?? null;
    const effectiveRateLimits = this.mergeRateLimitRules(connectorRateLimits, operationRateLimits);
    const connectionId = credentials.__connectionId ?? (parameters?.connectionId as string | undefined);

    if (!baseUrl || !endpoint) {
      return { success: false, error: `Connector ${appId} lacks baseUrl/endpoint for ${functionId}` };
    }

    // Build URL and request
    const baseHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    const { headers, query: authQuery } = this.applyAuthAndHeaders(def.authentication as any, credentials, baseHeaders);

    // Replace placeholders in baseUrl using credentials if present
    if (credentials && /\{[^}]+\}/.test(baseUrl)) {
      baseUrl = baseUrl.replace(/\{([^}]+)\}/g, (_m, key) => {
        const val = (credentials as any)[key];
        return val !== undefined ? encodeURIComponent(String(val)) : '';
      });
    }

    const { url, query, body, format } = this.buildRequest(baseUrl, endpoint, method, parameters, { appId, functionId, credentials });

    // Compose final URL with query
    const qs = new URLSearchParams({ ...authQuery, ...query } as any).toString();
    const finalUrl = qs ? `${url}?${qs}` : url;

    const reqStart = Date.now();
    const backoffEvents: BackoffEvent[] = [];
    let totalRateLimiterWaitMs = 0;
    let totalRateLimiterAttempts = 0;
    const organizationId = credentials.__organizationId ?? null;
    let organizationRegion: string | null = null;
    if (organizationId) {
      try {
        organizationRegion = await organizationService.getOrganizationRegion(organizationId);
      } catch (error) {
        console.debug(
          `⚠️ Failed to resolve region for organization ${organizationId} during generic execution:`,
          error instanceof Error ? error.message : String(error)
        );
      }
    }
    try {
      let reqBody: any = undefined;
      let reqHeaders = { ...headers } as Record<string, string>;
      if (body !== undefined) {
        if (format === 'json') {
          reqBody = JSON.stringify(body);
          reqHeaders['Content-Type'] = reqHeaders['Content-Type'] || 'application/json';
        } else if (format === 'form') {
          const usp = new URLSearchParams();
          Object.entries(body).forEach(([k, v]) => usp.append(k, Array.isArray(v) ? v.join(',') : String(v)));
          reqBody = usp as any;
          reqHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
        } else if (format === 'multipart') {
          const fd = new FormData();
          Object.entries(body).forEach(([k, v]) => fd.append(k, Array.isArray(v) ? JSON.stringify(v) : String(v)));
          reqBody = fd as any;
          // Let fetch set multipart boundary header automatically
          delete (reqHeaders as any)['Content-Type'];
        }
      }

      // Basic retry for transient errors and rate limits
      const maxRetries = 2;
      let attempt = 0;
      let resp: Response | null = null;
      let lastErr: any = null;
      while (attempt <= maxRetries) {
        try {
          const limiterResult = await rateLimiter.acquire({
            connectorId: appId,
            connectionId,
            organizationId: credentials.__organizationId,
            rules: effectiveRateLimits,
          });
          try {
            if (limiterResult.waitMs > 0 || limiterResult.enforced) {
              backoffEvents.push({
                type: 'rate_limiter',
                waitMs: limiterResult.waitMs,
                attempt,
                reason: 'token_bucket',
                limiterAttempts: limiterResult.attempts,
              });
            }
            totalRateLimiterWaitMs += limiterResult.waitMs;
            totalRateLimiterAttempts += limiterResult.attempts;
            resp = await fetch(finalUrl, {
              method,
              headers: reqHeaders,
              body: reqBody
            } as any);
          } finally {
            limiterResult.release?.();
          }
          if (resp.status === 429 || (resp.status >= 500 && resp.status <= 599)) {
            // Backoff then retry
            const wait = Math.min(1000 * Math.pow(2, attempt), 4000);
            if (wait > 0) {
              backoffEvents.push({
                type: 'http_retry',
                waitMs: wait,
                attempt,
                reason: resp.status === 429 ? 'http_429' : `http_${resp.status}`,
                statusCode: resp.status,
              });
            }
            await new Promise(r => setTimeout(r, wait));
            attempt++;
            continue;
          }
          break;
        } catch (e) {
          lastErr = e;
          const wait = Math.min(1000 * Math.pow(2, attempt), 4000);
          if (wait > 0) {
            backoffEvents.push({
              type: 'network_retry',
              waitMs: wait,
              attempt,
              reason: (e as any)?.name || 'network_error',
            });
          }
          await new Promise(r => setTimeout(r, wait));
          attempt++;
        }
      }
      if (!resp) {
        throw lastErr || new Error('Network error');
      }

      const text = await resp.text();
      let data: any;
      try { data = text ? JSON.parse(text) : undefined; } catch { data = text; }

      if (!resp.ok) {
        return this.normalizeHttpError(resp.status, resp.statusText, data);
      }

      // Vendor-level success coercion (e.g., Slack returns 200 with ok:false)
      if (data && typeof data === 'object') {
        if ((appId === 'slack' || appId === 'slack-enhanced') && data.ok === false) {
          const err = typeof data.error === 'string' ? data.error : 'unknown_slack_error';
          return { success: false, error: `slack_error: ${err}`, data };
        }
        // Common error envelope
        if (data.error && data.ok !== true) {
          const err = typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
          return { success: false, error: err, data };
        }
      }

      // Attach simple pagination metadata when available
      const meta: any = {};
      if (data && typeof data === 'object') {
        if (data.next || data.next_page || data.nextPage) meta.next = data.next || data.next_page || data.nextPage;
        if (data.links?.next) meta.next = data.links.next;
        if (data.paging?.next) meta.next = data.paging.next;
        if (data.has_more !== undefined) meta.has_more = data.has_more;
        if (data.next_cursor || data.response_metadata?.next_cursor) meta.next_cursor = data.next_cursor || data.response_metadata?.next_cursor;
      }
      const normalized = normalizeListResponse(appId, data);
      const payload = normalized ? { meta: normalized.meta, items: normalized.items } : (meta && Object.keys(meta).length ? { meta, ...data } : data);
      const ctx = getRequestContext();
      const executionMeta: Record<string, any> = {
        rateLimited: attempt > 0 || totalRateLimiterAttempts > 0,
      };

      if (totalRateLimiterAttempts > 0) {
        executionMeta.rateLimiterAttempts = totalRateLimiterAttempts;
      }
      if (totalRateLimiterWaitMs > 0) {
        executionMeta.rateLimiterWaitMs = totalRateLimiterWaitMs;
      }

      if (backoffEvents.length > 0) {
        const totalBackoffMs = backoffEvents.reduce((sum, event) => sum + (event.waitMs || 0), 0);
        executionMeta.backoffs = backoffEvents;
        executionMeta.totalBackoffMs = totalBackoffMs;
      }

      recordExecution({
        requestId: ctx?.requestId || 'unknown',
        appId,
        functionId,
        durationMs: Date.now() - reqStart,
        success: true,
        meta: executionMeta,
        organizationId,
        region: organizationRegion,
      });
      return { success: true, data: payload };
    } catch (error: any) {
      const ctx = getRequestContext();
      const executionMeta: Record<string, any> = {};
      if (backoffEvents.length > 0) {
        executionMeta.backoffs = backoffEvents;
        executionMeta.totalBackoffMs = backoffEvents.reduce((sum, event) => sum + (event.waitMs || 0), 0);
      }
      if (totalRateLimiterAttempts > 0) {
        executionMeta.rateLimiterAttempts = totalRateLimiterAttempts;
      }
      if (totalRateLimiterWaitMs > 0) {
        executionMeta.rateLimiterWaitMs = totalRateLimiterWaitMs;
      }
      recordExecution({
        requestId: ctx?.requestId || 'unknown',
        appId,
        functionId,
        durationMs: Date.now() - reqStart,
        success: false,
        error: error?.message || String(error),
        meta: Object.keys(executionMeta).length ? executionMeta : undefined,
        organizationId,
        region: organizationRegion,
      });
      return { success: false, error: error?.message || String(error) };
    }
  }

  private applyAuthAndHeaders(authentication: any, credentials: APICredentials, baseHeaders: Record<string, string> = {}) {
    const headers: Record<string, string> = { ...baseHeaders };
    const query: Record<string, string> = {};
    if (!authentication) return { headers, query };
    const type = authentication.type;
    const cfg = authentication.config || {};

    if (type === 'oauth2') {
      const token = credentials.accessToken || credentials.token || credentials.integrationToken;
      if (token) headers['Authorization'] = `Bearer ${token}`;
    } else if (type === 'api_key') {
      const place = (cfg.type || cfg.apiKeyLocation || 'header').toLowerCase();
      const name = cfg.name || cfg.apiKeyName || 'Authorization';
      const prefix = cfg.prefix || '';
      const key = (credentials.apiKey || credentials.token || credentials.accessToken || '') as string;
      const valueTemplate = cfg.apiKeyValue as string | undefined;
      const val = valueTemplate ? String(valueTemplate).replace('{api_key}', key) : (prefix ? `${prefix} ${key}`.trim() : key);
      if (place === 'header') headers[name] = val;
      if (place === 'query') query[name] = val;
      const extra = cfg.additionalParams || {};
      for (const [k, v] of Object.entries(extra)) {
        // Replace placeholders with credentials values
        const str = String(v);
        const replaced = str.replace(/\{([^}]+)\}/g, (_, key) => {
          const credVal = (credentials as any)[key];
          return credVal !== undefined ? String(credVal) : '';
        });
        query[k] = replaced;
      }
    } else if (type === 'basic' || type === 'basic_auth') {
      const u = (credentials as any).username || '';
      const p = (credentials as any).password || '';
      const b64 = Buffer.from(`${u}:${p}`).toString('base64');
      headers['Authorization'] = `Basic ${b64}`;
    }
    return { headers, query };
  }

  private buildRequest(baseUrl: string, endpoint: string, method: HttpMethod, parameters: Record<string, any>, ctx?: { appId: string; functionId: string; credentials?: APICredentials }): { url: string; query: Record<string,string>; body?: any; format: 'json'|'form'|'multipart' } {
    // Replace path params like :id or {id}
    let path = endpoint;
    const query: Record<string, string> = {};

    const reserved = new Set(['credentials', 'connectionId']);
    const params = { ...parameters };

    // Replace :param
    path = path.replace(/:([a-zA-Z0-9_]+)/g, (_, key) => {
      const v = params[key];
      if (v !== undefined) { delete params[key]; return encodeURIComponent(String(v)); }
      return _;
    });
    // Replace {param}
    path = path.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => {
      const v = params[key];
      if (v !== undefined) { delete params[key]; return encodeURIComponent(String(v)); }
      return _;
    });

    // Also replace using credentials if placeholders remain
    if (ctx?.credentials && /[:{][a-zA-Z0-9_]+[}]?/.test(path)) {
      const credEntries = Object.entries(ctx.credentials);
      path = path.replace(/:([a-zA-Z0-9_]+)/g, (_, key) => {
        const f = credEntries.find(([k]) => k.toLowerCase() === key.toLowerCase());
        if (f) return encodeURIComponent(String(f[1]));
        return _;
      });
      path = path.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => {
        const f = credEntries.find(([k]) => k.toLowerCase() === key.toLowerCase());
        if (f) return encodeURIComponent(String(f[1]));
        return _;
      });
    }

    const url = `${baseUrl.replace(/\/$/, '')}${path.startsWith('/') ? '' : '/'}${path}`;

    if (method === 'GET' || method === 'DELETE' || method === 'HEAD') {
      for (const [k, v] of Object.entries(params)) {
        if (reserved.has(k)) continue;
        if (v === undefined || v === null) continue;
        query[k] = Array.isArray(v) ? v.join(',') : String(v);
      }
      return { url, query, format: 'json' };
    }

    const body: any = {};
    for (const [k, v] of Object.entries(params)) {
      if (reserved.has(k)) continue;
      if (v === undefined) continue;
      body[k] = v;
    }
    // Heuristic: Slack file upload and similar use multipart
    const lowerEndpoint = endpoint.toLowerCase();
    if (ctx?.appId === 'slack' && (ctx.functionId.includes('upload') || lowerEndpoint.includes('files.upload'))) {
      return { url, query, body, format: 'multipart' };
    }
    // Stripe APIs prefer form-encoded by default for POST
    if (ctx?.appId === 'stripe' && (method === 'POST' || method === 'PATCH' || method === 'PUT')) {
      return { url, query, body, format: 'form' };
    }
    return { url, query, body, format: 'json' };
  }

  private normalizeHttpError(status: number, statusText: string, data: any): APIResponse<any> {
    let code = 'unknown_error';
    if (status === 400) code = 'validation_error';
    else if (status === 401) code = 'unauthorized';
    else if (status === 403) code = 'forbidden';
    else if (status === 404) code = 'not_found';
    else if (status === 409) code = 'conflict';
    else if (status === 422) code = 'unprocessable_entity';
    else if (status === 429) code = 'rate_limit_exceeded';
    else if (status >= 500) code = 'server_error';
    // Vendor-specific message extraction
    let message = `${code}: HTTP ${status} ${statusText}`;
    if (data && typeof data === 'object') {
      if (data.error && typeof data.error === 'object' && data.error.message) {
        message = `${code}: ${data.error.message}`;
      } else if (typeof data.message === 'string') {
        message = `${code}: ${data.message}`;
      }
    }
    return { success: false, error: message, data };
  }
}

export const genericExecutor = new GenericExecutor();
