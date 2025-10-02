import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

interface SquareCredentials extends APICredentials {
  baseUrl?: string;
}

interface SquareMoney {
  amount: number;
  currency: string;
}

interface SquareCreatePaymentParams {
  source_id: string;
  idempotency_key: string;
  amount_money: SquareMoney;
  location_id?: string;
  reference_id?: string;
  note?: string;
  autocomplete?: boolean;
}

interface SquareListPaymentsParams {
  begin_time?: string;
  end_time?: string;
  sort_order?: 'ASC' | 'DESC';
  cursor?: string;
  location_id?: string;
  limit?: number;
}

export class SquareAPIClient extends BaseAPIClient {
  constructor(credentials: SquareCredentials) {
    const baseURL = credentials.baseUrl ?? 'https://connect.squareup.com/v2';
    super(baseURL, credentials);

    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'create_payment': this.createPayment.bind(this) as any,
      'get_payment': this.getPayment.bind(this) as any,
      'list_payments': this.listPayments.bind(this) as any,
      'create_refund': this.createRefund.bind(this) as any,
      'create_customer': this.createCustomer.bind(this) as any,
      'get_customer': this.getCustomer.bind(this) as any,
      'create_order': this.createOrder.bind(this) as any,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const token = this.credentials.apiKey || this.credentials.accessToken || this.credentials.token;
    if (!token) {
      throw new Error('Square integration requires apiKey or accessToken');
    }

    return {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/locations');
  }

  public async createPayment(params: SquareCreatePaymentParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['source_id', 'idempotency_key', 'amount_money']);
    return this.post('/payments', params);
  }

  public async getPayment(params: { payment_id: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['payment_id']);
    return this.get(`/payments/${encodeURIComponent(params.payment_id)}`);
  }

  public async listPayments(params: SquareListPaymentsParams = {}): Promise<APIResponse<any>> {
    const query = this.cleanParams(params);
    const qs = this.buildQueryString(query);
    return this.get(`/payments${qs}`);
  }

  public async createRefund(params: { idempotency_key: string; amount_money: SquareMoney; payment_id: string; reason?: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['idempotency_key', 'amount_money', 'payment_id']);
    return this.post('/refunds', params);
  }

  public async createCustomer(params: Record<string, any>): Promise<APIResponse<any>> {
    return this.post('/customers', params);
  }

  public async getCustomer(params: { customer_id: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['customer_id']);
    return this.get(`/customers/${encodeURIComponent(params.customer_id)}`);
  }

  public async createOrder(params: { idempotency_key: string; order: Record<string, any> }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['idempotency_key', 'order']);
    return this.post('/orders', params);
  }

  private cleanParams(params: Record<string, any>): Record<string, any> {
    const clean: Record<string, any> = {};
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === '') continue;
      clean[key] = value;
    }
    return clean;
  }
}
