// SNOWFLAKE API CLIENT
// Auto-generated API client for Snowflake integration

import { BaseAPIClient } from './BaseAPIClient';

export interface SnowflakeAPIClientConfig {
  accessToken: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
}

export class SnowflakeAPIClient extends BaseAPIClient {
  protected baseUrl: string;
  private config: SnowflakeAPIClientConfig;

  constructor(config: SnowflakeAPIClientConfig) {
    super();
    this.config = config;
    this.baseUrl = 'https://{account}.snowflakecomputing.com/api/v2';
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
   * Execute a SQL query in Snowflake
   */
  async executeQuery({ sql: string, warehouse?: string, database?: string, schema?: string, timeout?: number }: { sql: string, warehouse?: string, database?: string, schema?: string, timeout?: number }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/execute_query', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Execute Query failed: ${error}`);
    }
  }

  /**
   * Load data into a Snowflake table
   */
  async copyIntoTable({ table_name: string, stage_location: string, file_format?: string, copy_options?: Record<string, any> }: { table_name: string, stage_location: string, file_format?: string, copy_options?: Record<string, any> }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/copy_into_table', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Copy Into Table failed: ${error}`);
    }
  }

  /**
   * Create a new stage for data loading
   */
  async createStage({ stage_name: string, stage_type: string, location?: string, credentials?: Record<string, any> }: { stage_name: string, stage_type: string, location?: string, credentials?: Record<string, any> }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/create_stage', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Create Stage failed: ${error}`);
    }
  }

  /**
   * Retrieve data from a Snowflake table
   */
  async getTableData({ table_name: string, limit?: number, where_clause?: string, order_by?: string }: { table_name: string, limit?: number, where_clause?: string, order_by?: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/get_table_data', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Get Table Data failed: ${error}`);
    }
  }


  /**
   * Poll for Triggered when a Snowflake task completes
   */
  async pollTaskCompleted(params: Record<string, any> = {}): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/task_completed', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Task Completed failed:`, error);
      return [];
    }
  }
}