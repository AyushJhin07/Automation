// NOTION ENHANCED API CLIENT
// Auto-generated API client for Notion Enhanced integration

import { BaseAPIClient } from './BaseAPIClient';

export interface NotionEnhancedAPIClientConfig {
  accessToken: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
}

export class NotionEnhancedAPIClient extends BaseAPIClient {
  protected baseUrl: string;
  private config: NotionEnhancedAPIClientConfig;

  constructor(config: NotionEnhancedAPIClientConfig) {
    super();
    this.config = config;
    this.baseUrl = 'https://api.notion.com/v1';
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
   * Update an existing page
   */
  async updatePage({ pageId: string, properties: Record<string, any> }: { pageId: string, properties: Record<string, any> }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/update_page', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Update Page failed: ${error}`);
    }
  }

  /**
   * Archive a page
   */
  async archivePage({ pageId: string }: { pageId: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/archive_page', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Archive Page failed: ${error}`);
    }
  }

  /**
   * Query a database with filters and sorts
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
   * Append a block to a page
   */
  async appendBlock({ pageId: string, blockJson: Record<string, any> }: { pageId: string, blockJson: Record<string, any> }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/append_block', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Append Block failed: ${error}`);
    }
  }

  /**
   * Create a new database
   */
  async createDatabase({ parentPageId: string, schema: Record<string, any> }: { parentPageId: string, schema: Record<string, any> }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/create_database', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Create Database failed: ${error}`);
    }
  }

  /**
   * Update database schema
   */
  async updateDatabase({ databaseId: string, schema: Record<string, any> }: { databaseId: string, schema: Record<string, any> }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/update_database', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Update Database failed: ${error}`);
    }
  }

  /**
   * Invite user to a page
   */
  async inviteUser({ pageId: string, email: string, role: string }: { pageId: string, email: string, role: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/invite_user', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Invite User failed: ${error}`);
    }
  }


  /**
   * Poll for Triggered when a page is updated
   */
  async pollPageUpdated({ databaseId: string }: { databaseId: string }): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/page_updated', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Page Updated failed:`, error);
      return [];
    }
  }

  /**
   * Poll for Triggered when a comment is added
   */
  async pollCommentAdded({ pageId: string }: { pageId: string }): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/comment_added', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Comment Added failed:`, error);
      return [];
    }
  }
}