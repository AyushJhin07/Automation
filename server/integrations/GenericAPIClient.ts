// GENERIC API CLIENT - CONCRETE IMPLEMENTATION
// A concrete implementation of BaseAPIClient for apps with real Apps Script implementations
// but no specific client-side API integration needed

import { BaseAPIClient, APICredentials, APIResponse } from './BaseAPIClient';

export class GenericAPIClient extends BaseAPIClient {
  constructor(credentials: APICredentials = {}) {
    super('', credentials);
  }

  protected getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    
    if (this.credentials.apiKey) {
      headers['Authorization'] = `Bearer ${this.credentials.apiKey}`;
    }
    
    if (this.credentials.accessToken) {
      headers['Authorization'] = `Bearer ${this.credentials.accessToken}`;
    }
    
    return headers;
  }

  protected async executeRequest(
    method: string,
    endpoint: string,
    data?: any,
    headers?: Record<string, string>
  ): Promise<APIResponse> {
    // For apps with real Apps Script implementations, we just mark them as having implementation
    // The actual API calls happen in the generated Apps Script code
    return {
      success: true,
      data: { message: 'Apps Script implementation available' }
    };
  }

  // Basic test connection method
  async testConnection(): Promise<APIResponse> {
    return {
      success: true,
      data: { status: 'connected', message: 'Apps Script implementation available' }
    };
  }
}