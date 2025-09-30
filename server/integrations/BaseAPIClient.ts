// BASE API CLIENT FOR ALL APPLICATION INTEGRATIONS
// Provides common functionality for HTTP requests, authentication, rate limiting, etc.

import { getErrorMessage } from '../types/common';

export interface APICredentials {
  apiKey?: string;
  accessToken?: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  webhookUrl?: string;
  [key: string]: any;
}

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  statusCode?: number;
  headers?: Record<string, string>;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetTime: number;
}

export abstract class BaseAPIClient {
  protected baseURL: string;
  protected credentials: APICredentials;
  protected rateLimitInfo?: RateLimitInfo;
  private __functionHandlers?: Map<string, (params: Record<string, any>) => Promise<APIResponse<any>>>;

  constructor(baseURL: string, credentials: APICredentials) {
    this.baseURL = baseURL;
    this.credentials = credentials;
    this.__functionHandlers = new Map();
  }

  /**
   * Make authenticated HTTP request
   */
  protected async makeRequest<T = any>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    endpoint: string,
    data?: any,
    headers: Record<string, string> = {}
  ): Promise<APIResponse<T>> {
    try {
      const url = `${this.baseURL}${endpoint}`;
      
      // Add authentication headers
      const authHeaders = this.getAuthHeaders();
      const requestHeaders = {
        'Content-Type': 'application/json',
        'User-Agent': 'ScriptSpark-Automation/1.0',
        ...authHeaders,
        ...headers
      };

      // Check rate limits before making request
      if (this.rateLimitInfo && this.isRateLimited()) {
        const waitTime = this.rateLimitInfo.resetTime - Date.now();
        if (waitTime > 0) {
          await this.sleep(waitTime);
        }
      }

      const requestOptions: RequestInit = {
        method,
        headers: requestHeaders,
        body: data ? JSON.stringify(data) : undefined
      };

      const response = await fetch(url, requestOptions);
      
      // Update rate limit info from response headers
      this.updateRateLimitInfo(response.headers);

      const responseText = await response.text();
      let responseData: T;

      try {
        responseData = responseText ? JSON.parse(responseText) : null;
      } catch (parseError) {
        responseData = responseText as any;
      }

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
          statusCode: response.status,
          data: responseData
        };
      }

      return {
        success: true,
        data: responseData,
        statusCode: response.status,
        headers: Object.fromEntries(response.headers.entries())
      };

    } catch (error) {
      return {
        success: false,
        error: getErrorMessage(error),
        statusCode: 0
      };
    }
  }

  /**
   * Register a function handler for generic execution
   */
  protected registerHandler(functionId: string, handler: (params: Record<string, any>) => Promise<APIResponse<any>>): void {
    if (!this.__functionHandlers) this.__functionHandlers = new Map();
    this.__functionHandlers.set(String(functionId).toLowerCase(), handler);
  }

  /**
   * Register multiple function handlers at once
   */
  protected registerHandlers(handlers: Record<string, (params: Record<string, any>) => Promise<APIResponse<any>>>): void {
    for (const [id, fn] of Object.entries(handlers)) {
      this.registerHandler(id, fn);
    }
  }

  /**
   * Generic function execution entry point
   * Concrete clients can rely on registered handlers to avoid IntegrationManager switches
   */
  public async execute(functionId: string, params: Record<string, any> = {}): Promise<APIResponse<any>> {
    const id = String(functionId || '').toLowerCase();
    const handlers = this.__functionHandlers || new Map();
    const handler = handlers.get(id);
    if (!handler) {
      return { success: false, error: `Unknown function handler: ${functionId}` };
    }
    try {
      return await handler(params);
    } catch (error) {
      return { success: false, error: getErrorMessage(error) };
    }
  }

  /**
   * GET request
   */
  protected async get<T = any>(endpoint: string, headers?: Record<string, string>): Promise<APIResponse<T>> {
    return this.makeRequest<T>('GET', endpoint, undefined, headers);
  }

  /**
   * POST request
   */
  protected async post<T = any>(endpoint: string, data?: any, headers?: Record<string, string>): Promise<APIResponse<T>> {
    return this.makeRequest<T>('POST', endpoint, data, headers);
  }

  /**
   * PUT request
   */
  protected async put<T = any>(endpoint: string, data?: any, headers?: Record<string, string>): Promise<APIResponse<T>> {
    return this.makeRequest<T>('PUT', endpoint, data, headers);
  }

  /**
   * DELETE request
   */
  protected async delete<T = any>(endpoint: string, headers?: Record<string, string>): Promise<APIResponse<T>> {
    return this.makeRequest<T>('DELETE', endpoint, undefined, headers);
  }

  /**
   * PATCH request
   */
  protected async patch<T = any>(endpoint: string, data?: any, headers?: Record<string, string>): Promise<APIResponse<T>> {
    return this.makeRequest<T>('PATCH', endpoint, data, headers);
  }

  /**
   * Get authentication headers (to be implemented by subclasses)
   */
  protected abstract getAuthHeaders(): Record<string, string>;

  /**
   * Test API connection
   */
  public abstract testConnection(): Promise<APIResponse<any>>;

  /**
   * Update credentials
   */
  public updateCredentials(credentials: APICredentials): void {
    this.credentials = { ...this.credentials, ...credentials };
  }

  /**
   * Check if currently rate limited
   */
  protected isRateLimited(): boolean {
    if (!this.rateLimitInfo) return false;
    return this.rateLimitInfo.remaining <= 0 && Date.now() < this.rateLimitInfo.resetTime;
  }

  /**
   * Update rate limit info from response headers
   */
  protected updateRateLimitInfo(headers: Headers): void {
    const limit = headers.get('x-ratelimit-limit') || headers.get('x-rate-limit-limit');
    const remaining = headers.get('x-ratelimit-remaining') || headers.get('x-rate-limit-remaining');
    const reset = headers.get('x-ratelimit-reset') || headers.get('x-rate-limit-reset');

    if (limit && remaining && reset) {
      this.rateLimitInfo = {
        limit: parseInt(limit),
        remaining: parseInt(remaining),
        resetTime: parseInt(reset) * 1000 // Convert to milliseconds
      };
    }
  }

  /**
   * Sleep for specified milliseconds
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Build query string from parameters
   */
  protected buildQueryString(params: Record<string, any>): string {
    const searchParams = new URLSearchParams();
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          value.forEach(item => searchParams.append(key, String(item)));
        } else {
          searchParams.append(key, String(value));
        }
      }
    });

    const queryString = searchParams.toString();
    return queryString ? `?${queryString}` : '';
  }

  /**
   * Validate required parameters
   */
  protected validateRequiredParams(params: Record<string, any>, required: string[]): void {
    const missing = required.filter(param => 
      params[param] === undefined || params[param] === null || params[param] === ''
    );

    if (missing.length > 0) {
      throw new Error(`Missing required parameters: ${missing.join(', ')}`);
    }
  }

  /**
   * Handle pagination for APIs that support it
   */
  protected async getAllPages<T>(
    endpoint: string,
    pageParam: string = 'page',
    limitParam: string = 'limit',
    limit: number = 100
  ): Promise<APIResponse<T[]>> {
    const allResults: T[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const queryParams = { [pageParam]: page, [limitParam]: limit };
      const response = await this.get<{ data: T[]; hasMore?: boolean; total?: number }>(
        `${endpoint}${this.buildQueryString(queryParams)}`
      );

      if (!response.success) {
        return response as APIResponse<T[]>;
      }

      if (response.data?.data) {
        allResults.push(...response.data.data);
        hasMore = response.data.hasMore !== false && response.data.data.length === limit;
      } else {
        hasMore = false;
      }

      page++;
    }

    return {
      success: true,
      data: allResults
    };
  }

  /**
   * Register a webhook with the external service
   * Override this method in specific API clients
   */
  async registerWebhook(webhookUrl: string, events: string[], secret?: string): Promise<APIResponse<{ webhookId: string; secret?: string }>> {
    console.log(`🪝 Registering webhook for ${this.constructor.name}: ${webhookUrl}`);
    
    // Default implementation - override in specific clients
    return {
      success: false,
      error: 'Webhook registration not implemented for this service'
    };
  }

  /**
   * Unregister a webhook from the external service
   * Override this method in specific API clients
   */
  async unregisterWebhook(webhookId: string): Promise<APIResponse<void>> {
    console.log(`🗑️ Unregistering webhook ${webhookId} for ${this.constructor.name}`);
    
    // Default implementation - override in specific clients
    return {
      success: false,
      error: 'Webhook unregistration not implemented for this service'
    };
  }

  /**
   * List registered webhooks for this service
   * Override this method in specific API clients
   */
  async listWebhooks(): Promise<APIResponse<any[]>> {
    console.log(`📋 Listing webhooks for ${this.constructor.name}`);
    
    // Default implementation - override in specific clients
    return {
      success: false,
      error: 'Webhook listing not implemented for this service'
    };
  }

  /**
   * Validate webhook signature
   * Override this method in specific API clients for custom validation
   */
  validateWebhookSignature(payload: string, signature: string, secret: string): boolean {
    console.log(`🔒 Validating webhook signature for ${this.constructor.name}`);
    
    // Default implementation - override in specific clients
    // This is handled by WebhookManager with vendor-specific logic
    return true;
  }
}
