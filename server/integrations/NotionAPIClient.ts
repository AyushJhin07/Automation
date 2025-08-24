// NOTION API CLIENT
// Auto-generated API client for Notion integration

import { BaseAPIClient } from './BaseAPIClient';

export interface NotionAPIClientConfig {
  accessToken: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
}

export class NotionAPIClient extends BaseAPIClient {
  protected baseUrl: string;
  private config: NotionAPIClientConfig;

  constructor(config: NotionAPIClientConfig) {
    super();
    this.config = config;
    this.baseUrl = 'https://api.notion.com';
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
   * Create new Notion page
   */
  async createPage({ parent: Record<string, any>, properties: Record<string, any>, children?: any[] }: { parent: Record<string, any>, properties: Record<string, any>, children?: any[] }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/create_page', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Create Page failed: ${error}`);
    }
  }

  /**
   * Update existing page
   */
  async updatePage({ pageId: string, properties?: Record<string, any> }: { pageId: string, properties?: Record<string, any> }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/update_page', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Update Page failed: ${error}`);
    }
  }

  /**
   * Create entry in Notion database
   */
  async createDatabaseEntry({ databaseId: string, properties: Record<string, any> }: { databaseId: string, properties: Record<string, any> }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/create_database_entry', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Create Database Entry failed: ${error}`);
    }
  }

  /**
   * Query Notion database
   */
  async queryDatabase({ databaseId: string, filter?: Record<string, any>, sorts?: any[] }: { databaseId: string, filter?: Record<string, any>, sorts?: any[] }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/query_database', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Query Database failed: ${error}`);
    }
  }


  /**
   * Poll for Trigger when page is created
   */
  async pollPageCreated({ parentId?: string }: { parentId?: string }): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/page_created', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Page Created failed:`, error);
      return [];
    }
  }

  /**
   * Poll for Trigger when database entry is created
   */
  async pollDatabaseEntryCreated({ databaseId: string }: { databaseId: string }): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/database_entry_created', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Database Entry Created failed:`, error);
      return [];
    }
  }
}