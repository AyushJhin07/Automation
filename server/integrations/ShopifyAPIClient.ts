// SHOPIFY API CLIENT - REAL IMPLEMENTATION
// Implements all Shopify functions with actual Shopify Admin API calls

import { BaseAPIClient, APICredentials, APIResponse } from './BaseAPIClient';

export interface ShopifyProduct {
  id: number;
  title: string;
  body_html: string;
  vendor: string;
  product_type: string;
  created_at: string;
  updated_at: string;
  published_at: string;
  template_suffix: string;
  status: 'active' | 'archived' | 'draft';
  published_scope: string;
  tags: string;
  admin_graphql_api_id: string;
  variants: ShopifyVariant[];
  options: ShopifyOption[];
  images: ShopifyImage[];
}

export interface ShopifyVariant {
  id: number;
  product_id: number;
  title: string;
  price: string;
  sku: string;
  position: number;
  inventory_policy: string;
  compare_at_price: string;
  fulfillment_service: string;
  inventory_management: string;
  option1: string;
  option2: string;
  option3: string;
  created_at: string;
  updated_at: string;
  taxable: boolean;
  barcode: string;
  grams: number;
  image_id: number;
  weight: number;
  weight_unit: string;
  inventory_item_id: number;
  inventory_quantity: number;
  old_inventory_quantity: number;
  requires_shipping: boolean;
  admin_graphql_api_id: string;
}

export interface ShopifyOrder {
  id: number;
  email: string;
  closed_at: string;
  created_at: string;
  updated_at: string;
  number: number;
  note: string;
  token: string;
  gateway: string;
  test: boolean;
  total_price: string;
  subtotal_price: string;
  total_weight: number;
  total_tax: string;
  taxes_included: boolean;
  currency: string;
  financial_status: string;
  confirmed: boolean;
  total_discounts: string;
  buyer_accepts_marketing: boolean;
  name: string;
  referring_site: string;
  landing_site: string;
  cancelled_at: string;
  cancel_reason: string;
  total_price_usd: string;
  checkout_token: string;
  reference: string;
  user_id: number;
  location_id: number;
  source_identifier: string;
  source_url: string;
  processed_at: string;
  device_id: number;
  phone: string;
  customer_locale: string;
  app_id: number;
  browser_ip: string;
  landing_site_ref: string;
  order_number: number;
  discount_applications: any[];
  discount_codes: any[];
  note_attributes: any[];
  payment_gateway_names: string[];
  processing_method: string;
  checkout_id: number;
  source_name: string;
  fulfillment_status: string;
  tax_lines: any[];
  tags: string;
  contact_email: string;
  order_status_url: string;
  presentment_currency: string;
  total_line_items_price_set: any;
  total_discounts_set: any;
  total_shipping_price_set: any;
  subtotal_price_set: any;
  total_price_set: any;
  total_tax_set: any;
  line_items: ShopifyLineItem[];
  fulfillments: any[];
  refunds: any[];
  total_tip_received: string;
  original_total_duties_set: any;
  current_total_duties_set: any;
  admin_graphql_api_id: string;
  shipping_lines: any[];
  billing_address: ShopifyAddress;
  shipping_address: ShopifyAddress;
  customer: ShopifyCustomer;
}

export interface ShopifyCustomer {
  id: number;
  email: string;
  accepts_marketing: boolean;
  created_at: string;
  updated_at: string;
  first_name: string;
  last_name: string;
  orders_count: number;
  state: string;
  total_spent: string;
  last_order_id: number;
  note: string;
  verified_email: boolean;
  multipass_identifier: string;
  tax_exempt: boolean;
  phone: string;
  tags: string;
  last_order_name: string;
  currency: string;
  addresses: ShopifyAddress[];
  accepts_marketing_updated_at: string;
  marketing_opt_in_level: string;
  tax_exemptions: any[];
  admin_graphql_api_id: string;
  default_address: ShopifyAddress;
}

export interface ShopifyAddress {
  id: number;
  customer_id: number;
  first_name: string;
  last_name: string;
  company: string;
  address1: string;
  address2: string;
  city: string;
  province: string;
  country: string;
  zip: string;
  phone: string;
  name: string;
  province_code: string;
  country_code: string;
  country_name: string;
  default: boolean;
}

