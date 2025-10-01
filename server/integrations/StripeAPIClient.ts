import { BaseAPIClient, APICredentials, APIResponse } from './BaseAPIClient';
import { getErrorMessage } from '../types/common';

export interface StripeCredentials extends APICredentials {
  apiKey: string;
}

interface ListChargesParams {
  limit?: number;
  customer?: string;
  starting_after?: string;
}

interface CreateChargeParams {
  amount: number;
  currency: string;
  customer?: string;
  source?: string;
  description?: string;
  metadata?: Record<string, string>;
}

interface CreateCustomerParams {
  email?: string;
  name?: string;
  description?: string;
  metadata?: Record<string, string>;
}

interface CreateRefundParams {
  charge: string;
  amount?: number;
  reason?: string;
}

/**
 * Stripe client using the REST endpoints with form-encoded payloads.
 */
export class StripeAPIClient extends BaseAPIClient {
  constructor(credentials: StripeCredentials) {
    if (!credentials?.apiKey) {
      throw new Error('Stripe integration requires an API key');
    }

    super('https://api.stripe.com/v1', credentials);
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.credentials.apiKey}`
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/charges?limit=1');
  }

  public async listCharges(params: ListChargesParams = {}): Promise<APIResponse<any>> {
    return this.get(`/charges${this.buildQuery(params)}`);
  }

  public async createCharge(params: CreateChargeParams): Promise<APIResponse<any>> {
    return this.formRequest('POST', '/charges', params);
  }

  public async retrieveCustomer(params: { customerId: string }): Promise<APIResponse<any>> {
    return this.get(`/customers/${encodeURIComponent(params.customerId)}`);
  }

  public async createCustomer(params: CreateCustomerParams): Promise<APIResponse<any>> {
    return this.formRequest('POST', '/customers', params);
  }

  public async createRefund(params: CreateRefundParams): Promise<APIResponse<any>> {
    return this.formRequest('POST', '/refunds', params);
  }

  public async invoicePaid(params: ListChargesParams = {}): Promise<APIResponse<any>> {
    return this.get(`/invoices${this.buildQuery({ ...params, limit: params.limit ?? 25 })}`);
  }

  private buildQuery(params: Record<string, any>): string {
    const usp = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        usp.set(key, String(value));
      }
    });
    const qs = usp.toString();
    return qs ? `?${qs}` : '';
  }

  private async formRequest(method: 'POST' | 'DELETE' | 'GET' | 'PATCH' | 'PUT', endpoint: string, data: Record<string, any>): Promise<APIResponse<any>> {
    const url = `${this.baseURL}${endpoint}`;
    const body = new URLSearchParams();
    Object.entries(data).forEach(([key, value]) => {
      if (value === undefined || value === null) {
        return;
      }
      if (typeof value === 'object' && !Array.isArray(value)) {
        Object.entries(value).forEach(([innerKey, innerValue]) => {
          if (innerValue !== undefined && innerValue !== null) {
            body.append(`${key}[${innerKey}]`, String(innerValue));
          }
        });
        return;
      }
      body.append(key, Array.isArray(value) ? value.join(',') : String(value));
    });

    try {
      const response = await fetch(url, {
        method,
        headers: {
          ...this.getAuthHeaders(),
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'ScriptSpark-Automation/1.0'
        },
        body
      });

      const text = await response.text();
      let dataResponse: any = undefined;
      try {
        dataResponse = text ? JSON.parse(text) : undefined;
      } catch {
        dataResponse = text;
      }

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
          statusCode: response.status,
          data: dataResponse
        };
      }

      return {
        success: true,
        data: dataResponse,
        statusCode: response.status,
        headers: Object.fromEntries(response.headers.entries())
      };
    } catch (error) {
      return { success: false, error: getErrorMessage(error) };
    }
  }
}
