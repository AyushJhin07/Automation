// WOOCOMMERCE API CLIENT - REAL IMPLEMENTATION
// Handles product management and order workflows using the WooCommerce REST API.

import { Buffer } from 'node:buffer';

import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

export interface WooCommerceCredentials extends APICredentials {
  baseUrl?: string;
  consumerKey?: string;
  consumerSecret?: string;
}

export interface WooCommerceProductInput extends Record<string, any> {
  name: string;
  type?: string;
  price?: string;
}

export interface WooCommerceProductUpdateInput extends Record<string, any> {
  product_id: number;
}

export interface WooCommerceListProductsParams {
  page?: number;
  per_page?: number;
  search?: string;
  sku?: string;
  status?: string;
}

export interface WooCommerceCreateOrderParams extends Record<string, any> {
  line_items?: Array<{ product_id: number; quantity: number; variation_id?: number; total?: string }>;
}

export class WoocommerceAPIClient extends BaseAPIClient {
  constructor(credentials: WooCommerceCredentials) {
    const baseUrl = WoocommerceAPIClient.normalizeBaseUrl(credentials.baseUrl ?? (credentials as any).storeUrl);
    if (!baseUrl) {
      throw new Error('WooCommerce integration requires a baseUrl (e.g. https://store.example.com/wp-json/wc/v3).');
    }

    super(baseUrl, credentials);

    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'create_product': this.createProduct.bind(this) as any,
      'get_product': this.getProduct.bind(this) as any,
      'update_product': this.updateProduct.bind(this) as any,
      'list_products': this.listProducts.bind(this) as any,
      'create_order': this.createOrder.bind(this) as any,
      'get_order': this.getOrder.bind(this) as any,
      'update_order': this.updateOrder.bind(this) as any,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    if (this.credentials.apiKey) {
      return { Authorization: `Basic ${this.credentials.apiKey}` };
    }

    const key = (this.credentials.consumerKey ?? (this.credentials as any).consumer_key) as string | undefined;
    const secret = (this.credentials.consumerSecret ?? (this.credentials as any).consumer_secret) as string | undefined;

    if (key && secret) {
      const token = Buffer.from(`${key}:${secret}`).toString('base64');
      return { Authorization: `Basic ${token}` };
    }

    throw new Error('WooCommerce integration requires either an API key or consumer key/secret pair.');
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/system_status');
  }

  public async createProduct(params: WooCommerceProductInput): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['name']);
    return this.post('/products', params);
  }

  public async getProduct(params: { product_id: number }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['product_id']);
    return this.get(`/products/${params.product_id}`);
  }

  public async updateProduct(params: WooCommerceProductUpdateInput): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['product_id']);
    const { product_id, ...payload } = params;
    return this.put(`/products/${product_id}`, payload);
  }

  public async listProducts(params: WooCommerceListProductsParams = {}): Promise<APIResponse<any>> {
    const query: Record<string, string> = {};
    if (params.page) query.page = String(Math.max(1, params.page));
    if (params.per_page) query.per_page = String(Math.max(1, Math.min(params.per_page, 100)));
    if (params.search) query.search = params.search;
    if (params.sku) query.sku = params.sku;
    if (params.status) query.status = params.status;

    const response = await this.get<any>(`/products${this.serializeQuery(query)}`);
    if (!response.success) {
      return response;
    }

    const headers = response.headers ?? {};
    const total = headers['x-wp-total'] ? Number(headers['x-wp-total']) : undefined;
    const totalPages = headers['x-wp-totalpages'] ? Number(headers['x-wp-totalpages']) : undefined;
    const currentPage = params.page ?? 1;
    const headerPerPage = headers['x-wp-per-page'] ? Number(headers['x-wp-per-page']) : undefined;
    const perPage = params.per_page ?? headerPerPage ?? 10;
    const nextPage = totalPages && currentPage < totalPages ? currentPage + 1 : null;

    return {
      success: true,
      data: {
        products: response.data ?? [],
        pagination: {
          total: total ?? null,
          totalPages: totalPages ?? null,
          perPage,
          currentPage,
          nextPage,
        }
      },
      headers: response.headers,
      statusCode: response.statusCode,
    };
  }

  public async createOrder(params: WooCommerceCreateOrderParams): Promise<APIResponse<any>> {
    return this.post('/orders', params);
  }

  public async getOrder(params: { order_id: number }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['order_id']);
    return this.get(`/orders/${params.order_id}`);
  }

  public async updateOrder(params: WooCommerceCreateOrderParams & { order_id: number }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['order_id']);
    const { order_id, ...payload } = params;
    return this.put(`/orders/${order_id}`, payload);
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

  private static normalizeBaseUrl(url?: string): string | null {
    if (!url) {
      return null;
    }
    const trimmed = url.replace(/\/$/, '');
    if (/\/wp-json\/wc\//i.test(trimmed)) {
      return trimmed;
    }
    return `${trimmed}/wp-json/wc/v3`;
  }
}
