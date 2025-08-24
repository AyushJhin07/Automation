// AIRTABLE API CLIENT
// Auto-generated API client for Airtable integration

import { BaseAPIClient } from './BaseAPIClient';

export interface AirtableAPIClientConfig {
  apiKey: string;
}

export class AirtableAPIClient extends BaseAPIClient {
  protected baseUrl: string;
  private config: AirtableAPIClientConfig;

  constructor(config: AirtableAPIClientConfig) {
    super();
    this.config = config;
    this.baseUrl = 'https://api.airtable.com';
  }

  /**
   * Get authentication headers
   */
  protected getAuthHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.config.apiKey}`,
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
      return true;
    } catch (error) {
      console.error(`❌ ${this.constructor.name} connection test failed:`, error);
      return false;
    }
  }


  /**
   * Create new record in table
   */
  async createRecord({ baseId: string, tableId: string, fields: Record<string, any> }: { baseId: string, tableId: string, fields: Record<string, any> }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/create_record', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Create Record failed: ${error}`);
    }
  }

  /**
   * Update existing record
   */
  async updateRecord({ baseId: string, tableId: string, recordId: string, fields: Record<string, any> }: { baseId: string, tableId: string, recordId: string, fields: Record<string, any> }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/update_record', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Update Record failed: ${error}`);
    }
  }

  /**
   * Delete record from table
   */
  async deleteRecord({ baseId: string, tableId: string, recordId: string }: { baseId: string, tableId: string, recordId: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/delete_record', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Delete Record failed: ${error}`);
    }
  }

  /**
   * List records from table
   */
  async listRecords({ baseId: string, tableId: string, maxRecords?: number, view?: string, filterByFormula?: string }: { baseId: string, tableId: string, maxRecords?: number, view?: string, filterByFormula?: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/list_records', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`List Records failed: ${error}`);
    }
  }


  /**
   * Poll for Trigger when new record is created
   */
  async pollRecordCreated({ baseId: string, tableId: string }: { baseId: string, tableId: string }): Promise<any[]> {
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
   * Poll for Trigger when record is updated
   */
  async pollRecordUpdated({ baseId: string, tableId: string }: { baseId: string, tableId: string }): Promise<any[]> {
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