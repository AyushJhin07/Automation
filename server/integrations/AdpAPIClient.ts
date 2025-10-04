// ADP API CLIENT
// Provides a thin wrapper around ADP Workforce Now APIs including OAuth token
// acquisition, payroll event orchestration, and worker management helpers.

import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

const DEFAULT_BASE_URL = 'https://api.adp.com';
const DEFAULT_TOKEN_URL = 'https://accounts.adp.com/auth/oauth/v2/token';
const DEFAULT_SCOPE = 'api';
const DEFAULT_POLL_INTERVAL_MS = 15_000;
const DEFAULT_POLL_ATTEMPTS = 20;

export type AdpCredentials = APICredentials & {
  clientId?: string;
  clientSecret?: string;
  baseUrl?: string;
  tokenUrl?: string;
  scopes?: string[];
  scope?: string | string[];
  tenantContext?: unknown;
};

type TestConnectionParams = Record<string, never>;

type GetWorkerParams = {
  workerId?: string;
  worker_id?: string;
};

type CreateWorkerParams = Record<string, any>;

type UpdateWorkerParams = {
  workerId?: string;
  worker_id?: string;
  updates?: Record<string, any>;
  person?: Record<string, any>;
};

type RunPayrollParams = {
  payrollGroupId: string;
  payPeriodStart: string;
  payPeriodEnd: string;
  waitForCompletion?: boolean;
  pollIntervalSeconds?: number;
  maxPollAttempts?: number;
};

type GetPayrollReportParams = {
  reportType: string;
  payPeriod: string;
  format?: 'json' | 'csv' | 'pdf';
};

type PollParams = {
  cursor?: string | null;
  limit?: number;
};

type PayrollPollResult = {
  status: 'Completed' | 'Pending';
  eventId?: string;
  event?: any;
};

type EventsResponse = {
  events: any[];
  nextCursor?: string | null;
  raw?: any;
};

function parseExpiry(raw: unknown): number | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw;
  }
  if (typeof raw === 'string' && raw.trim().length > 0) {
    const parsed = Date.parse(raw);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

function ensureString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }
  if (value && typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch (_error) {
      return undefined;
    }
  }
  return undefined;
}

export class AdpAPIClient extends BaseAPIClient {
  private readonly tokenEndpoint: string;
  private readonly scope: string;
  private readonly refreshSkewMs = 60_000;
  private refreshPromise?: Promise<void>;

