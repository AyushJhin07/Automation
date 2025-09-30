// GENERIC API CLIENT - CONCRETE IMPLEMENTATION
// A concrete implementation of BaseAPIClient for apps with real Apps Script implementations
// but no specific client-side API integration needed

import { BaseAPIClient, APICredentials, APIResponse } from './BaseAPIClient';

export class GenericAPIClient extends BaseAPIClient {
  constructor(credentials: APICredentials = {}) {
    super('', credentials);
  }

  protected getAuthHeaders(): Record<string, string> {
    throw new Error(
      `${this.constructor.name} is a placeholder and should not be used for real API traffic.`
    );
  }

  protected async executeRequest(
    method: string,
    endpoint: string,
    data?: any,
    headers?: Record<string, string>
  ): Promise<APIResponse> {
    throw new Error(
      `${this.constructor.name} cannot execute ${method.toUpperCase()} ${endpoint} because the connector is not implemented.`
    );
  }

  // Basic test connection method
  async testConnection(): Promise<APIResponse> {
    throw new Error(
      `${this.constructor.name} cannot test connections because the connector is not implemented.`
    );
  }
}

