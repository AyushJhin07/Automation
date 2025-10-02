import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient.js';

export interface NetsuiteCredentials extends APICredentials {
  accessToken: string;
  accountId?: string;
  restDomain?: string;
  baseUrl?: string;
}

type ListParams = {
  limit?: number;
  offset?: number;
  q?: string;
};

type CreateRecordParams = Record<string, any>;

type CreateSalesOrderParams = {
  entity: { id: string };
  tranDate?: string;
  item?: Array<{
    item: { id: string };
    quantity?: number;
    rate?: number;
    [key: string]: any;
  }>;
  [key: string]: any;
};

const DEFAULT_RETRIES = {
  retries: 2,
  initialDelayMs: 500,
  maxDelayMs: 2000
};

export class NetsuiteAPIClient extends BaseAPIClient {
  private readonly accountId?: string;

  constructor(credentials: NetsuiteCredentials) {
    const { baseUrl, restDomain, accountId, accessToken, ...rest } = credentials;

    if (!accessToken) {
      throw new Error('NetSuite integration requires an OAuth access token');
    }

    const resolvedAccount = accountId ?? (rest as Record<string, any>).account;
    const resolvedDomain = baseUrl
      ? baseUrl
      : `${restDomain ?? (resolvedAccount ? `https://${resolvedAccount}.suitetalk.api.netsuite.com` : '')}`;

    if (!baseUrl && !resolvedAccount) {
      throw new Error('NetSuite integration requires either an accountId or an explicit baseUrl');
    }

    const normalizedBase = (baseUrl ?? `${resolvedDomain.replace(/\/?$/, '')}/services/rest/record/v1`).replace(
      /\/$/,
      ''
    );

    super(normalizedBase, { ...rest, accessToken, accountId: resolvedAccount });
    this.accountId = resolvedAccount;

    this.registerHandlers({
      test_connection: () => this.testConnection(),
      get_customers: params => this.listResource('customer', params as ListParams),
      create_customer: params => this.createRecord('customer', params as CreateRecordParams),
      get_items: params => this.listResource('item', params as ListParams),
      create_sales_order: params => this.createSalesOrder(params as CreateSalesOrderParams),
      get_invoices: params => this.listResource('invoice', params as ListParams)
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.credentials.accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.withRetries(() => this.get('/customer' + this.buildQueryString({ limit: 1 })), DEFAULT_RETRIES);
  }

  private async listResource(resource: string, params: ListParams = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString(this.normalizeListParams(params));
    return this.withRetries(() => this.get(`/${resource}${query}`), DEFAULT_RETRIES);
  }

  private async createRecord(resource: string, payload: CreateRecordParams): Promise<APIResponse<any>> {
    const sanitized = this.removeUndefined(payload);
    return this.withRetries(() => this.post(`/${resource}`, sanitized), DEFAULT_RETRIES);
  }

  private async createSalesOrder(payload: CreateSalesOrderParams): Promise<APIResponse<any>> {
    const sanitized = this.removeUndefined(payload);
    if (!sanitized.entity?.id) {
      return {
        success: false,
        error: 'create_sales_order requires an entity with id'
      };
    }
    return this.withRetries(() => this.post('/salesOrder', sanitized), DEFAULT_RETRIES);
  }

  private normalizeListParams(params: ListParams): Record<string, any> {
    const { limit, offset, q } = params;
    const normalized: Record<string, any> = {};
    if (typeof limit === 'number') {
      normalized.limit = Math.min(Math.max(limit, 1), 1000);
    }
    if (typeof offset === 'number' && offset >= 0) {
      normalized.offset = offset;
    }
    if (q) {
      normalized.q = q;
    }
    return normalized;
  }

  private removeUndefined<T extends Record<string, any>>(payload: T): T {
    const clone: Record<string, any> = {};
    for (const [key, value] of Object.entries(payload)) {
      if (value === undefined || value === null) {
        continue;
      }
      if (Array.isArray(value)) {
        clone[key] = value.map(item => (typeof item === 'object' && item ? this.removeUndefined(item) : item));
        continue;
      }
      if (typeof value === 'object') {
        clone[key] = this.removeUndefined(value as Record<string, any>);
        continue;
      }
      clone[key] = value;
    }
    return clone as T;
  }
}
