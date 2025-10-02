// SQUARE API CLIENT - REAL IMPLEMENTATION
// Supports payments, orders, refunds, and customer management.

import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

const SQUARE_VERSION = '2023-10-18';

export interface SquareCredentials extends APICredentials {
  baseUrl?: string;
}

export interface SquareCreatePaymentParams {
  source_id: string;
  idempotency_key: string;
  amount_money: { amount: number; currency: string };
  location_id?: string;
  reference_id?: string;
  note?: string;
  autocomplete?: boolean;
  customer_id?: string;
}

export interface SquareListPaymentsParams {
  begin_time?: string;
  end_time?: string;
  sort_order?: 'ASC' | 'DESC';
  cursor?: string;
  location_id?: string;
  limit?: number;
}

export interface SquareCreateRefundParams {
  idempotency_key: string;
  payment_id: string;
  amount_money: { amount: number; currency: string };
  reason?: string;
}

export interface SquareCreateOrderParams {
  idempotency_key: string;
  order: Record<string, any>;
}

export class SquareAPIClient extends BaseAPIClient {
  constructor(credentials: SquareCredentials) {
    const baseUrl = (credentials.baseUrl ?? 'https://connect.squareup.com/v2').replace(/\/$/, '');
    super(baseUrl, credentials);

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
    const token = this.credentials.accessToken || this.credentials.apiKey;
    if (!token) {
      throw new Error('Square integration requires an access token.');
    }

    return {
      Authorization: `Bearer ${token}`,
      'Square-Version': SQUARE_VERSION,
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
    this.validateRequiredParams(params, ['payment_id']);
    return this.get(`/payments/${params.payment_id}`);
  }

  public async listPayments(params: SquareListPaymentsParams = {}): Promise<APIResponse<any>> {
    const query: Record<string, string> = {};
    if (params.begin_time) query.begin_time = params.begin_time;
    if (params.end_time) query.end_time = params.end_time;
    if (params.sort_order) query.sort_order = params.sort_order;
    if (params.cursor) query.cursor = params.cursor;
    if (params.location_id) query.location_id = params.location_id;
    if (params.limit) query.limit = String(Math.max(1, Math.min(params.limit, 100))); // Square max 100

    const response = await this.get<any>(`/payments${this.serializeQuery(query)}`);
    if (!response.success) {
      return response;
    }

    const payments = response.data?.payments ?? [];
    const cursor = response.data?.cursor ?? null;

    return {
      success: true,
      data: { payments, cursor },
      headers: response.headers,
      statusCode: response.statusCode,
    };
  }

  public async createRefund(params: SquareCreateRefundParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['idempotency_key', 'payment_id', 'amount_money']);
    return this.post('/refunds', params);
  }

  public async createCustomer(params: Record<string, any>): Promise<APIResponse<any>> {
    return this.post('/customers', params);
  }

  public async getCustomer(params: { customer_id: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['customer_id']);
    return this.get(`/customers/${params.customer_id}`);
  }

  public async createOrder(params: SquareCreateOrderParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['idempotency_key', 'order']);
    return this.post('/orders', params);
  }

  private serializeQuery(params: Record<string, string>): string {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        search.append(key, value);
      }
    }
    const qs = search.toString();
    return qs ? `?${qs}` : '';
  }
}
