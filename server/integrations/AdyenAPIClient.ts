// Production-ready Adyen API client

import { APIResponse, BaseAPIClient } from './BaseAPIClient';

export interface AdyenAPIClientConfig {
  apiKey: string;
  merchantAccount?: string;
  baseUrl?: string;
}

const DEFAULT_BASE_URL = 'https://checkout-test.adyen.com/v71';

type PaymentAmount = {
  currency: string;
  value: number;
};

type CreatePaymentParams = {
  amount: PaymentAmount;
  reference: string;
  paymentMethod: Record<string, unknown>;
  returnUrl: string;
  merchantAccount?: string;
  shopperEmail?: string;
  shopperReference?: string;
  countryCode?: string;
  [key: string]: unknown;
};

type ModifyPaymentParams = {
  paymentPspReference: string;
  amount: PaymentAmount;
  merchantAccount?: string;
  reference?: string;
  [key: string]: unknown;
};

export class AdyenAPIClient extends BaseAPIClient {
  private merchantAccount?: string;

  constructor(config: AdyenAPIClientConfig) {
    const baseUrl = (config.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
    super(baseUrl, { apiKey: config.apiKey, merchantAccount: config.merchantAccount });
    this.merchantAccount = config.merchantAccount;

    this.registerHandlers({
      'test_connection': () => this.testConnection(),
      'create_payment': params => this.createPayment(params as CreatePaymentParams),
      'capture_payment': params => this.capturePayment(params as ModifyPaymentParams),
      'refund_payment': params => this.refundPayment(params as ModifyPaymentParams)
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      'X-API-Key': String(this.credentials.apiKey || ''),
      'Content-Type': 'application/json'
    };
  }

  private resolveMerchantAccount(params?: { merchantAccount?: string }): string | undefined {
    return (
      params?.merchantAccount ||
      (this.credentials as { merchantAccount?: string }).merchantAccount ||
      this.merchantAccount
    );
  }

  public async testConnection(): Promise<APIResponse> {
    const merchantAccount = this.resolveMerchantAccount();
    if (!merchantAccount) {
      return {
        success: false,
        error: 'Merchant account is required to test the Adyen connection.'
      };
    }

    return this.post('/paymentMethods', { merchantAccount });
  }

  public async createPayment(params: CreatePaymentParams): Promise<APIResponse> {
    const merchantAccount = this.resolveMerchantAccount(params);
    if (!merchantAccount) {
      return { success: false, error: 'merchantAccount is required to create a payment.' };
    }

    const payload = {
      ...params,
      merchantAccount
    };

    return this.post('/payments', payload);
  }

  public async capturePayment(params: ModifyPaymentParams): Promise<APIResponse> {
    const merchantAccount = this.resolveMerchantAccount(params);
    if (!merchantAccount) {
      return { success: false, error: 'merchantAccount is required to capture a payment.' };
    }

    if (!params.paymentPspReference) {
      return { success: false, error: 'paymentPspReference is required to capture a payment.' };
    }

    const endpoint = `/payments/${encodeURIComponent(params.paymentPspReference)}/captures`;
    const payload = {
      amount: params.amount,
      merchantAccount,
      reference: params.reference
    };

    return this.post(endpoint, payload);
  }

  public async refundPayment(params: ModifyPaymentParams): Promise<APIResponse> {
    const merchantAccount = this.resolveMerchantAccount(params);
    if (!merchantAccount) {
      return { success: false, error: 'merchantAccount is required to refund a payment.' };
    }

    if (!params.paymentPspReference) {
      return { success: false, error: 'paymentPspReference is required to refund a payment.' };
    }

    const endpoint = `/payments/${encodeURIComponent(params.paymentPspReference)}/refunds`;
    const payload = {
      amount: params.amount,
      merchantAccount,
      reference: params.reference
    };

    return this.post(endpoint, payload);
  }
}
