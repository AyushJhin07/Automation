import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient.js';

export interface Dynamics365Credentials extends APICredentials {
  accessToken: string;
  baseUrl?: string;
  organizationUrl?: string;
  resourceUrl?: string;
  instanceUrl?: string;
  dataverseUrl?: string;
  environmentUrl?: string;
  organizationUri?: string;
  resourceUri?: string;
}

const DEFAULT_API_VERSION = 'v9.2';
const DATAVERSE_PATH_REGEX = /\/api\/data\/v\d+(\.\d+)?/i;
const RETRY_OPTIONS = {
  retries: 2,
  initialDelayMs: 500,
  maxDelayMs: 2000,
};

function normalizeDynamicsBaseUrl(credentials: Dynamics365Credentials): string {
  const candidates: Array<unknown> = [
    credentials.baseUrl,
    credentials.dataverseUrl,
    credentials.organizationUrl,
    credentials.organizationUri,
    credentials.environmentUrl,
    credentials.resourceUrl,
    credentials.resourceUri,
    credentials.instanceUrl,
    (credentials as Record<string, unknown>).resource,
    (credentials as Record<string, unknown>).organization,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeCandidate(candidate);
    if (normalized) {
      return normalized;
    }
  }

  throw new Error(
    'Dynamics365APIClient requires an organization-specific Dataverse base URL or instance domain.'
  );
}

function normalizeCandidate(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || /[{}]/u.test(trimmed)) {
    return null;
  }

  const prefixed = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(prefixed);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();
  const isDynamicsHost =
    host.includes('.dynamics.') || host.endsWith('dynamics.com') || host.endsWith('dynamics-int.com');

  if (!isDynamicsHost) {
    return null;
  }

  const base = `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ''}`;
  const pathMatch = url.pathname.match(DATAVERSE_PATH_REGEX);
  const dataversePath = pathMatch ? pathMatch[0].toLowerCase() : `/api/data/${DEFAULT_API_VERSION}`;

  return `${base}${dataversePath}`.replace(/\/+$/u, '');
}

function sanitizePayload(payload: Record<string, any>): Record<string, any> {
  const sanitized: Record<string, any> = {};
  Object.entries(payload || {}).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }
    if (Array.isArray(value)) {
      sanitized[key] = value
        .map(item => (typeof item === 'object' && item !== null ? sanitizePayload(item) : item))
        .filter(item => item !== undefined);
      return;
    }
    if (typeof value === 'object') {
      sanitized[key] = sanitizePayload(value as Record<string, any>);
      return;
    }
    sanitized[key] = value;
  });
  return sanitized;
}

function normalizeRecordPath(entitySet: string, id: string): string {
  const trimmed = (id || '').trim();
  if (!trimmed) {
    throw new Error(`${entitySet} record ID is required`);
  }
  const guid = trimmed.replace(/^[({]+|[)}]+$/g, '');
  return `/${entitySet}(${guid})`;
}

function normalizeListParams(params: Record<string, any>): Record<string, any> {
  const allowedKeys = ['$select', '$filter', '$orderby', '$top', '$skip', '$expand', '$count'];
  const normalized: Record<string, any> = {};

  for (const key of allowedKeys) {
    const value = params?.[key];
    if (value === undefined || value === null || value === '') {
      continue;
    }
    if (key === '$top' || key === '$skip') {
      const numeric = typeof value === 'string' ? Number(value) : value;
      if (!Number.isFinite(numeric)) {
        continue;
      }
      if (key === '$top') {
        const clamped = Math.min(Math.max(Math.trunc(Number(numeric)), 1), 5000);
        normalized[key] = clamped;
      } else {
        normalized[key] = Math.max(Math.trunc(Number(numeric)), 0);
      }
    } else if (key === '$count') {
      normalized[key] = value === true || value === 'true' ? 'true' : undefined;
    } else {
      normalized[key] = value;
    }
  }

  return normalized;
}

function normalizeGetParams(params: Record<string, any>): Record<string, any> {
  const allowedKeys = ['$select', '$expand'];
  const normalized: Record<string, any> = {};

  for (const key of allowedKeys) {
    const value = params?.[key];
    if (value === undefined || value === null || value === '') {
      continue;
    }
    normalized[key] = value;
  }

  return normalized;
}

