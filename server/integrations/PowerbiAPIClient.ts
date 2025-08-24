// POWER BI API CLIENT
// Auto-generated API client for Power BI integration

import { BaseAPIClient } from './BaseAPIClient';

export interface PowerbiAPIClientConfig {
  accessToken: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
}

export class PowerbiAPIClient extends BaseAPIClient {
  protected baseUrl: string;
  private config: PowerbiAPIClientConfig;

  constructor(config: PowerbiAPIClientConfig) {
    super();
    this.config = config;
    this.baseUrl = 'https://api.powerbi.com/v1.0';
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
   * Query a Power BI dataset
   */
  async queryDataset({ datasetId: string, sql: string }: { datasetId: string, sql: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/query_dataset', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Query Dataset failed: ${error}`);
    }
  }

  /**
   * Trigger a dataset refresh
   */
  async triggerRefresh({ datasetId: string }: { datasetId: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/trigger_refresh', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Trigger Refresh failed: ${error}`);
    }
  }

  /**
   * Add rows to a dataset table
   */
  async addRows({ datasetId: string, tableName: string, rows: any[] }: { datasetId: string, tableName: string, rows: any[] }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/add_rows', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Add Rows failed: ${error}`);
    }
  }


  /**
   * Poll for Triggered when a dataset refresh completes
   */
  async pollDatasetRefreshCompleted({ datasetId: string }: { datasetId: string }): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/dataset_refresh_completed', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Dataset Refresh Completed failed:`, error);
      return [];
    }
  }
}