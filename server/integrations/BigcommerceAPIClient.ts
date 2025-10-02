// BIGCOMMERCE API CLIENT - REAL IMPLEMENTATION
// Supports product management and order creation workflows.

import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

export interface BigcommerceCredentials extends APICredentials {
  storeHash: string;
  clientId?: string;
  baseUrl?: string;
}

export interface BigcommerceProductInput {
  name: string;
  type: 'physical' | 'digital';
  sku?: string;
  description?: string;
  price: number;
  weight?: number;
  categories?: number[];
  is_visible?: boolean;
  inventory_level?: number;
}

export interface BigcommerceProductUpdateInput extends Partial<BigcommerceProductInput> {
  product_id: number;
}

export interface BigcommerceListProductsParams {
  limit?: number;
  page?: number;
  name?: string;
  sku?: string;
  type?: 'physical' | 'digital';
  'categories:in'?: number[];
}

export interface BigcommerceOrderProductInput {
  product_id: number;
  quantity: number;
  price_inc_tax?: number;
  price_ex_tax?: number;
  variant_id?: number;
}

export interface BigcommerceCreateOrderParams {
  customer_id?: number;
  status_id?: number;
  products: BigcommerceOrderProductInput[];
  billing_address?: Record<string, any>;
  shipping_address?: Record<string, any>;
  channel_id?: number;
  payment_method?: string;
}

interface BigcommerceListResponse<T> {
  data?: T[];
  meta?: {
    pagination?: {
      total?: number;
      count?: number;
      per_page?: number;
      current_page?: number;
      total_pages?: number;
      links?: {
        next?: string;
        previous?: string;
      };
    };
  };
}

const DEFAULT_PAGE_SIZE = 50;

export class BigcommerceAPIClient extends BaseAPIClient {
  constructor(credentials: BigcommerceCredentials) {
    const storeHash = credentials.storeHash || (credentials as any).store_hash;
    if (!storeHash) {
      throw new Error('BigCommerce integration requires a storeHash.');
    }

    const baseUrl = (credentials.baseUrl ?? `https://api.bigcommerce.com/stores/${storeHash}/v3`).replace(/\/$/, '');
    super(baseUrl, credentials);

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
    const token = this.credentials.accessToken || this.credentials.apiKey || (this.credentials as any).xAuthToken;
    if (!token) {
      throw new Error('BigCommerce integration requires an access token or API key.');
    }

    const headers: Record<string, string> = {
      'X-Auth-Token': token,
      'Accept': 'application/json',
    };

    const clientId = this.credentials.clientId || (this.credentials as any).xAuthClient;
    if (clientId) {
      headers['X-Auth-Client'] = clientId;
    }

    return headers;
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/catalog/summary');
  }

  public async createProduct(params: BigcommerceProductInput): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['name', 'type', 'price']);

    const payload = this.removeUndefined({
      name: params.name,
      type: params.type,
      sku: params.sku,
      description: params.description,
      price: params.price,
      weight: params.weight,
      categories: params.categories,
      is_visible: params.is_visible ?? true,
      inventory_level: params.inventory_level,
    });

    return this.post('/catalog/products', payload);
  }

  public async updateProduct(params: BigcommerceProductUpdateInput): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['product_id']);
    const { product_id, ...rest } = params;
    const payload = this.removeUndefined(rest);

    return this.put(`/catalog/products/${product_id}`, payload);
  }

  public async getProduct(params: { product_id: number }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['product_id']);
    return this.get(`/catalog/products/${params.product_id}`);
  }

  public async listProducts(params: BigcommerceListProductsParams = {}): Promise<APIResponse<any>> {
    const query: Record<string, string> = {};
    const limit = params.limit ?? DEFAULT_PAGE_SIZE;
    query.limit = String(Math.max(1, Math.min(limit, 250)));

    if (params.page) query.page = String(Math.max(1, params.page));
    if (params.name) query.name = params.name;
    if (params.sku) query.sku = params.sku;
    if (params.type) query.type = params.type;
    if (Array.isArray(params['categories:in']) && params['categories:in'].length) {
      query['categories:in'] = params['categories:in'].join(',');
    }

    const response = await this.get<BigcommerceListResponse<any>>(`/catalog/products${this.serializeQuery(query)}`);
    if (!response.success) {
      return response;
    }

    const raw = response.data ?? {};
    const pagination = raw.meta?.pagination ?? {};
    const nextPage = typeof pagination.links?.next === 'string' ? (pagination.current_page ?? 0) + 1 : null;

    return {
      success: true,
      data: {
        products: raw.data ?? [],
        pagination: {
          total: pagination.total ?? null,
          count: pagination.count ?? null,
          perPage: pagination.per_page ?? limit,
          currentPage: pagination.current_page ?? params.page ?? 1,
          totalPages: pagination.total_pages ?? null,
          nextPage,
        }
      }
    };
  }

  public async createOrder(params: BigcommerceCreateOrderParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['products']);

    const lineItems = (params.products || []).map(item => this.removeUndefined({
      product_id: item.product_id,
      quantity: item.quantity,
      price_inc_tax: item.price_inc_tax,
      price_ex_tax: item.price_ex_tax,
      variant_id: item.variant_id,
    }));

    const payload = this.removeUndefined({
      customer_id: params.customer_id,
      status_id: params.status_id,
      channel_id: params.channel_id,
      payment_method: params.payment_method,
      billing_address: params.billing_address,
      shipping_addresses: params.shipping_address ? [params.shipping_address] : undefined,
      products: lineItems,
      line_items: lineItems,
    });

    return this.post('/orders', payload);
  }

  private removeUndefined<T extends Record<string, any>>(payload: T): T {
    Object.keys(payload).forEach(key => {
      if (payload[key] === undefined || payload[key] === null) {
        delete payload[key];
      }
    });
    return payload;
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
