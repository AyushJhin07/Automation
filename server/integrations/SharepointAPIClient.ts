// SHAREPOINT API CLIENT
// Auto-generated API client for SharePoint integration

import { BaseAPIClient } from './BaseAPIClient';

export interface SharepointAPIClientConfig {
  accessToken: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
}

export class SharepointAPIClient extends BaseAPIClient {
  protected baseUrl: string;
  private config: SharepointAPIClientConfig;

  constructor(config: SharepointAPIClientConfig) {
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
   * Create a file in SharePoint
   */
  async createFile({ siteId: string, driveId: string, path: string, base64: string }: { siteId: string, driveId: string, path: string, base64: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/create_file', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Create File failed: ${error}`);
    }
  }

  /**
   * Get a file from SharePoint
   */
  async getFile({ siteId: string, driveId: string, path: string }: { siteId: string, driveId: string, path: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/get_file', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Get File failed: ${error}`);
    }
  }

  /**
   * Create an item in a SharePoint list
   */
  async createListItem({ siteId: string, listId: string, fields: Record<string, any> }: { siteId: string, listId: string, fields: Record<string, any> }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/create_list_item', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Create List Item failed: ${error}`);
    }
  }

  /**
   * Update a SharePoint list item
   */
  async updateListItem({ siteId: string, listId: string, itemId: string, fields: Record<string, any> }: { siteId: string, listId: string, itemId: string, fields: Record<string, any> }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/update_list_item', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Update List Item failed: ${error}`);
    }
  }

  /**
   * Create a sharing link for an item
   */
  async shareLink({ itemId: string, type: string }: { itemId: string, type: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/share_link', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Share Link failed: ${error}`);
    }
  }


  /**
   * Poll for Triggered when a file is added
   */
  async pollFileAdded({ siteId: string, driveId: string, path?: string }: { siteId: string, driveId: string, path?: string }): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/file_added', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling File Added failed:`, error);
      return [];
    }
  }

  /**
   * Poll for Triggered when a file is updated
   */
  async pollFileUpdated({ siteId: string, driveId: string, path?: string }: { siteId: string, driveId: string, path?: string }): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/file_updated', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling File Updated failed:`, error);
      return [];
    }
  }

  /**
   * Poll for Triggered when a list item is added
   */
  async pollListItemAdded({ siteId: string, listId: string }: { siteId: string, listId: string }): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/list_item_added', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling List Item Added failed:`, error);
      return [];
    }
  }
}