function transformODataListResponse(response: APIResponse<any>): APIResponse<any> {
  if (!response.success || !response.data || typeof response.data !== 'object') {
    return response;
  }

  const payload = response.data as Record<string, any>;
  if (!Array.isArray(payload.value)) {
    return response;
  }

  const meta: Record<string, any> = {};
  if (typeof payload['@odata.nextLink'] === 'string') {
    meta.nextLink = payload['@odata.nextLink'];
    const skipToken = extractSkipToken(payload['@odata.nextLink']);
    if (skipToken) {
      meta.nextCursor = skipToken;
    }
  }
  if (typeof payload['@odata.count'] === 'number') {
    meta.count = payload['@odata.count'];
  }
  if (typeof payload['@odata.deltaLink'] === 'string') {
    meta.deltaLink = payload['@odata.deltaLink'];
  }
  if (typeof payload['@odata.context'] === 'string') {
    meta.context = payload['@odata.context'];
  }

  return {
    ...response,
    data: {
      items: payload.value,
      meta: Object.keys(meta).length > 0 ? meta : undefined,
    },
  };
}

function extractSkipToken(nextLink: string): string | undefined {
  try {
    const parsed = new URL(nextLink);
    return (
      parsed.searchParams.get('$skiptoken') ||
      parsed.searchParams.get('$skipToken') ||
      undefined
    );
  } catch {
    const match = nextLink.match(/[$]skiptoken=([^&]+)/i);
    return match ? decodeURIComponent(match[1]) : undefined;
  }
}

export class Dynamics365APIClient extends BaseAPIClient {
  constructor(credentials: Dynamics365Credentials) {
    if (!credentials?.accessToken) {
      throw new Error('Dynamics 365 integration requires an OAuth access token');
    }

    const baseUrl = normalizeDynamicsBaseUrl(credentials);
    super(baseUrl, credentials);

    this.registerAliasHandlers({
      test_connection: 'testConnection',
      create_account: 'createAccount',
      get_account: 'getAccount',
      update_account: 'updateAccount',
      list_accounts: 'listAccounts',
      create_contact: 'createContact',
      create_lead: 'createLead',
      create_opportunity: 'createOpportunity',
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.credentials.accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.withRetries(() => this.get('/WhoAmI'), RETRY_OPTIONS);
  }

  private async createAccount(params: Record<string, any>): Promise<APIResponse<any>> {
    const payload = sanitizePayload(params);
    return this.withRetries(
      () => this.post('/accounts', payload, { Prefer: 'return=representation' }),
      RETRY_OPTIONS
    );
  }

  private async getAccount(params: Record<string, any>): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['accountid']);
    const { accountid, ...rest } = params;
    const query = this.buildQueryString(normalizeGetParams(rest));
    return this.withRetries(
      () => this.get(`${normalizeRecordPath('accounts', accountid)}${query}`),
      RETRY_OPTIONS
    );
  }

  private async updateAccount(params: Record<string, any>): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['accountid']);
    const { accountid, ...rest } = params;
    const payload = sanitizePayload(rest);

    if (Object.keys(payload).length === 0) {
      return {
        success: false,
        error: 'update_account requires at least one field to update',
      };
    }

    return this.withRetries(
      () =>
        this.patch(normalizeRecordPath('accounts', accountid), payload, {
          'If-Match': '*',
        }),
      RETRY_OPTIONS
    );
  }

  private async listAccounts(params: Record<string, any>): Promise<APIResponse<any>> {
    const query = this.buildQueryString(normalizeListParams(params));
    const response = await this.withRetries(
      () => this.get(`/accounts${query}`),
      RETRY_OPTIONS
    );
    return transformODataListResponse(response);
  }

  private async createContact(params: Record<string, any>): Promise<APIResponse<any>> {
    const payload = sanitizePayload(params);
    return this.withRetries(
      () => this.post('/contacts', payload, { Prefer: 'return=representation' }),
      RETRY_OPTIONS
    );
  }

  private async createLead(params: Record<string, any>): Promise<APIResponse<any>> {
    const payload = sanitizePayload(params);
    return this.withRetries(
      () => this.post('/leads', payload, { Prefer: 'return=representation' }),
      RETRY_OPTIONS
    );
  }

  private async createOpportunity(params: Record<string, any>): Promise<APIResponse<any>> {
    const payload = sanitizePayload(params);
    return this.withRetries(
      () => this.post('/opportunities', payload, { Prefer: 'return=representation' }),
      RETRY_OPTIONS
    );
  }
}
