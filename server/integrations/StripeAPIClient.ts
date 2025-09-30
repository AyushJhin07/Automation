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
    try {
      const resp = await fetch(`${this.baseURL}/account`, { headers: this.getAuthHeaders() });
      const data = await resp.json().catch(() => ({}));
      return resp.ok ? { success: true, data } : { success: false, error: data?.error?.message || `HTTP ${resp.status}` };
    } catch (error) {
      return { success: false, error: String(error) };
    }
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
    return this.formPost('/payment_intents', form);
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
    return this.formPost('/customers', form);
  }

  public async createRefund(params: { paymentIntentId: string; amount?: number; reason?: string }): Promise<APIResponse<any>> {
    const form = new URLSearchParams();
    form.set('payment_intent', params.paymentIntentId);
    if (params.amount) form.set('amount', String(params.amount));
    if (params.reason) form.set('reason', params.reason);
    return this.formPost('/refunds', form);
  }

  // Webhook management
  async registerWebhook(webhookUrl: string, events: string[], _secret?: string): Promise<APIResponse<{ webhookId: string; secret?: string }>> {
    try {
      const form = new URLSearchParams();
      form.set('url', webhookUrl);
      events.forEach(e => form.append('enabled_events[]', e));
      const resp = await fetch(`${this.baseURL}/webhook_endpoints`, {
        method: 'POST',
        headers: { ...this.getAuthHeaders(), 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString()
      });
      const data = await resp.json();
      if (!resp.ok) return { success: false, error: data?.error?.message || `HTTP ${resp.status}` };
      return { success: true, data: { webhookId: data.id, secret: data.secret } };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async unregisterWebhook(webhookId: string): Promise<APIResponse<void>> {
    try {
      const resp = await fetch(`${this.baseURL}/webhook_endpoints/${webhookId}`, {
        method: 'DELETE',
        headers: this.getAuthHeaders()
      });
      if (!resp.ok) return { success: false, error: `HTTP ${resp.status}` };
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async listWebhooks(): Promise<APIResponse<any[]>> {
    try {
      const resp = await fetch(`${this.baseURL}/webhook_endpoints`, { headers: this.getAuthHeaders() });
      const data = await resp.json();
      if (!resp.ok) return { success: false, error: `HTTP ${resp.status}` };
      return { success: true, data: data?.data || [] };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  private async formPost(path: string, form: URLSearchParams): Promise<APIResponse<any>> {
    try {
      const resp = await fetch(`${this.baseURL}${path}`, {
        method: 'POST',
        headers: { ...this.getAuthHeaders(), 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString()
      });
      const data = await resp.json().catch(() => ({}));
      return resp.ok ? { success: true, data } : { success: false, error: data?.error?.message || `HTTP ${resp.status}` };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }
}