  constructor(credentials: AdpCredentials) {
    const baseUrl = (credentials.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    super(baseUrl, credentials);

    const clientId = credentials.clientId ?? (credentials as Record<string, any>).client_id;
    if (!clientId) {
      throw new Error('ADP integration requires a clientId');
    }

    const clientSecret = credentials.clientSecret ?? (credentials as Record<string, any>).client_secret;
    if (!clientSecret) {
      throw new Error('ADP integration requires a clientSecret');
    }

    this.credentials.clientId = clientId;
    this.credentials.clientSecret = clientSecret;

    const explicitScope = Array.isArray(credentials.scopes)
      ? credentials.scopes
      : Array.isArray(credentials.scope)
        ? credentials.scope
        : typeof credentials.scope === 'string'
          ? credentials.scope.split(/\s+/).filter(Boolean)
          : undefined;

    const scopes = explicitScope && explicitScope.length > 0 ? explicitScope : [DEFAULT_SCOPE];
    this.scope = scopes.join(' ');

    this.tokenEndpoint = credentials.tokenUrl ?? DEFAULT_TOKEN_URL;

    if (credentials.tenantContext !== undefined) {
      (this.credentials as Record<string, any>).tenantContext = credentials.tenantContext;
    }

    this.registerHandlers({
      test_connection: () => this.testConnection(),
      get_worker: params => this.getWorker(params as GetWorkerParams),
      create_worker: params => this.createWorker(params as CreateWorkerParams),
      update_worker: params => this.updateWorker(params as UpdateWorkerParams),
      run_payroll: params => this.runPayroll(params as RunPayrollParams),
      get_payroll_report: params => this.getPayrollReport(params as GetPayrollReportParams),
      worker_hired: params => this.pollWorkerHired(params as PollParams),
      payroll_completed: params => this.pollPayrollCompleted(params as PollParams),
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const token = this.credentials.accessToken;
    if (!token) {
      throw new Error('ADP integration is missing an access token');
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    };

    const context = ensureString(
      (this.credentials as Record<string, any>).tenantContext ??
        (this.credentials as Record<string, any>).tenant_context,
    );

    if (context) {
      headers['ADP-Context'] = context;
    }

    return headers;
  }

  protected override async makeRequest<T = any>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    endpoint: string,
    data?: any,
    headers: Record<string, string> = {},
  ): Promise<APIResponse<T>> {
    await this.ensureAccessToken();
    return super.makeRequest(method, endpoint, data, headers);
  }

  private async ensureAccessToken(): Promise<void> {
    const expiresAt = parseExpiry((this.credentials as Record<string, any>).expiresAt);
    if (this.credentials.accessToken && (!expiresAt || expiresAt - Date.now() > this.refreshSkewMs)) {
      return;
    }

    if (!this.refreshPromise) {
      this.refreshPromise = (async () => {
        try {
          const clientId = this.credentials.clientId;
          const clientSecret = this.credentials.clientSecret;
          if (!clientId || !clientSecret) {
            throw new Error('ADP token acquisition requires clientId and clientSecret');
          }

          const body = new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: clientId,
            client_secret: clientSecret,
          });

          if (this.scope) {
            body.set('scope', this.scope);
          }

          const response = await fetch(this.tokenEndpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              Accept: 'application/json',
            },
            body,
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`ADP token request failed: ${response.status} ${response.statusText} ${errorText}`);
          }

          const payload: any = await response.json();
          const expiresIn = typeof payload.expires_in === 'number' ? payload.expires_in : undefined;

          await this.applyTokenRefresh({
            accessToken: payload.access_token,
            expiresAt: expiresIn ? Date.now() + expiresIn * 1000 : undefined,
          });

          this.storeTenantContext(payload);

          if ((this.credentials as Record<string, any>).tenantContext === undefined) {
            await this.fetchTenantContext().catch(error => {
              console.warn('[AdpAPIClient] Failed to fetch tenant context:', error);
            });
          }
        } finally {
          this.refreshPromise = undefined;
        }
      })();
    }

    await this.refreshPromise;
  }

  private storeTenantContext(payload: any): void {
    if (!payload || typeof payload !== 'object') {
      return;
    }

    const context = payload.adp_context ?? payload.context ?? payload.adpContext;
    if (context !== undefined) {
      (this.credentials as Record<string, any>).tenantContext = context;
    }
  }

  private async fetchTenantContext(): Promise<void> {
    const response = await super.makeRequest<any>('GET', '/context/v1/tenants');
    if (!response.success || !response.data) {
      return;
    }

    const context =
      response.data?.tenants ??
      response.data?.data?.tenants ??
      response.data?.items ??
      response.data;

    if (context) {
      (this.credentials as Record<string, any>).tenantContext = context;
    }
  }

  private buildQuery(params: Record<string, string | number | null | undefined>): string {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === '') {
        continue;
      }
      search.set(key, String(value));
    }
    const query = search.toString();
    return query ? `?${query}` : '';
  }

  private normaliseEvents(payload: any, expectedEventName?: string): any[] {
    const candidates = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.events)
        ? payload.events
        : Array.isArray(payload?.data?.events)
          ? payload.data.events
          : Array.isArray(payload?.items)
            ? payload.items
            : payload?.event
              ? [payload.event]
              : [];

    if (!expectedEventName) {
      return candidates;
    }

    const target = expectedEventName.toLowerCase();
    return candidates.filter(item => {
      const name =
        (item?.eventName ?? item?.event?.eventName ?? item?.event?.name ?? item?.name ?? '')
          .toString()
          .toLowerCase();
      return name.includes(target);
    });
  }

  private extractNextCursor(payload: any): string | null | undefined {
    return payload?.meta?.cursor ?? payload?.cursor ?? payload?.nextCursor ?? payload?.links?.next ?? null;
  }

  private async pollForPayrollCompletion(
    eventId: string,
    options: { pollIntervalSeconds?: number; maxPollAttempts?: number },
  ): Promise<APIResponse<PayrollPollResult>> {
    const intervalMs = Math.max(0, (options.pollIntervalSeconds ?? DEFAULT_POLL_INTERVAL_MS / 1000) * 1000);
    const maxAttempts = Math.max(1, options.maxPollAttempts ?? DEFAULT_POLL_ATTEMPTS);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const pollResponse = await this.makeRequest<any>(
        'GET',
        `/events/payroll/v1/polling${this.buildQuery({ eventId })}`,
      );

      if (!pollResponse.success) {
        return pollResponse as APIResponse<PayrollPollResult>;
      }

      const events = this.normaliseEvents(pollResponse.data);
      const completion = events.find(event => {
        const id =
          event?.eventID ?? event?.eventId ?? event?.event?.eventID ?? event?.event?.eventId ?? event?.id ?? null;
        const eventName =
          (event?.eventName ?? event?.event?.eventName ?? event?.event?.name ?? '').toString().toLowerCase();

        if (id && id !== eventId) {
          const correlationId =
            event?.correlationId ?? event?.event?.correlationId ?? event?.event?.metadata?.correlationId ?? null;
          if (correlationId && correlationId !== eventId) {
            return false;
          }
        }

        return eventName.includes('complete');
      });

      if (completion) {
        return {
          success: true,
          data: {
            status: 'Completed',
            eventId,
            event: completion,
          },
        };
      }

      if (attempt < maxAttempts - 1 && intervalMs > 0) {
        await this.sleep(intervalMs);
      }
    }

    return {
      success: true,
      data: {
        status: 'Pending',
        eventId,
      },
    };
  }

  private getEventIdFromPayload(payload: any): string | undefined {
    if (!payload || typeof payload !== 'object') {
      return undefined;
    }

    const event = payload.event ?? payload.data?.event ?? payload.events?.[0];
    const id =
      event?.eventID ??
      event?.eventId ??
      payload?.eventID ??
      payload?.eventId ??
      payload?.data?.eventID ??
      payload?.data?.eventId;

    return typeof id === 'string' && id.trim().length > 0 ? id : undefined;
  }

  async testConnection(_params: TestConnectionParams = {}): Promise<APIResponse<any>> {
    return this.makeRequest('GET', '/hr/v2/workers?$top=1');
  }

  async getWorker(params: GetWorkerParams): Promise<APIResponse<any>> {
    const workerId = params.workerId ?? params.worker_id;
    if (!workerId) {
      return { success: false, error: 'workerId is required' };
    }
    const endpoint = `/hr/v2/workers/${encodeURIComponent(workerId)}`;
    return this.makeRequest('GET', endpoint);
  }

  async createWorker(params: CreateWorkerParams): Promise<APIResponse<any>> {
    return this.makeRequest('POST', '/events/hr/v2/workers', params);
  }

  async updateWorker(params: UpdateWorkerParams): Promise<APIResponse<any>> {
    const workerId = params.workerId ?? params.worker_id;
    if (!workerId) {
      return { success: false, error: 'workerId is required' };
    }
    const endpoint = `/hr/v2/workers/${encodeURIComponent(workerId)}`;
    const payload = params.updates ?? params.person ?? {};
    return this.makeRequest('PATCH', endpoint, payload);
  }

  async runPayroll(params: RunPayrollParams): Promise<APIResponse<any | PayrollPollResult>> {
    const { payrollGroupId, payPeriodStart, payPeriodEnd, waitForCompletion, pollIntervalSeconds, maxPollAttempts } = params;

    if (!payrollGroupId || !payPeriodStart || !payPeriodEnd) {
      return { success: false, error: 'payrollGroupId, payPeriodStart, and payPeriodEnd are required' };
    }

    const payload = {
      eventName: 'payroll.processing.requested',
      data: {
        payrollGroupId,
        payPeriod: {
          startDate: payPeriodStart,
          endDate: payPeriodEnd,
        },
      },
    };

    const response = await this.makeRequest('POST', '/events/payroll/v1/payroll-processing', payload);
    if (!response.success || !waitForCompletion) {
      return response;
    }

    const eventId = this.getEventIdFromPayload(response.data);
    if (!eventId) {
      return response;
    }

    return this.pollForPayrollCompletion(eventId, { pollIntervalSeconds, maxPollAttempts });
  }

  async getPayrollReport({ reportType, payPeriod, format = 'json' }: GetPayrollReportParams): Promise<APIResponse<any>> {
    if (!reportType || !payPeriod) {
      return { success: false, error: 'reportType and payPeriod are required' };
    }

    const endpoint = `/events/payroll/v1/reports/${encodeURIComponent(reportType)}${this.buildQuery({ payPeriod, format })}`;
    return this.makeRequest('GET', endpoint);
  }

  async pollWorkerHired(params: PollParams = {}): Promise<APIResponse<EventsResponse>> {
    const endpoint = `/events/hr/v2/polling${this.buildQuery({
      eventName: 'worker.hired',
      cursor: params.cursor ?? undefined,
      limit: params.limit,
    })}`;

    const response = await this.makeRequest<any>('GET', endpoint);
    if (!response.success) {
      return response as APIResponse<EventsResponse>;
    }

    const events = this.normaliseEvents(response.data);
    return {
      success: true,
      data: {
        events,
        nextCursor: this.extractNextCursor(response.data) ?? null,
        raw: response.data,
      },
    };
  }

  async pollPayrollCompleted(params: PollParams = {}): Promise<APIResponse<EventsResponse>> {
    const endpoint = `/events/payroll/v1/polling${this.buildQuery({
      eventName: 'payroll.completed',
      cursor: params.cursor ?? undefined,
      limit: params.limit,
    })}`;

    const response = await this.makeRequest<any>('GET', endpoint);
    if (!response.success) {
      return response as APIResponse<EventsResponse>;
    }

    const events = this.normaliseEvents(response.data, 'completed');
    return {
      success: true,
      data: {
        events,
        nextCursor: this.extractNextCursor(response.data) ?? null,
        raw: response.data,
      },
    };
  }
}
