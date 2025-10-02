import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient.js';

export interface ZohoBooksCredentials extends APICredentials {
  accessToken: string;
  organizationId: string;
}

type OrganizationScopedParams = {
  organizationId?: string;
  [key: string]: any;
};

const RETRY_SETTINGS = {
  retries: 2,
  initialDelayMs: 500,
  maxDelayMs: 2000
};

export class ZohoBooksAPIClient extends BaseAPIClient {
  private readonly organizationId: string;

  constructor(credentials: ZohoBooksCredentials) {
    if (!credentials.accessToken) {
      throw new Error('Zoho Books integration requires an OAuth access token');
    }
    if (!credentials.organizationId) {
      throw new Error('Zoho Books integration requires an organizationId');
    }

    super('https://books.zoho.com/api/v3', credentials);
    this.organizationId = credentials.organizationId;

    this.registerHandlers({
      test_connection: () => this.testConnection(),
      get_organization: params => this.getOrganization(params as OrganizationScopedParams),
      create_customer: params => this.createCustomer(params as OrganizationScopedParams),
      get_customer: params => this.getCustomer(params as OrganizationScopedParams & { customerId: string }),
      update_customer: params => this.updateCustomer(params as OrganizationScopedParams & { customerId: string }),
      list_customers: params => this.listCustomers(params as OrganizationScopedParams),
      create_item: params => this.createItem(params as OrganizationScopedParams),
      create_invoice: params => this.createInvoice(params as OrganizationScopedParams),
      get_invoice: params => this.getInvoice(params as OrganizationScopedParams & { invoiceId: string }),
      send_invoice: params => this.sendInvoice(params as OrganizationScopedParams & { invoiceId: string }),
      record_payment: params => this.recordPayment(params as OrganizationScopedParams),
      create_expense: params => this.createExpense(params as OrganizationScopedParams),
      get_reports: params => this.getReports(params as OrganizationScopedParams & { reportId: string })
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      Authorization: `Zoho-oauthtoken ${this.credentials.accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.withRetries(() => this.get(`/organizations${this.buildOrgQuery({ page: 1, perPage: 1 })}`), RETRY_SETTINGS);
  }

  private async getOrganization(params: OrganizationScopedParams = {}): Promise<APIResponse<any>> {
    const orgId = params.organizationId ?? this.organizationId;
    return this.withRetries(() => this.get(`/organizations/${orgId}${this.buildOrgQuery({}, orgId)}`), RETRY_SETTINGS);
  }

  private async createCustomer(params: OrganizationScopedParams): Promise<APIResponse<any>> {
    const { organizationId, ...payload } = params;
    const query = this.buildOrgQuery({}, organizationId);
    const body = this.sanitizePayload(payload);
    if (!body.contact_name) {
      return { success: false, error: 'create_customer requires contactName' };
    }
    return this.withRetries(() => this.post(`/contacts${query}`, body), RETRY_SETTINGS);
  }

  private async getCustomer(params: OrganizationScopedParams & { customerId: string }): Promise<APIResponse<any>> {
    if (!params.customerId) {
      return { success: false, error: 'get_customer requires customerId' };
    }
    const query = this.buildOrgQuery({}, params.organizationId);
    return this.withRetries(
      () => this.get(`/contacts/${encodeURIComponent(params.customerId)}${query}`),
      RETRY_SETTINGS
    );
  }

  private async updateCustomer(params: OrganizationScopedParams & { customerId: string }): Promise<APIResponse<any>> {
    if (!params.customerId) {
      return { success: false, error: 'update_customer requires customerId' };
    }
    const { customerId, organizationId, ...rest } = params;
    const query = this.buildOrgQuery({}, organizationId);
    const body = this.sanitizePayload(rest);
    return this.withRetries(
      () => this.put(`/contacts/${encodeURIComponent(customerId)}${query}`, body),
      RETRY_SETTINGS
    );
  }

  private async listCustomers(params: OrganizationScopedParams = {}): Promise<APIResponse<any>> {
    const { organizationId, ...filters } = params;
    const query = this.buildOrgQuery(filters, organizationId);
    return this.withRetries(() => this.get(`/contacts${query}`), RETRY_SETTINGS);
  }

  private async createItem(params: OrganizationScopedParams): Promise<APIResponse<any>> {
    const { organizationId, ...payload } = params;
    if (!payload.name) {
      return { success: false, error: 'create_item requires name' };
    }
    const query = this.buildOrgQuery({}, organizationId);
    return this.withRetries(() => this.post(`/items${query}`, this.sanitizePayload(payload)), RETRY_SETTINGS);
  }

  private async createInvoice(params: OrganizationScopedParams): Promise<APIResponse<any>> {
    const { organizationId, ...payload } = params;
    if (!payload.customerId && !payload.customer_id) {
      return { success: false, error: 'create_invoice requires customerId' };
    }
    if (!Array.isArray(payload.lineItems) && !Array.isArray((payload as any).line_items)) {
      return { success: false, error: 'create_invoice requires at least one line item' };
    }
    const query = this.buildOrgQuery({}, organizationId);
    return this.withRetries(() => this.post(`/invoices${query}`, this.sanitizePayload(payload)), RETRY_SETTINGS);
  }

  private async getInvoice(params: OrganizationScopedParams & { invoiceId: string }): Promise<APIResponse<any>> {
    if (!params.invoiceId) {
      return { success: false, error: 'get_invoice requires invoiceId' };
    }
    const query = this.buildOrgQuery({}, params.organizationId);
    return this.withRetries(
      () => this.get(`/invoices/${encodeURIComponent(params.invoiceId)}${query}`),
      RETRY_SETTINGS
    );
  }

  private async sendInvoice(params: OrganizationScopedParams & { invoiceId: string }): Promise<APIResponse<any>> {
    if (!params.invoiceId) {
      return { success: false, error: 'send_invoice requires invoiceId' };
    }
    const { invoiceId, organizationId, ...rest } = params;
    const query = this.buildOrgQuery({}, organizationId);
    const body = this.sanitizePayload(rest);
    return this.withRetries(
      () => this.post(`/invoices/${encodeURIComponent(invoiceId)}/status/sent${query}`, body),
      RETRY_SETTINGS
    );
  }

  private async recordPayment(params: OrganizationScopedParams): Promise<APIResponse<any>> {
    const { organizationId, ...payload } = params;
    if (!payload.customerId || !payload.paymentMode || !payload.amount || !payload.date) {
      return {
        success: false,
        error: 'record_payment requires customerId, paymentMode, amount, date, and invoices'
      };
    }
    if (!Array.isArray(payload.invoices) || payload.invoices.length === 0) {
      return { success: false, error: 'record_payment requires at least one invoice allocation' };
    }
    const query = this.buildOrgQuery({}, organizationId);
    return this.withRetries(
      () => this.post(`/customerpayments${query}`, this.sanitizePayload(payload)),
      RETRY_SETTINGS
    );
  }

  private async createExpense(params: OrganizationScopedParams): Promise<APIResponse<any>> {
    const { organizationId, ...payload } = params;
    if (!payload.accountId || !payload.date || !payload.amount) {
      return { success: false, error: 'create_expense requires accountId, date, and amount' };
    }
    const query = this.buildOrgQuery({}, organizationId);
    return this.withRetries(() => this.post(`/expenses${query}`, this.sanitizePayload(payload)), RETRY_SETTINGS);
  }

  private async getReports(params: OrganizationScopedParams & { reportId: string }): Promise<APIResponse<any>> {
    if (!params.reportId) {
      return { success: false, error: 'get_reports requires reportId' };
    }
    const { reportId, organizationId, ...filters } = params;
    const query = this.buildOrgQuery(filters, organizationId);
    return this.withRetries(
      () => this.get(`/reports/${encodeURIComponent(reportId)}${query}`),
      RETRY_SETTINGS
    );
  }

  private buildOrgQuery(params: Record<string, any> = {}, organizationId?: string): string {
    const queryParams = this.sanitizePayload({ ...params, organizationId: organizationId ?? this.organizationId });
    return this.buildQueryString(queryParams);
  }

  private sanitizePayload<T extends Record<string, any>>(payload: T): Record<string, any> {
    return this.toSnakeCase(this.removeUndefined(payload));
  }

  private removeUndefined<T extends Record<string, any>>(payload: T): T {
    const clone: Record<string, any> = {};
    for (const [key, value] of Object.entries(payload)) {
      if (value === undefined || value === null) {
        continue;
      }
      if (Array.isArray(value)) {
        clone[key] = value
          .filter(item => item !== undefined && item !== null)
          .map(item => (typeof item === 'object' ? this.removeUndefined(item as Record<string, any>) : item));
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

  private toSnakeCase(value: any): any {
    if (Array.isArray(value)) {
      return value.map(item => this.toSnakeCase(item));
    }
    if (value && typeof value === 'object') {
      const result: Record<string, any> = {};
      for (const [key, val] of Object.entries(value)) {
        const snakeKey = key
          .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
          .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
          .toLowerCase();
        result[snakeKey] = this.toSnakeCase(val);
      }
      return result;
    }
    return value;
  }
}
