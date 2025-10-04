// STRIPE API CLIENT (fixed)
// Implements minimal Stripe operations and webhook management using Stripe API

import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

export class StripeAPIClient extends BaseAPIClient {
  constructor(credentials: APICredentials) {
    super('https://api.stripe.com/v1', credentials);
    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'create_payment_intent': this.createPaymentIntent.bind(this) as any,
      'create_customer': this.createCustomer.bind(this) as any,
      'create_refund': this.createRefund.bind(this) as any,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const key = this.credentials.apiKey || this.credentials.accessToken || '';
    return { Authorization: `Bearer ${key}` };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/account');
  }

  public async createPaymentIntent(params: { amount: number; currency: string; customerId?: string; description?: string; metadata?: Record<string, any> }): Promise<APIResponse<any>> {
    const form = new URLSearchParams();
    form.set('amount', String(params.amount));
    form.set('currency', params.currency);
    if (params.customerId) form.set('customer', params.customerId);
    if (params.description) form.set('description', params.description);
    if (params.metadata) {
      for (const [k, v] of Object.entries(params.metadata)) {
        form.set(`metadata[${k}]`, String(v));
      }
    }
    return this.post('/payment_intents', form, { 'Content-Type': 'application/x-www-form-urlencoded' });
  }

  public async createCustomer(params: { email?: string; name?: string; phone?: string; description?: string; metadata?: Record<string, any> }): Promise<APIResponse<any>> {
    const form = new URLSearchParams();
    if (params.email) form.set('email', params.email);
    if (params.name) form.set('name', params.name);
    if (params.phone) form.set('phone', params.phone);
    if (params.description) form.set('description', params.description);
    if (params.metadata) {
      for (const [k, v] of Object.entries(params.metadata)) {
        form.set(`metadata[${k}]`, String(v));
      }
    }
    return this.post('/customers', form, { 'Content-Type': 'application/x-www-form-urlencoded' });
  }

  public async createRefund(params: { paymentIntentId: string; amount?: number; reason?: string }): Promise<APIResponse<any>> {
    const form = new URLSearchParams();
    form.set('payment_intent', params.paymentIntentId);
    if (params.amount) form.set('amount', String(params.amount));
    if (params.reason) form.set('reason', params.reason);
    return this.post('/refunds', form, { 'Content-Type': 'application/x-www-form-urlencoded' });
  }

  // Webhook management
  async registerWebhook(webhookUrl: string, events: string[], _secret?: string): Promise<APIResponse<{ webhookId: string; secret?: string }>> {
    const form = new URLSearchParams();
    form.set('url', webhookUrl);
    events.forEach(e => form.append('enabled_events[]', e));
    const response = await this.post<any>('/webhook_endpoints', form, {
      'Content-Type': 'application/x-www-form-urlencoded',
    });

    if (!response.success || !response.data) {
      return response as APIResponse<{ webhookId: string; secret?: string }>;
    }

    const payload = response.data as any;
    return {
      success: true,
      data: { webhookId: payload.id, secret: payload.secret },
      headers: response.headers,
      statusCode: response.statusCode,
    };
  }

  async unregisterWebhook(webhookId: string): Promise<APIResponse<void>> {
    const response = await this.delete(`/webhook_endpoints/${webhookId}`);
    return response.success ? { success: true, statusCode: response.statusCode, headers: response.headers } : response;
  }

  async listWebhooks(): Promise<APIResponse<any[]>> {
    const response = await this.get<any>('/webhook_endpoints');
    if (!response.success || !response.data) {
      return response as APIResponse<any[]>;
    }

    const items = Array.isArray(response.data?.data) ? response.data.data : [];
    return { success: true, data: items, headers: response.headers, statusCode: response.statusCode };
  }
}
