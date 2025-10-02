import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

export interface BigCommerceCredentials extends APICredentials {
  storeHash?: string;
  store_hash?: string;
  baseUrl?: string;
  clientId?: string;
  client_id?: string;
}

type BigCommerceProductInput = {
  name?: string;
  type?: 'physical' | 'digital';
  sku?: string;
  description?: string;
  price?: number;
  weight?: number;
  categories?: number[];
  is_visible?: boolean;
  inventory_level?: number;
  [key: string]: any;
};

interface BigCommerceOrderProduct {
  product_id: number;
  quantity: number;
}

interface BigCommerceCreateOrderParams {
  customer_id?: number;
  products: BigCommerceOrderProduct[];
  billing_address?: Record<string, any>;
  shipping_address?: Record<string, any>;
}

interface BigCommerceListProductsParams {
  limit?: number;
  page?: number;
  name?: string;
  sku?: string;
  type?: 'physical' | 'digital';
  'categories:in'?: number[] | string;
}

export class BigCommerceAPIClient extends BaseAPIClient {
  constructor(credentials: BigCommerceCredentials) {
    const storeHash = credentials.storeHash ?? credentials.store_hash;
    const baseURL = credentials.baseUrl ??
      (storeHash ? `https://api.bigcommerce.com/stores/${storeHash}/v3` : undefined);

    if (!baseURL) {
      throw new Error('BigCommerce integration requires baseUrl or storeHash');
    }

    super(baseURL, credentials);

    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'create_product': this.createProduct.bind(this) as any,
      'update_product': this.updateProduct.bind(this) as any,
      'get_product': this.getProduct.bind(this) as any,
      'list_products': this.listProducts.bind(this) as any,
      'create_order': this.createOrder.bind(this) as any,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const token = this.credentials.apiKey || this.credentials.accessToken || this.credentials.token;
    if (!token) {
      throw new Error('BigCommerce integration requires apiKey or accessToken');
    }

    const headers: Record<string, string> = {
      'X-Auth-Token': String(token),
      Accept: 'application/json',
    };

    const clientId = this.credentials.clientId ?? this.credentials.client_id;
    if (clientId) {
      headers['X-Auth-Client'] = String(clientId);
    }

    return headers;
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get(`/catalog/products${this.buildQueryString({ limit: 1 })}`);
  }

  public async createProduct(params: BigCommerceProductInput): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['name', 'type', 'price']);
    return this.post('/catalog/products', params);
  }

  public async updateProduct(params: { product_id: number } & BigCommerceProductInput): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['product_id']);
    const { product_id, ...payload } = params;
    return this.put(`/catalog/products/${product_id}`, payload);
  }

  public async getProduct(params: { product_id: number }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['product_id']);
    return this.get(`/catalog/products/${params.product_id}`);
  }

  public async listProducts(params: BigCommerceListProductsParams = {}): Promise<APIResponse<any>> {
    const query: Record<string, any> = {};
    if (params.limit !== undefined) query.limit = params.limit;
    if (params.page !== undefined) query.page = params.page;
    if (params.name) query.name = params.name;
    if (params.sku) query.sku = params.sku;
    if (params.type) query.type = params.type;
    if (params['categories:in']) {
      const categories = params['categories:in'];
      query['categories:in'] = Array.isArray(categories) ? categories.join(',') : categories;
    }

    const qs = this.buildQueryString(query);
    return this.get(`/catalog/products${qs}`);
  }

  public async createOrder(params: BigCommerceCreateOrderParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['products']);

    const line_items = (params.products || []).map(item => ({
      product_id: item.product_id,
      quantity: item.quantity ?? 1,
    }));

    const payload: Record<string, any> = {
      customer_id: params.customer_id,
      line_items,
    };

    if (params.billing_address) {
      payload.billing_address = params.billing_address;
    }

    if (params.shipping_address) {
      payload.shipping_addresses = [params.shipping_address];
    }

    return this.post('/orders', payload);
  }
}
