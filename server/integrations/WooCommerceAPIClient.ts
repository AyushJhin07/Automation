import { Buffer } from 'node:buffer';
import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

interface WooCommerceCredentials extends APICredentials {
  domain?: string;
  baseUrl?: string;
}

interface WooCommerceListProductsParams extends Record<string, any> {
  context?: 'view' | 'edit';
  page?: number;
  per_page?: number;
  search?: string;
  after?: string;
  before?: string;
  include?: number[];
  exclude?: number[];
  parent?: number[];
  parent_exclude?: number[];
  slug?: string;
  status?: string;
  type?: string;
  sku?: string;
  featured?: boolean;
  category?: string;
  tag?: string;
  shipping_class?: string;
  attribute?: string;
  attribute_term?: string;
  tax_class?: string;
  min_price?: string;
  max_price?: string;
  stock_status?: string;
  orderby?: string;
  order?: string;
}

export class WooCommerceAPIClient extends BaseAPIClient {
  constructor(credentials: WooCommerceCredentials) {
    const baseURL = credentials.baseUrl ??
      (credentials.domain ? `https://${credentials.domain}/wp-json/wc/v3` : undefined);

    if (!baseURL) {
      throw new Error('WooCommerce integration requires baseUrl or domain');
    }

    super(baseURL, credentials);

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
    const token = this.credentials.apiKey || this.credentials.accessToken || this.credentials.token;
    if (!token) {
      throw new Error('WooCommerce integration requires apiKey or accessToken');
    }

    const headerValue = this.normalizeBasicToken(String(token));
    return {
      Authorization: headerValue,
      Accept: 'application/json',
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/system_status');
  }

  public async createProduct(params: Record<string, any>): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['name']);
    return this.post('/products', params);
  }

  public async getProduct(params: { id: number }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['id']);
    return this.get(`/products/${params.id}`);
  }

  public async updateProduct(params: { id: number } & Record<string, any>): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['id']);
    const { id, ...updates } = params;
    return this.put(`/products/${id}`, updates);
  }

  public async listProducts(params: WooCommerceListProductsParams = {}): Promise<APIResponse<any>> {
    const query = this.transformArrayParams(params);
    const qs = this.buildQueryString(query);
    return this.get(`/products${qs}`);
  }

  public async createOrder(params: Record<string, any>): Promise<APIResponse<any>> {
    return this.post('/orders', params);
  }

  public async getOrder(params: { id: number }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['id']);
    return this.get(`/orders/${params.id}`);
  }

  public async updateOrder(params: { id: number } & Record<string, any>): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['id']);
    const { id, ...updates } = params;
    return this.put(`/orders/${id}`, updates);
  }

  private transformArrayParams(params: WooCommerceListProductsParams): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        result[key] = value.join(',');
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  private normalizeBasicToken(token: string): string {
    if (token.startsWith('Basic ')) {
      return token;
    }

    if (token.includes(' ')) {
      // If token already looks like "Basic abc", just return it.
      const [scheme, rest] = token.split(' ', 2);
      if (scheme.toLowerCase() === 'basic') {
        return `Basic ${rest}`;
      }
    }

    if (token.includes(':')) {
      const encoded = Buffer.from(token).toString('base64');
      return `Basic ${encoded}`;
    }

    return `Basic ${token}`;
  }
}