export interface ShopifyLineItem {
  id: number;
  variant_id: number;
  title: string;
  quantity: number;
  sku: string;
  variant_title: string;
  vendor: string;
  fulfillment_service: string;
  product_id: number;
  requires_shipping: boolean;
  taxable: boolean;
  gift_card: boolean;
  name: string;
  variant_inventory_management: string;
  properties: any[];
  product_exists: boolean;
  fulfillable_quantity: number;
  grams: number;
  price: string;
  total_discount: string;
  fulfillment_status: string;
  price_set: any;
  total_discount_set: any;
  discount_allocations: any[];
  duties: any[];
  admin_graphql_api_id: string;
  tax_lines: any[];
}

export interface ShopifyOption {
  id: number;
  product_id: number;
  name: string;
  position: number;
  values: string[];
}

export interface ShopifyImage {
  id: number;
  product_id: number;
  position: number;
  created_at: string;
  updated_at: string;
  alt: string;
  width: number;
  height: number;
  src: string;
  variant_ids: number[];
  admin_graphql_api_id: string;
}

export class ShopifyAPIClient extends BaseAPIClient {
  private shopDomain: string;

  constructor(credentials: APICredentials & { shopDomain: string }) {
    super(`https://${credentials.shopDomain}.myshopify.com/admin/api/2023-10`, credentials);
    this.shopDomain = credentials.shopDomain;
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      'X-Shopify-Access-Token': this.credentials.accessToken || this.credentials.apiKey || ''
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/shop.json');
  }

  // ===== PRODUCT MANAGEMENT =====

  /**
   * Create a new product
   */
  public async createProduct(params: {
    title: string;
    body_html?: string;
    vendor?: string;
    product_type?: string;
    tags?: string;
    status?: 'active' | 'archived' | 'draft';
    images?: Array<{ src: string; alt?: string }>;
    variants?: Array<{ 
      option1?: string; 
      price: string; 
      sku?: string; 
      inventory_quantity?: number; 
    }>;
  }): Promise<APIResponse<{ product: ShopifyProduct }>> {
    this.validateRequiredParams(params, ['title']);

    const productData: any = {
      product: {
        title: params.title,
        body_html: params.body_html || '',
        vendor: params.vendor || '',
        product_type: params.product_type || '',
        tags: params.tags || '',
        status: params.status || 'draft'
      }
    };

    if (params.images?.length) {
      productData.product.images = params.images;
    }

    if (params.variants?.length) {
      productData.product.variants = params.variants;
    }

    return this.post('/products.json', productData);
  }

  /**
   * Update an existing product
   */
  public async updateProduct(params: {
    productId: string;
    title?: string;
    body_html?: string;
    status?: 'active' | 'archived' | 'draft';
    tags?: string;
  }): Promise<APIResponse<{ product: ShopifyProduct }>> {
    this.validateRequiredParams(params, ['productId']);

    const updateData: any = { product: {} };
    
    if (params.title) updateData.product.title = params.title;
    if (params.body_html) updateData.product.body_html = params.body_html;
    if (params.status) updateData.product.status = params.status;
    if (params.tags) updateData.product.tags = params.tags;

    return this.put(`/products/${params.productId}.json`, updateData);
  }

  /**
   * Get products from store
   */
  public async getProducts(params: {
    limit?: number;
    status?: string;
    vendor?: string;
    product_type?: string;
  } = {}): Promise<APIResponse<{ products: ShopifyProduct[] }>> {
    const queryParams: any = {
      limit: params.limit || 50
    };

    if (params.status) queryParams.status = params.status;
    if (params.vendor) queryParams.vendor = params.vendor;
    if (params.product_type) queryParams.product_type = params.product_type;

    return this.get(`/products.json${this.buildQueryString(queryParams)}`);
  }

  /**
   * Delete a product
   */
  public async deleteProduct(params: {
    productId: string;
  }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['productId']);

