// MAGENTO (ADOBE COMMERCE) API CLIENT - REAL IMPLEMENTATION
// Provides product management, customer creation, and order workflows.

import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

export interface MagentoCredentials extends APICredentials {
  baseUrl?: string;
}

export interface MagentoProductInput {
  product: Record<string, any>;
}

export interface MagentoProductUpdateInput {
  sku: string;
  product: Record<string, any>;
}

export interface MagentoSearchCriteria {
  filterGroups?: Array<{
    filters?: Array<{
      field?: string;
      value?: string | number | boolean;
      conditionType?: string;
    }>;
  }>;
  sortOrders?: Array<{
    field?: string;
    direction?: 'ASC' | 'DESC';
  }>;
  pageSize?: number;
  currentPage?: number;
}

export interface MagentoCreateOrderParams {
  entity: Record<string, any>;
}

export interface MagentoCreateCustomerParams {
  customer: Record<string, any>;
  password?: string;
  redirectUrl?: string;
}

export class MagentoAPIClient extends BaseAPIClient {
  constructor(credentials: MagentoCredentials) {
    const baseUrl = MagentoAPIClient.normalizeBaseUrl(credentials.baseUrl ?? (credentials as any).storeUrl);
    if (!baseUrl) {
      throw new Error('Magento integration requires a baseUrl (e.g. https://example.com/rest/V1).');
    }

    super(baseUrl, credentials);

    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'create_product': this.createProduct.bind(this) as any,
      'get_product': this.getProduct.bind(this) as any,
      'update_product': this.updateProduct.bind(this) as any,
      'delete_product': this.deleteProduct.bind(this) as any,
      'search_products': this.searchProducts.bind(this) as any,
      'create_order': this.createOrder.bind(this) as any,
      'get_order': this.getOrder.bind(this) as any,
      'create_customer': this.createCustomer.bind(this) as any,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const token = this.credentials.accessToken || this.credentials.apiKey || (this.credentials as any).adminToken;
    if (!token) {
      throw new Error('Magento integration requires an access token or API key.');
    }

    return {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/modules');
  }

  public async createProduct(params: MagentoProductInput): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['product']);
    return this.post('/products', this.removeUndefined({ product: params.product }));
  }

  public async getProduct(params: { sku: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['sku']);
    return this.get(`/products/${encodeURIComponent(params.sku)}`);
  }

  public async updateProduct(params: MagentoProductUpdateInput): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['sku', 'product']);
    return this.put(`/products/${encodeURIComponent(params.sku)}`, this.removeUndefined({ product: params.product }));
  }

  public async deleteProduct(params: { sku: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['sku']);
    return this.delete(`/products/${encodeURIComponent(params.sku)}`);
  }

  public async searchProducts(params: { searchCriteria?: MagentoSearchCriteria }): Promise<APIResponse<any>> {
    const query = this.buildSearchCriteriaQuery(params.searchCriteria);
    return this.get(`/products${query}`);
  }

  public async createOrder(params: MagentoCreateOrderParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['entity']);
    return this.post('/orders', this.removeUndefined({ entity: params.entity }));
  }

  public async getOrder(params: { id: number }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['id']);
    return this.get(`/orders/${params.id}`);
  }

  public async createCustomer(params: MagentoCreateCustomerParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['customer']);
    return this.post('/customers', this.removeUndefined(params));
  }

  private buildSearchCriteriaQuery(criteria?: MagentoSearchCriteria): string {
    if (!criteria) {
      return '';
    }

    const search = new URLSearchParams();

    criteria.filterGroups?.forEach((group, groupIndex) => {
      group.filters?.forEach((filter, filterIndex) => {
        if (filter.field) {
          search.append(`searchCriteria[filter_groups][${groupIndex}][filters][${filterIndex}][field]`, filter.field);
        }
        if (filter.value !== undefined) {
          search.append(`searchCriteria[filter_groups][${groupIndex}][filters][${filterIndex}][value]`, String(filter.value));
        }
        if (filter.conditionType) {
          search.append(`searchCriteria[filter_groups][${groupIndex}][filters][${filterIndex}][condition_type]`, filter.conditionType);
        }
      });
    });

    criteria.sortOrders?.forEach((order, index) => {
      if (order.field) {
        search.append(`searchCriteria[sortOrders][${index}][field]`, order.field);
      }
      if (order.direction) {
        search.append(`searchCriteria[sortOrders][${index}][direction]`, order.direction);
      }
    });

    if (criteria.pageSize) {
      search.append('searchCriteria[pageSize]', String(criteria.pageSize));
    }
    if (criteria.currentPage) {
      search.append('searchCriteria[currentPage]', String(criteria.currentPage));
    }

    const qs = search.toString();
    return qs ? `?${qs}` : '';
  }

  private removeUndefined<T extends Record<string, any>>(payload: T): T {
    Object.keys(payload).forEach(key => {
      if (payload[key] === undefined || payload[key] === null) {
        delete payload[key];
      }
    });
    return payload;
  }

  private static normalizeBaseUrl(url?: string): string | null {
    if (!url) {
      return null;
    }

    const trimmed = url.replace(/\/$/, '');
    if (/\/rest\//i.test(trimmed)) {
      return trimmed;
    }
    return `${trimmed}/rest/V1`;
  }
}
