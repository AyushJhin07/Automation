import { Buffer } from 'node:buffer';

import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient.js';

export interface RazorpayCredentials extends APICredentials {
  keyId: string;
  keySecret: string;
}

type PaginationParams = {
  from?: number;
  to?: number;
  count?: number;
  skip?: number;
};

type CreateOrderParams = {
  amount: number;
  currency?: string;
  receipt?: string;
  notes?: Record<string, string>;
  [key: string]: any;
};

type CapturePaymentParams = {
  payment_id: string;
  amount: number;
  currency?: string;
};

type CreateRefundParams = {
  payment_id: string;
  amount?: number;
  speed?: 'normal' | 'optimum';
  notes?: Record<string, string>;
  receipt?: string;
};

const RETRY_CONFIG = {
  retries: 2,
  initialDelayMs: 500,
  maxDelayMs: 2000
};

export class RazorpayAPIClient extends BaseAPIClient {
  constructor(credentials: RazorpayCredentials) {
    if (!credentials.keyId || !credentials.keySecret) {
      throw new Error('Razorpay integration requires keyId and keySecret');
    }

    super('https://api.razorpay.com/v1', credentials);

    this.registerHandlers({
      test_connection: () => this.testConnection(),
      create_order: params => this.createOrder(params as CreateOrderParams),
      get_orders: params => this.getOrders(params as PaginationParams),
      get_payments: params => this.getPayments(params as PaginationParams),
      capture_payment: params => this.capturePayment(params as CapturePaymentParams),
      create_refund: params => this.createRefund(params as CreateRefundParams)
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const keyId = this.credentials.keyId;
    const keySecret = this.credentials.keySecret;
    const token = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
    return {
      Authorization: `Basic ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.withRetries(() => this.get('/payments' + this.buildQueryString({ count: 1 })), RETRY_CONFIG);
  }

  private async createOrder(params: CreateOrderParams): Promise<APIResponse<any>> {
    if (typeof params.amount !== 'number' || params.amount < 100) {
      return { success: false, error: 'create_order requires an amount of at least 100 (smallest currency unit)' };
    }
    const payload = this.removeUndefined({ currency: 'INR', ...params });
    return this.withRetries(() => this.post('/orders', payload), RETRY_CONFIG);
  }

  private async getOrders(params: PaginationParams = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString(this.normalizePagination(params));
    return this.withRetries(() => this.get(`/orders${query}`), RETRY_CONFIG);
  }

  private async getPayments(params: PaginationParams = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString(this.normalizePagination(params));
    return this.withRetries(() => this.get(`/payments${query}`), RETRY_CONFIG);
  }

  private async capturePayment(params: CapturePaymentParams): Promise<APIResponse<any>> {
    if (!params.payment_id) {
      return { success: false, error: 'capture_payment requires payment_id' };
    }
    if (typeof params.amount !== 'number' || params.amount < 100) {
      return { success: false, error: 'capture_payment requires an amount of at least 100 (smallest currency unit)' };
    }
    const payload = this.removeUndefined({ amount: params.amount, currency: params.currency ?? 'INR' });
    return this.withRetries(
      () => this.post(`/payments/${encodeURIComponent(params.payment_id)}/capture`, payload),
      RETRY_CONFIG
    );
  }

  private async createRefund(params: CreateRefundParams): Promise<APIResponse<any>> {
    if (!params.payment_id) {
      return { success: false, error: 'create_refund requires payment_id' };
    }
    const payload = this.removeUndefined({
      amount: params.amount,
      speed: params.speed,
      notes: params.notes,
      receipt: params.receipt
    });
    return this.withRetries(
      () => this.post(`/payments/${encodeURIComponent(params.payment_id)}/refunds`, payload),
      RETRY_CONFIG
    );
  }

  private normalizePagination(params: PaginationParams): Record<string, any> {
    const normalized: Record<string, any> = {};
    if (typeof params.from === 'number') {
      normalized.from = params.from;
    }
    if (typeof params.to === 'number') {
      normalized.to = params.to;
    }
    if (typeof params.count === 'number') {
      normalized.count = Math.min(Math.max(params.count, 1), 100);
    }
    if (typeof params.skip === 'number' && params.skip >= 0) {
      normalized.skip = params.skip;
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
}
