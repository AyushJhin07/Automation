// VICTOROPS API CLIENT
// Auto-generated API client for VictorOps integration

import { BaseAPIClient } from './BaseAPIClient';

export interface VictoropsAPIClientConfig {
  accessToken: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
}

export class VictoropsAPIClient extends BaseAPIClient {
  protected baseUrl: string;
  private config: VictoropsAPIClientConfig;

  constructor(config: VictoropsAPIClientConfig) {
    super();
    this.config = config;
    this.baseUrl = 'https://api.example.com';
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
      const response = await this.makeRequest('GET', '/');
      return response.status === 200;
    } catch (error) {
      console.error(`❌ ${this.constructor.name} connection test failed:`, error);
      return false;
    }
  }


  /**
   * Create a new record in VictorOps
   */
  async createRecord(params: { data: Record<string, any> }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/create_record', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Create Record failed: ${error}`);
    }
  }

  /**
   * Update an existing record in VictorOps
   */
  async updateRecord(params: { id: string, data: Record<string, any> }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/update_record', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Update Record failed: ${error}`);
    }
  }

  /**
   * Retrieve a record from VictorOps
   */
  async getRecord(params: { id: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/get_record', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Get Record failed: ${error}`);
    }
  }

  /**
   * List records from VictorOps
   */
  async listRecords(params: { limit?: number, filter?: Record<string, any> }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/list_records', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`List Records failed: ${error}`);
    }
  }

  /**
   * Delete a record from VictorOps
   */
  async deleteRecord(params: { id: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/delete_record', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Delete Record failed: ${error}`);
    }
  }


  /**
   * Poll for Triggered when a new record is created in VictorOps
   */
  async pollRecordCreated(params: Record<string, any> = {}): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/record_created', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Record Created failed:`, error);
      return [];
    }
  }

  /**
   * Poll for Triggered when a record is updated in VictorOps
   */
  async pollRecordUpdated(params: Record<string, any> = {}): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/record_updated', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Record Updated failed:`, error);
      return [];
    }
  }
}