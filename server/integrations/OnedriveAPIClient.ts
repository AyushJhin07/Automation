// ONEDRIVE API CLIENT
// Auto-generated API client for OneDrive integration

import { BaseAPIClient } from './BaseAPIClient';

export interface OnedriveAPIClientConfig {
  accessToken: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
}

export class OnedriveAPIClient extends BaseAPIClient {
  protected baseUrl: string;
  private config: OnedriveAPIClientConfig;

  constructor(config: OnedriveAPIClientConfig) {
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
   * Upload a file to OneDrive
   */
  async uploadFile({ folderId: string, name: string, base64: string }: { folderId: string, name: string, base64: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/upload_file', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Upload File failed: ${error}`);
    }
  }

  /**
   * Download a file from OneDrive
   */
  async downloadFile({ itemId: string }: { itemId: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/download_file', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Download File failed: ${error}`);
    }
  }

  /**
   * Move a file to another folder
   */
  async moveFile({ itemId: string, targetFolderId: string }: { itemId: string, targetFolderId: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/move_file', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Move File failed: ${error}`);
    }
  }

  /**
   * Create a sharing link for a file
   */
  async shareLink({ itemId: string, type: string }: { itemId: string, type: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/share_link', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Create Share Link failed: ${error}`);
    }
  }


  /**
   * Poll for Triggered when a file is created
   */
  async pollFileCreated({ folderId?: string }: { folderId?: string }): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/file_created', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling File Created failed:`, error);
      return [];
    }
  }

  /**
   * Poll for Triggered when a file is updated
   */
  async pollFileUpdated({ folderId?: string }: { folderId?: string }): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/file_updated', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling File Updated failed:`, error);
      return [];
    }
  }
}