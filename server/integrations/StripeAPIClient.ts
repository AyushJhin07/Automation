// STRIPE API CLIENT
// Auto-generated API client for Stripe integration

import { BaseAPIClient } from './BaseAPIClient';

export interface StripeAPIClientConfig {
  apiKey: string;
}

export class StripeAPIClient extends BaseAPIClient {
  protected baseUrl: string;
  private config: StripeAPIClientConfig;

  constructor(config: StripeAPIClientConfig) {
    super();
    this.config = config;
    this.baseUrl = 'https://api.stripe.com';
  }

  /**
   * Get authentication headers
   */
  protected getAuthHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.config.apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Apps-Script-Automation/1.0'
    };
  }

  /**
   * Test API connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.makeRequest('GET', '/');
      return response.status === 200;
      return true;
    } catch (error) {
      console.error(`❌ ${this.constructor.name} connection test failed:`, error);
      return false;
    }
  }


  /**
   * Create a new customer
   */
  async createCustomer({ email: string, name?: string, phone?: string, description?: string, metadata?: Record<string, any> }: { email: string, name?: string, phone?: string, description?: string, metadata?: Record<string, any> }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/create_customer', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Create Customer failed: ${error}`);
    }
  }

  /**
   * Create a payment intent
   */
  async createPaymentIntent({ amount: number, currency: string, customerId?: string, description?: string, metadata?: Record<string, any> }: { amount: number, currency: string, customerId?: string, description?: string, metadata?: Record<string, any> }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/create_payment_intent', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Create Payment Intent failed: ${error}`);
    }
  }

  /**
   * Create a subscription
   */
  async createSubscription({ customerId: string, priceId: string, trialPeriodDays?: number, metadata?: Record<string, any> }: { customerId: string, priceId: string, trialPeriodDays?: number, metadata?: Record<string, any> }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/create_subscription', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Create Subscription failed: ${error}`);
    }
  }

  /**
   * Create a refund
   */
  async createRefund({ paymentIntentId: string, amount?: number, reason?: string }: { paymentIntentId: string, amount?: number, reason?: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/create_refund', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Create Refund failed: ${error}`);
    }
  }


  /**
   * Poll for Trigger when payment is successful
   */
  async pollPaymentSucceeded({ minAmount?: number }: { minAmount?: number }): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/payment_succeeded', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Payment Succeeded failed:`, error);
      return [];
    }
  }

  /**
   * Poll for Trigger when new subscription is created
   */
  async pollSubscriptionCreated(params: Record<string, any> = {}): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/subscription_created', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Subscription Created failed:`, error);
      return [];
    }
  }
}