import { randomUUID } from 'node:crypto';

import type { APICredentials, APIResponse } from './BaseAPIClient';
import { BaseAPIClient } from './BaseAPIClient';

export interface AdpTenantContext {
  encoded?: string;
  data?: Record<string, any> | null;
  organizationId?: string;
  tenantId?: string;
  accountId?: string;
  marketCode?: string;
  [key: string]: any;
}

export interface AdpCredentials extends APICredentials {
  baseUrl?: string;
  tokenUrl?: string;
  tenantContext?: AdpTenantContext | Record<string, any> | string | null;
  expiresAt?: number | string | null;
  scope?: string | string[];
  scopes?: string | string[];
}

interface CreateEmployeeParams {
  personalInfo: Record<string, any>;
  employmentInfo: Record<string, any>;
  compensation?: Record<string, any>;
}

interface UpdateEmployeeParams {
  workerId?: string;
  employeeId?: string;
  associateOID?: string;
  updates: Record<string, any>;
}

interface RunPayrollParams {
  payrollGroupId: string;
  payPeriodStart: string;
  payPeriodEnd: string;
  releaseDate?: string;
  metadata?: Record<string, any>;
}

interface GetPayrollReportParams {
  reportType: string;
  payPeriod: string;
  format?: string;
  payrollGroupId?: string;
}

interface TokenExchangePayload {
  access_token: string;
  expires_in?: number | string;
  scope?: string;
  token_type?: string;
  organizationOID?: string;
  tenantId?: string;
  accountId?: string;
  tenantContext?: Record<string, any>;
  context?: Record<string, any>;
  [key: string]: any;
}

export class AdpAPIClient extends BaseAPIClient {
  private readonly tokenEndpoint: string;
  private readonly refreshSkewMs = 60_000;
  private tokenPromise?: Promise<void>;
  private tenantContext?: AdpTenantContext;

  constructor(credentials: AdpCredentials = {}) {
    const baseUrl = (credentials.baseUrl ?? 'https://api.adp.com').replace(/\/$/, '');
    super(baseUrl, credentials, { connectorId: 'adp', connectionId: credentials.__connectionId });

    this.tokenEndpoint = credentials.tokenUrl ?? 'https://accounts.adp.com/auth/oauth/v2/token';
    this.tenantContext = this.normalizeTenantContext(credentials.tenantContext);

    this.registerHandlers({
      test_connection: this.testConnection.bind(this) as any,
      get_worker: this.getWorker.bind(this) as any,
      create_employee: this.createEmployee.bind(this) as any,
      update_employee: this.updateEmployee.bind(this) as any,
      run_payroll: this.runPayroll.bind(this) as any,
      get_payroll_report: this.getPayrollReport.bind(this) as any,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const token = this.credentials.accessToken;
    if (!token) {
      throw new Error('ADP integration requires an access token or valid OAuth client credentials.');
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    };

    if (this.credentials.clientId) {
      headers['ADP-Application-Key'] = this.credentials.clientId;
    }

    const tenantContextHeader = this.resolveTenantContextHeader();
    if (tenantContextHeader) {
      headers['ADP-Context'] = tenantContextHeader;
    }

    return headers;
  }

  protected override async makeRequest<T = any>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    endpoint: string,
    data?: any,
    headers: Record<string, string> = {}
  ): Promise<APIResponse<T>> {
    await this.ensureAccessToken();
    return super.makeRequest<T>(method, endpoint, data, headers);
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/hr/v2/workers?$top=1');
  }

  public async getWorker(params: { worker_id?: string; workerId?: string; associateOID?: string }): Promise<APIResponse<any>> {
    const workerId = params.workerId ?? params.worker_id ?? params.associateOID;
    this.validateRequiredParams({ workerId }, ['workerId']);
    const id = encodeURIComponent(String(workerId));
    return this.get(`/hr/v2/workers/${id}`);
  }

  public async createEmployee(params: CreateEmployeeParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['personalInfo', 'employmentInfo']);

    const workerPayload: Record<string, any> = {
      personalInformation: params.personalInfo,
      employment: params.employmentInfo,
    };

    if (params.compensation !== undefined) {
      workerPayload.compensation = params.compensation;
    }

    const event = {
      eventNameCode: { codeValue: 'worker.create' },
      data: {
        worker: workerPayload,
      },
    };

    return this.post('/events/hr/v1/workers', { events: [event] }, this.buildEventHeaders());
  }

  public async updateEmployee(params: UpdateEmployeeParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['updates']);
    const workerId = params.workerId ?? params.employeeId ?? params.associateOID;
    this.validateRequiredParams({ workerId }, ['workerId']);

