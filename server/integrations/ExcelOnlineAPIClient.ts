// EXCEL ONLINE API CLIENT
// Auto-generated API client for Excel Online integration

import { BaseAPIClient } from './BaseAPIClient';

export interface ExcelOnlineAPIClientConfig {
  accessToken: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
}

export class ExcelOnlineAPIClient extends BaseAPIClient {
  protected baseUrl: string;
  private config: ExcelOnlineAPIClientConfig;

  constructor(config: ExcelOnlineAPIClientConfig) {
    super();
    this.config = config;
    this.baseUrl = 'https://graph.microsoft.com/v1.0';
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
      return true;
    } catch (error) {
      console.error(`❌ ${this.constructor.name} connection test failed:`, error);
      return false;
    }
  }


  /**
   * Add a row to an Excel worksheet
   */
  async addRow({ workbookId: string, worksheet: string, values: any[] }: { workbookId: string, worksheet: string, values: any[] }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/add_row', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Add Row failed: ${error}`);
    }
  }

  /**
   * Update a row in an Excel worksheet
   */
  async updateRow({ workbookId: string, worksheet: string, rowIndex: number, values: any[] }: { workbookId: string, worksheet: string, rowIndex: number, values: any[] }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/update_row', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Update Row failed: ${error}`);
    }
  }

  /**
   * Get values from a range in Excel
   */
  async getRange({ workbookId: string, worksheet: string, rangeA1: string }: { workbookId: string, worksheet: string, rangeA1: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/get_range', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Get Range failed: ${error}`);
    }
  }

  /**
   * Create a table in Excel
   */
  async createTable({ workbookId: string, worksheet: string, rangeA1: string }: { workbookId: string, worksheet: string, rangeA1: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/create_table', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Create Table failed: ${error}`);
    }
  }


  /**
   * Poll for Triggered when a row is added
   */
  async pollRowAdded({ workbookId: string, worksheet: string }: { workbookId: string, worksheet: string }): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/row_added', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Row Added failed:`, error);
      return [];
    }
  }

  /**
   * Poll for Triggered when a row is updated
   */
  async pollRowUpdated({ workbookId: string, worksheet: string }: { workbookId: string, worksheet: string }): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/row_updated', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Row Updated failed:`, error);
      return [];
    }
  }
}