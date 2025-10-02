import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

interface MagentoCredentials extends APICredentials {
  domain?: string;
  baseUrl?: string;
}

interface MagentoSearchCriteria {
  filterGroups?: Array<{ filters?: Array<{ field?: string; value?: string | number; conditionType?: string }> }>;
  sortOrders?: Array<{ field?: string; direction?: string }>;
  pageSize?: number;
  currentPage?: number;
}

export class MagentoAPIClient extends BaseAPIClient {
  constructor(credentials: MagentoCredentials) {
    const baseURL = credentials.baseUrl ??
      (credentials.domain ? `https://${credentials.domain}/rest/V1` : undefined);

    if (!baseURL) {
      throw new Error('Magento integration requires baseUrl or domain');
    }

    super(baseURL, credentials);

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
    const token = this.credentials.apiKey || this.credentials.accessToken || this.credentials.token;
    if (!token) {
      throw new Error('Magento integration requires apiKey or accessToken');
    }

    return {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/store/websites');
  }

  public async createProduct(params: { product: Record<string, any> }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['product']);
    return this.post('/products', params);
  }

  public async getProduct(params: { sku: string; editMode?: boolean; storeId?: number; forceReload?: boolean }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['sku']);
    const { sku, ...rest } = params;
    const query = this.buildQueryString(this.cleanParams(rest));
    return this.get(`/products/${encodeURIComponent(sku)}${query}`);
  }

  public async updateProduct(params: { sku: string; product: Record<string, any>; saveOptions?: boolean }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['sku', 'product']);
    const { sku, product, saveOptions } = params;
    const query = this.buildQueryString(this.cleanParams({ saveOptions }));
    return this.put(`/products/${encodeURIComponent(sku)}${query}`, { product });
  }

  public async deleteProduct(params: { sku: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['sku']);
    return this.delete(`/products/${encodeURIComponent(params.sku)}`);
  }

  public async searchProducts(params: { searchCriteria?: MagentoSearchCriteria } = {}): Promise<APIResponse<any>> {
    const qs = this.buildSearchCriteriaQuery(params.searchCriteria);
    return this.get(`/products${qs}`);
  }

  public async createOrder(params: { entity: Record<string, any> }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['entity']);
    return this.post('/orders', params);
  }

  public async getOrder(params: { id: number }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['id']);
    return this.get(`/orders/${params.id}`);
  }

  public async createCustomer(params: { customer: Record<string, any>; password?: string; redirectUrl?: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['customer']);
    return this.post('/customers', params);
  }

  private cleanParams(params: Record<string, any>): Record<string, any> {
    const clean: Record<string, any> = {};
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      clean[key] = value;
    }
    return clean;
  }

  private buildSearchCriteriaQuery(criteria?: MagentoSearchCriteria): string {
    if (!criteria) return '';
    const params = new URLSearchParams();

    if (criteria.pageSize !== undefined) {
      params.set('searchCriteria[pageSize]', String(criteria.pageSize));
    }
    if (criteria.currentPage !== undefined) {
      params.set('searchCriteria[currentPage]', String(criteria.currentPage));
    }

    criteria.filterGroups?.forEach((group, groupIndex) => {
      group.filters?.forEach((filter, filterIndex) => {
        if (filter.field !== undefined) {
          params.set(`searchCriteria[filterGroups][${groupIndex}][filters][${filterIndex}][field]`, String(filter.field));
        }
        if (filter.value !== undefined) {
          params.set(`searchCriteria[filterGroups][${groupIndex}][filters][${filterIndex}][value]`, String(filter.value));
        }
        if (filter.conditionType !== undefined) {
          params.set(`searchCriteria[filterGroups][${groupIndex}][filters][${filterIndex}][conditionType]`, String(filter.conditionType));
        }
      });
    });

    criteria.sortOrders?.forEach((order, orderIndex) => {
      if (order.field !== undefined) {
        params.set(`searchCriteria[sortOrders][${orderIndex}][field]`, String(order.field));
      }
      if (order.direction !== undefined) {
        params.set(`searchCriteria[sortOrders][${orderIndex}][direction]`, String(order.direction));
      }
    });

    const queryString = params.toString();
    return queryString ? `?${queryString}` : '';
  }
}
