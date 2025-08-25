// EGNYTE API CLIENT
// Auto-generated API client for Egnyte integration

import { BaseAPIClient } from './BaseAPIClient';

export interface EgnyteAPIClientConfig {
  accessToken: string;
  baseUrl?: string;
}

export class EgnyteAPIClient extends BaseAPIClient {
  protected baseUrl: string;
  private config: EgnyteAPIClientConfig;

  constructor(config: EgnyteAPIClientConfig) {
    super();
    this.config = config;
    this.baseUrl = config.baseUrl || 'https://{{domain}}.egnyte.com/pubapi';
  }

  /**
   * Get authentication headers
   */
  protected getAuthHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.config.accessToken}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Apps-Script-Automation/1.0'
    };
  }

  /**
   * Test API connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.makeRequest('GET', '/v1/userinfo');
      return response.status === 200;
    } catch (error) {
      console.error(`❌ ${this.constructor.name} connection test failed:`, error);
      return false;
    }
  }

  /**
   * Create a new record
   */
  async createRecord(data: Record<string, any>): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/records', { 
        body: JSON.stringify(data)
      });
      return response.data;
    } catch (error) {
      console.error(`❌ ${this.constructor.name} create record failed:`, error);
      throw error;
    }
  }

  /**
   * Update an existing record
   */
  async updateRecord(id: string, data: Record<string, any>): Promise<any> {
    try {
      const response = await this.makeRequest('PUT', `/records/${id}`, { 
        body: JSON.stringify(data)
      });
      return response.data;
    } catch (error) {
      console.error(`❌ ${this.constructor.name} update record failed:`, error);
      throw error;
    }
  }

  /**
   * Get a record by ID
   */
  async getRecord(id: string): Promise<any> {
    try {
      const response = await this.makeRequest('GET', `/records/${id}`);
      return response.data;
    } catch (error) {
      console.error(`❌ ${this.constructor.name} get record failed:`, error);
      throw error;
    }
  }

  /**
   * List records with optional filters
   */
  async listRecords(filters?: Record<string, any>): Promise<any> {
    try {
      const queryParams = filters ? '?' + new URLSearchParams(filters).toString() : '';
      const response = await this.makeRequest('GET', `/records${queryParams}`);
      return response.data;
    } catch (error) {
      console.error(`❌ ${this.constructor.name} list records failed:`, error);
      throw error;
    }
  }

  /**
   * Delete a record by ID
   */
  async deleteRecord(id: string): Promise<boolean> {
    try {
      const response = await this.makeRequest('DELETE', `/records/${id}`);
      return response.status === 200 || response.status === 204;
    } catch (error) {
      console.error(`❌ ${this.constructor.name} delete record failed:`, error);
      throw error;
    }
  }
}