    return this.delete(`/products/${params.productId}.json`);
  }

  // ===== ORDER MANAGEMENT =====

  /**
   * Get orders from store
   */
  public async getOrders(params: {
    status?: 'open' | 'closed' | 'cancelled';
    financial_status?: string;
    fulfillment_status?: string;
    limit?: number;
  } = {}): Promise<APIResponse<{ orders: ShopifyOrder[] }>> {
    const queryParams: any = {
      limit: params.limit || 50
    };

    if (params.status) queryParams.status = params.status;
    if (params.financial_status) queryParams.financial_status = params.financial_status;
    if (params.fulfillment_status) queryParams.fulfillment_status = params.fulfillment_status;

    return this.get(`/orders.json${this.buildQueryString(queryParams)}`);
  }

  /**
   * Update order details
   */
  public async updateOrder(params: {
    orderId: string;
    note?: string;
    tags?: string;
    email?: string;
  }): Promise<APIResponse<{ order: ShopifyOrder }>> {
    this.validateRequiredParams(params, ['orderId']);

    const updateData: any = { order: {} };
    
    if (params.note) updateData.order.note = params.note;
    if (params.tags) updateData.order.tags = params.tags;
    if (params.email) updateData.order.email = params.email;

    return this.put(`/orders/${params.orderId}.json`, updateData);
  }

  /**
   * Create fulfillment for order
   */
  public async fulfillOrder(params: {
    orderId: string;
    line_items?: Array<{ id: number; quantity: number }>;
    tracking_number?: string;
    tracking_company?: string;
    notify_customer?: boolean;
  }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['orderId']);

    const fulfillmentData: any = {
      fulfillment: {
        notify_customer: params.notify_customer !== false
      }
    };

    if (params.line_items?.length) {
      fulfillmentData.fulfillment.line_items = params.line_items;
    }

    if (params.tracking_number) {
      fulfillmentData.fulfillment.tracking_number = params.tracking_number;
    }

    if (params.tracking_company) {
      fulfillmentData.fulfillment.tracking_company = params.tracking_company;
    }

    return this.post(`/orders/${params.orderId}/fulfillments.json`, fulfillmentData);
  }

  // ===== CUSTOMER MANAGEMENT =====

  /**
   * Create a new customer
   */
  public async createCustomer(params: {
    first_name: string;
    last_name: string;
    email: string;
    phone?: string;
    tags?: string;
    accepts_marketing?: boolean;
  }): Promise<APIResponse<{ customer: ShopifyCustomer }>> {
    this.validateRequiredParams(params, ['first_name', 'last_name', 'email']);

    const customerData = {
      customer: {
        first_name: params.first_name,
        last_name: params.last_name,
        email: params.email,
        phone: params.phone || '',
        tags: params.tags || '',
        accepts_marketing: params.accepts_marketing || false
      }
    };

    return this.post('/customers.json', customerData);
  }

  /**
   * Update customer information
   */
  public async updateCustomer(params: {
    customerId: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    tags?: string;
  }): Promise<APIResponse<{ customer: ShopifyCustomer }>> {
    this.validateRequiredParams(params, ['customerId']);

    const updateData: any = { customer: {} };
    
    if (params.first_name) updateData.customer.first_name = params.first_name;
    if (params.last_name) updateData.customer.last_name = params.last_name;
    if (params.email) updateData.customer.email = params.email;
    if (params.tags) updateData.customer.tags = params.tags;

    return this.put(`/customers/${params.customerId}.json`, updateData);
  }

  /**
   * Search for customers
   */
  public async searchCustomers(params: {
    query: string;
    limit?: number;
  }): Promise<APIResponse<{ customers: ShopifyCustomer[] }>> {
    this.validateRequiredParams(params, ['query']);

    const queryParams = {
      query: params.query,
      limit: params.limit || 50
    };

    return this.get(`/customers/search.json${this.buildQueryString(queryParams)}`);
  }

  // ===== INVENTORY MANAGEMENT =====

  /**
   * Update product inventory levels
   */
  public async updateInventory(params: {
    inventory_item_id: string;
    location_id: string;
    available: number;
  }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['inventory_item_id', 'location_id', 'available']);

    const inventoryData = {
      inventory_level: {
        inventory_item_id: parseInt(params.inventory_item_id),
        location_id: parseInt(params.location_id),
        available: params.available
      }
    };

    return this.post('/inventory_levels/set.json', inventoryData);
  }

  // ===== WEBHOOK MANAGEMENT =====

  /**
   * Create webhook for order events
   */
  public async createOrderWebhook(webhookUrl: string, topic: string = 'orders/create'): Promise<APIResponse<any>> {
    const webhookData = {
      webhook: {
        topic: topic,
        address: webhookUrl,
        format: 'json'
      }
    };

    return this.post('/webhooks.json', webhookData);
  }

  /**
   * List existing webhooks
   */
  public async listWebhooks(): Promise<APIResponse<{ webhooks: any[] }>> {
    return this.get('/webhooks.json');
  }

  // ===== HELPER METHODS =====

  /**
   * Get shop information
   */
  public async getShopInfo(): Promise<APIResponse<any>> {
    return this.get('/shop.json');
  }

  /**
   * Get locations (for inventory management)
   */
  public async getLocations(): Promise<APIResponse<{ locations: any[] }>> {
    return this.get('/locations.json');
  }
}