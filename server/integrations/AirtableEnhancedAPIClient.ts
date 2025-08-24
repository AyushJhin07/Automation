// AIRTABLE ENHANCED API CLIENT
// Auto-generated API client for Airtable Enhanced integration

import { BaseAPIClient } from './BaseAPIClient';

export interface AirtableEnhancedAPIClientConfig {
  apiKey: string;
}

export class AirtableEnhancedAPIClient extends BaseAPIClient {
  protected baseUrl: string;
  private config: AirtableEnhancedAPIClientConfig;

  constructor(config: AirtableEnhancedAPIClientConfig) {
    super();
    this.config = config;
    this.baseUrl = 'https://api.airtable.com/v0';
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
   * Create a new record in a table
   */
  async createRecord({ baseId: string, table: string, fields: Record<string, any> }: { baseId: string, table: string, fields: Record<string, any> }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/create_record', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Create Record failed: ${error}`);
    }
  }

  /**
   * Update an existing record
   */
  async updateRecord({ baseId: string, table: string, recordId: string, fields: Record<string, any> }: { baseId: string, table: string, recordId: string, fields: Record<string, any> }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/update_record', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Update Record failed: ${error}`);
    }
  }

  /**
   * Create or update a record based on a key field
   */
  async upsertRecord({ baseId: string, table: string, keyField: string, fields: Record<string, any> }: { baseId: string, table: string, keyField: string, fields: Record<string, any> }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/upsert_record', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Upsert Record failed: ${error}`);
    }
  }

  /**
   * Bulk create or update multiple records
   */
  async bulkUpsert({ baseId: string, table: string, records: any[] }: { baseId: string, table: string, records: any[] }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/bulk_upsert', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Bulk Upsert failed: ${error}`);
    }
  }

  /**
   * Delete a record
   */
  async deleteRecord({ baseId: string, table: string, recordId: string }: { baseId: string, table: string, recordId: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/delete_record', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Delete Record failed: ${error}`);
    }
  }

  /**
   * Find records with filters
   */
  async findRecords({ baseId: string, table: string, filterFormula?: string, maxRecords?: number }: { baseId: string, table: string, filterFormula?: string, maxRecords?: number }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/find_records', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Find Records failed: ${error}`);
    }
  }


  /**
   * Poll for Triggered when a record is created
   */
  async pollRecordCreated({ baseId: string, table: string }: { baseId: string, table: string }): Promise<any[]> {
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
   * Poll for Triggered when a record is updated
   */
  async pollRecordUpdated({ baseId: string, table: string }: { baseId: string, table: string }): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/record_updated', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Record Updated failed:`, error);
      return [];
    }
  }

  /**
   * Poll for Triggered when a record is deleted
   */
  async pollRecordDeleted({ baseId: string, table: string }: { baseId: string, table: string }): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/record_deleted', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Record Deleted failed:`, error);
      return [];
    }
  }
}