    const event = {
      eventNameCode: { codeValue: 'worker.update' },
      eventContext: {
        worker: {
          associateOID: workerId,
        },
      },
      data: {
        worker: params.updates,
      },
    };

    return this.post('/events/hr/v1/workers', { events: [event] }, this.buildEventHeaders());
  }

  public async runPayroll(params: RunPayrollParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['payrollGroupId', 'payPeriodStart', 'payPeriodEnd']);

    const eventContext: Record<string, any> = {
      payrollGroupCode: { codeValue: params.payrollGroupId },
      payrollPeriod: {
        startDate: params.payPeriodStart,
        endDate: params.payPeriodEnd,
      },
    };

    if (params.releaseDate) {
      eventContext.releaseDate = params.releaseDate;
    }

    const eventData: Record<string, any> = {
      payrollGroupId: params.payrollGroupId,
      payrollPeriod: {
        startDate: params.payPeriodStart,
        endDate: params.payPeriodEnd,
      },
    };

    if (params.metadata) {
      Object.assign(eventData, params.metadata);
    }

    const response = await this.post(
      '/events/payroll/v1/payroll-requests',
      {
        events: [
          {
            eventNameCode: { codeValue: 'payroll.process' },
            eventContext,
            data: eventData,
          },
        ],
      },
      {
        ...this.buildEventHeaders(),
        Prefer: 'respond-async',
      }
    );

    if (response.success) {
      return {
        ...response,
        data: this.normalizeEventResponse(response, 'payroll_completed'),
      };
    }

    return response;
  }

  public async getPayrollReport(params: GetPayrollReportParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['reportType', 'payPeriod']);

    const query = this.buildQueryString({
      payPeriod: params.payPeriod,
      format: params.format ?? 'json',
      payrollGroupId: params.payrollGroupId,
    });

    const endpoint = `/events/payroll/v1/reports/${encodeURIComponent(params.reportType)}${query}`;
    return this.get(endpoint);
  }

  private buildEventHeaders(): Record<string, string> {
    return {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Request-ID': randomUUID(),
    };
  }

  private normalizeEventResponse(response: APIResponse<any>, webhookEvent: string): any {
    const headers = this.normalizeHeaders(response.headers ?? {});
    const rawPayload = response.data;
    const payload = rawPayload && typeof rawPayload === 'object' ? { ...rawPayload } : {};

    const correlationId = this.extractCorrelationId(payload, headers);
    const pollingUrl = this.extractPollingUrl(payload, headers);
    const tenantContext = this.resolveTenantContext();

    const webhook: Record<string, any> = {
      event: webhookEvent,
    };

    if (correlationId) {
      webhook.correlationId = correlationId;
    }

    if (pollingUrl) {
      webhook.pollingUrl = pollingUrl;
    }

    if (tenantContext) {
      webhook.tenantContext = {
        organizationId: tenantContext.organizationId,
        tenantId: tenantContext.tenantId,
        accountId: tenantContext.accountId,
        marketCode: tenantContext.marketCode,
        data: tenantContext.data ?? null,
      };
    }

    if (headers['retry-after']) {
      webhook.retryAfter = headers['retry-after'];
    }

    if (rawPayload && typeof rawPayload === 'object') {
      return {
        ...payload,
        webhook,
      };
    }

    return {
      payload: rawPayload,
      webhook,
    };
  }

  private normalizeHeaders(headers: Record<string, string>): Record<string, string> {
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      normalized[key.toLowerCase()] = value;
    }
    return normalized;
  }

  private extractCorrelationId(payload: Record<string, any>, headers: Record<string, string>): string | undefined {
    const headerKeys = ['event-correlation-id', 'adp-correlation-id', 'x-correlation-id', 'correlation-id'];
    for (const key of headerKeys) {
      const value = headers[key];
      if (value) {
        return value;
      }
    }

    if (payload?.eventCorrelationId) {
      return payload.eventCorrelationId;
    }

    const events = Array.isArray(payload?.events) ? payload.events : [];
    for (const event of events) {
      if (event?.eventCorrelationId) {
        return event.eventCorrelationId;
      }
      if (event?.eventID) {
        return event.eventID;
      }
      if (event?.eventId) {
        return event.eventId;
      }
    }

    if (payload?.meta?.eventCorrelationId) {
      return payload.meta.eventCorrelationId;
    }

    return undefined;
  }

  private extractPollingUrl(payload: Record<string, any>, headers: Record<string, string>): string | undefined {
    if (headers['content-location']) {
      return headers['content-location'];
    }

    if (headers.location) {
      return headers.location;
    }

    if (headers.link) {
      const linkHeader = headers.link;
      const match = /<([^>]+)>;\s*rel="?(status|polling|self)"?/i.exec(linkHeader);
      if (match) {
        return match[1];
      }
    }

    return this.extractLinkFromPayload(payload, ['status', 'polling', 'self']);
  }

  private extractLinkFromPayload(payload: Record<string, any>, rels: string[]): string | undefined {
    const links = payload?.links ?? payload?._links ?? payload?.meta?.links;
    if (!links) {
      return undefined;
    }

    const normalizedRels = rels.map(rel => rel.toLowerCase());

    if (Array.isArray(links)) {
      for (const link of links) {
        const rel = String(link?.rel ?? link?.relationship ?? '').toLowerCase();
        if (normalizedRels.includes(rel) && typeof link?.href === 'string') {
          return link.href;
        }
      }
      return undefined;
    }

    if (typeof links === 'object' && links !== null) {
      for (const [key, value] of Object.entries(links)) {
        const normalizedKey = key.toLowerCase();
        if (!normalizedRels.includes(normalizedKey)) {
          continue;
        }

        if (typeof value === 'string') {
          return value;
        }

        if (Array.isArray(value)) {
          const item = value.find(entry => entry && typeof entry.href === 'string');
          if (item?.href) {
            return item.href;
          }
        } else if (value && typeof value === 'object' && typeof (value as any).href === 'string') {
          return (value as any).href;
        }
      }
    }

    return undefined;
  }

  private async ensureAccessToken(): Promise<void> {
    const expiresAt = this.parseExpiry();
    const now = Date.now();

    const needsRefresh =
      !this.credentials.accessToken ||
      (typeof expiresAt === 'number' && expiresAt - now <= this.refreshSkewMs);

    if (!needsRefresh) {
      this.resolveTenantContext();
      return;
    }

    await this.exchangeClientCredentials();
  }

  private parseExpiry(): number | undefined {
    const raw = (this.credentials as AdpCredentials).expiresAt;
    if (!raw) {
      return undefined;
    }

    if (typeof raw === 'number') {
      return raw;
    }

    const parsed = Date.parse(raw);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  private async exchangeClientCredentials(): Promise<void> {
    if (this.tokenPromise) {
      return this.tokenPromise;
    }

    if (!this.credentials.clientId || !this.credentials.clientSecret) {
      throw new Error('ADP token exchange requires clientId and clientSecret.');
    }

    const scopeConfig = (this.credentials as AdpCredentials).scope ?? (this.credentials as AdpCredentials).scopes;
    const scopeValue = Array.isArray(scopeConfig)
      ? scopeConfig.join(' ')
      : typeof scopeConfig === 'string'
        ? scopeConfig
        : undefined;

    const promise = (async () => {
      const body = new URLSearchParams({
        grant_type: 'client_credentials',
      });

      if (scopeValue && scopeValue.trim().length > 0) {
        body.append('scope', scopeValue.trim());
      }

      const credentials = `${this.credentials.clientId}:${this.credentials.clientSecret}`;
      const authorization = Buffer.from(credentials).toString('base64');

      const response = await fetch(this.tokenEndpoint, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${authorization}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: body.toString(),
      });

      if (!response.ok) {
        throw new Error(`ADP token exchange failed: ${response.status} ${response.statusText}`);
      }

      const payload: TokenExchangePayload = await response.json();
      const expiresInRaw = payload.expires_in;
      const expiresIn = typeof expiresInRaw === 'string' ? Number.parseFloat(expiresInRaw) : expiresInRaw;
      const expiresAt = typeof expiresIn === 'number' && Number.isFinite(expiresIn)
        ? Date.now() + expiresIn * 1000
        : undefined;

      const tenantContext = this.extractTenantContext(payload, response);

      await this.applyTokenRefresh({
        accessToken: payload.access_token,
        expiresAt,
        tokenType: payload.token_type,
        scope: payload.scope,
        tenantContext,
      });

      if (tenantContext) {
        this.tenantContext = this.normalizeTenantContext(tenantContext);
      }
    })();

    this.tokenPromise = promise;

    try {
      await promise;
    } finally {
      if (this.tokenPromise === promise) {
        this.tokenPromise = undefined;
      }
    }
  }

  private extractTenantContext(payload: TokenExchangePayload, response: Response): AdpTenantContext | undefined {
    let context = this.normalizeTenantContext(payload.tenantContext ?? payload.context);

    const headerCandidates = ['adp-context', 'adp-ctx', 'adp-ctx-context'];
    for (const header of headerCandidates) {
      const value = response.headers.get(header);
      if (!value) {
        continue;
      }

      const decoded = this.decodeTenantContextValue(value);
      if (decoded) {
        const normalized = this.normalizeTenantContext({ data: decoded, encoded: value } as AdpTenantContext);
        context = { ...normalized, ...context };
        if (!context?.encoded) {
          context = { ...context, encoded: value };
        }
      } else if (!context?.encoded) {
        context = { ...context, encoded: value };
      }
    }

    const headerToKey: Record<string, keyof AdpTenantContext> = {
      'adp-ctx-organization-id': 'organizationId',
      'adp-ctx-tenant-id': 'tenantId',
      'adp-ctx-account-id': 'accountId',
      'adp-ctx-market-code': 'marketCode',
    };

    for (const [header, key] of Object.entries(headerToKey)) {
      const value = response.headers.get(header);
      if (value) {
        context = { ...(context ?? {}), [key]: value };
      }
    }

    if (payload.organizationOID) {
      context = { ...(context ?? {}), organizationId: payload.organizationOID };
    }

    if (payload.tenantId) {
      context = { ...(context ?? {}), tenantId: payload.tenantId };
    }

    if (payload.accountId) {
      context = { ...(context ?? {}), accountId: payload.accountId };
    }

    if (context?.data && !context.encoded) {
      try {
        context.encoded = Buffer.from(JSON.stringify(context.data)).toString('base64');
      } catch {
        // ignore encoding failures
      }
    }

    return context ?? undefined;
  }

  private decodeTenantContextValue(value: string): Record<string, any> | undefined {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }

    const tryParse = (raw: string): Record<string, any> | undefined => {
      try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : undefined;
      } catch {
        return undefined;
      }
    };

    return tryParse(trimmed) ?? (() => {
      try {
        const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
        return tryParse(decoded);
      } catch {
        return undefined;
      }
    })();
  }

  private normalizeTenantContext(
    input: AdpCredentials['tenantContext']
  ): AdpTenantContext | undefined {
    if (!input) {
      return undefined;
    }

    if (typeof input === 'string') {
      const decoded = this.decodeTenantContextValue(input);
      const context: AdpTenantContext = {
        encoded: input,
        data: decoded ?? null,
      };
      if (decoded) {
        context.organizationId = decoded.organizationOID ?? decoded.organizationId ?? decoded.organization?.id;
        context.tenantId = decoded.tenantId ?? decoded.tenantOID ?? decoded.tenant?.id;
        context.accountId = decoded.accountId ?? decoded.account?.id;
        context.marketCode = decoded.marketCode ?? decoded.market?.code;
      }
      return context;
    }

    if (typeof input === 'object' && !('encoded' in input) && !('data' in input) && !('organizationId' in input)) {
      const raw = input as Record<string, any>;
      const context: AdpTenantContext = {
        data: raw,
        organizationId: raw.organizationOID ?? raw.organizationId ?? raw.organization?.id,
        tenantId: raw.tenantId ?? raw.tenantOID ?? raw.tenant?.id,
        accountId: raw.accountId ?? raw.account?.id,
        marketCode: raw.marketCode ?? raw.market?.code,
      };
      return context;
    }

    const context: AdpTenantContext = { ...(input as AdpTenantContext) };
    if (context.data && !context.encoded) {
      try {
        context.encoded = Buffer.from(JSON.stringify(context.data)).toString('base64');
      } catch {
        // ignore encoding failures
      }
    }
    return context;
  }

  private resolveTenantContextHeader(): string | undefined {
    const context = this.resolveTenantContext();
    if (!context) {
      return undefined;
    }

    if (context.encoded) {
      return context.encoded;
    }

    if (context.data) {
      try {
        const encoded = Buffer.from(JSON.stringify(context.data)).toString('base64');
        context.encoded = encoded;
        (this.credentials as AdpCredentials).tenantContext = context;
        return encoded;
      } catch {
        return undefined;
      }
    }

    return undefined;
  }

  private resolveTenantContext(): AdpTenantContext | undefined {
    if (this.tenantContext) {
      return this.tenantContext;
    }

    const normalized = this.normalizeTenantContext((this.credentials as AdpCredentials).tenantContext);
    if (normalized) {
      this.tenantContext = normalized;
      (this.credentials as AdpCredentials).tenantContext = normalized;
    }
    return this.tenantContext;
  }
}

