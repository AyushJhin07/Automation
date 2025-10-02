import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient.js';

export interface XeroCredentials extends APICredentials {
  accessToken: string;
  tenantId: string;
}

type ContactParams = Record<string, any>;

type InvoiceParams = Record<string, any>;

type PaymentParams = Record<string, any>;

type BankTransactionParams = Record<string, any>;

type ReportParams = {
  reportId: string;
  date?: string;
  fromDate?: string;
  toDate?: string;
  periods?: number;
  timeframe?: string;
};

const RETRY_POLICY = {
  retries: 2,
  initialDelayMs: 500,
  maxDelayMs: 2000
};

export class XeroAPIClient extends BaseAPIClient {
  constructor(credentials: XeroCredentials) {
    if (!credentials.accessToken) {
      throw new Error('Xero integration requires an access token');
    }
    if (!credentials.tenantId) {
      throw new Error('Xero integration requires a tenantId');
    }

    super('https://api.xero.com/api.xro/2.0', credentials);

    this.registerHandlers({
      test_connection: () => this.testConnection(),
      get_organizations: () => this.getOrganizations(),
      create_contact: params => this.createContact(params as ContactParams),
      get_contact: params => this.getContact(params as { contactId: string }),
      update_contact: params => this.updateContact(params as ContactParams & { contactId: string }),
      list_contacts: params => this.listContacts(params as Record<string, any>),
      create_invoice: params => this.createInvoice(params as InvoiceParams),
      get_invoice: params => this.getInvoice(params as { invoiceId: string }),
      update_invoice: params => this.updateInvoice(params as InvoiceParams & { invoiceId: string }),
      create_payment: params => this.createPayment(params as PaymentParams),
      get_accounts: params => this.getAccounts(params as Record<string, any>),
      create_bank_transaction: params => this.createBankTransaction(params as BankTransactionParams),
      get_reports: params => this.getReports(params as ReportParams)
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.credentials.accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'Xero-Tenant-Id': this.credentials.tenantId
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.withRetries(() => this.get('/Organisation'), RETRY_POLICY);
  }

  private async getOrganizations(): Promise<APIResponse<any>> {
    return this.withRetries(() => this.get('/Organisation'), RETRY_POLICY);
  }

  private async createContact(params: ContactParams): Promise<APIResponse<any>> {
    const payload = this.wrapCollection('Contacts', params);
    return this.withRetries(() => this.post('/Contacts', payload), RETRY_POLICY);
  }

  private async getContact(params: { contactId: string }): Promise<APIResponse<any>> {
    if (!params.contactId) {
      return { success: false, error: 'get_contact requires contactId' };
    }
    return this.withRetries(() => this.get(`/Contacts/${encodeURIComponent(params.contactId)}`), RETRY_POLICY);
  }

  private async updateContact(params: ContactParams & { contactId: string }): Promise<APIResponse<any>> {
    if (!params.contactId) {
      return { success: false, error: 'update_contact requires contactId' };
    }
    const { contactId, ...rest } = params;
    const payload = this.wrapCollection('Contacts', rest);
    return this.withRetries(
      () => this.post(`/Contacts/${encodeURIComponent(contactId)}`, payload),
      RETRY_POLICY
    );
  }

  private async listContacts(params: Record<string, any> = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString(this.removeUndefined(params));
    return this.withRetries(() => this.get(`/Contacts${query}`), RETRY_POLICY);
  }

  private async createInvoice(params: InvoiceParams): Promise<APIResponse<any>> {
    const payload = this.wrapCollection('Invoices', params);
    return this.withRetries(() => this.post('/Invoices', payload), RETRY_POLICY);
  }

  private async getInvoice(params: { invoiceId: string }): Promise<APIResponse<any>> {
    if (!params.invoiceId) {
      return { success: false, error: 'get_invoice requires invoiceId' };
    }
    return this.withRetries(() => this.get(`/Invoices/${encodeURIComponent(params.invoiceId)}`), RETRY_POLICY);
  }

  private async updateInvoice(params: InvoiceParams & { invoiceId: string }): Promise<APIResponse<any>> {
    if (!params.invoiceId) {
      return { success: false, error: 'update_invoice requires invoiceId' };
    }
    const { invoiceId, ...rest } = params;
    const payload = this.wrapCollection('Invoices', rest);
    return this.withRetries(
      () => this.post(`/Invoices/${encodeURIComponent(invoiceId)}`, payload),
      RETRY_POLICY
    );
  }

  private async createPayment(params: PaymentParams): Promise<APIResponse<any>> {
    const payload = this.wrapCollection('Payments', params);
    return this.withRetries(() => this.post('/Payments', payload), RETRY_POLICY);
  }

  private async getAccounts(params: Record<string, any> = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString(this.removeUndefined(params));
    return this.withRetries(() => this.get(`/Accounts${query}`), RETRY_POLICY);
  }

  private async createBankTransaction(params: BankTransactionParams): Promise<APIResponse<any>> {
    const payload = this.wrapCollection('BankTransactions', params);
    return this.withRetries(() => this.post('/BankTransactions', payload), RETRY_POLICY);
  }

  private async getReports(params: ReportParams): Promise<APIResponse<any>> {
    if (!params.reportId) {
      return { success: false, error: 'get_reports requires reportId' };
    }
    const { reportId, ...rest } = params;
    const query = this.buildQueryString(this.removeUndefined(rest));
    return this.withRetries(
      () => this.get(`/Reports/${encodeURIComponent(reportId)}${query}`),
      RETRY_POLICY
    );
  }

  private wrapCollection(key: string, payload: Record<string, any>): Record<string, any> {
    return {
      [key]: [this.removeUndefined(payload)]
    };
  }

  private removeUndefined<T extends Record<string, any>>(payload: T): T {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(payload)) {
      if (value === undefined || value === null) {
        continue;
      }
      if (Array.isArray(value)) {
        result[key] = value
          .filter(item => item !== undefined && item !== null)
          .map(item => (typeof item === 'object' ? this.removeUndefined(item as Record<string, any>) : item));
        continue;
      }
      if (typeof value === 'object') {
        result[key] = this.removeUndefined(value as Record<string, any>);
        continue;
      }
      result[key] = value;
    }
    return result as T;
  }
}
