// CONFLUENCE API CLIENT
// Auto-generated API client for Confluence integration

import { BaseAPIClient } from './BaseAPIClient';

export interface ConfluenceAPIClientConfig {
  accessToken: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
}

export class ConfluenceAPIClient extends BaseAPIClient {
  protected baseUrl: string;
  private config: ConfluenceAPIClientConfig;

  constructor(config: ConfluenceAPIClientConfig) {
    super();
    this.config = config;
    this.baseUrl = 'https://api.atlassian.com/ex/confluence';
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
   * Create a new Confluence page
   */
  async createPage({ space_key: string, title: string, content: string, parent_id?: string, labels?: any[] }: { space_key: string, title: string, content: string, parent_id?: string, labels?: any[] }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/create_page', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Create Page failed: ${error}`);
    }
  }

  /**
   * Update an existing Confluence page
   */
  async updatePage({ page_id: string, title?: string, content?: string, version_number: number }: { page_id: string, title?: string, content?: string, version_number: number }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/update_page', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Update Page failed: ${error}`);
    }
  }

  /**
   * Delete a Confluence page
   */
  async deletePage({ page_id: string }: { page_id: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/delete_page', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Delete Page failed: ${error}`);
    }
  }

  /**
   * Add a comment to a Confluence page
   */
  async addComment({ page_id: string, comment: string, parent_comment_id?: string }: { page_id: string, comment: string, parent_comment_id?: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/add_comment', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Add Comment failed: ${error}`);
    }
  }

  /**
   * Add an attachment to a Confluence page
   */
  async addAttachment({ page_id: string, filename: string, file_data: string, comment?: string }: { page_id: string, filename: string, file_data: string, comment?: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/add_attachment', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Add Attachment failed: ${error}`);
    }
  }


  /**
   * Poll for Triggered when a new page is created
   */
  async pollPageCreated(params: Record<string, any> = {}): Promise<any[]> {
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
   * Poll for Triggered when a page is updated
   */
  async pollPageUpdated(params: Record<string, any> = {}): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/page_updated', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Page Updated failed:`, error);
      return [];
    }
  }
}