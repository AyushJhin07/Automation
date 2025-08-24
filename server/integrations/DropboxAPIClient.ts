// DROPBOX API CLIENT
// Auto-generated API client for Dropbox integration

import { BaseAPIClient } from './BaseAPIClient';

export interface DropboxAPIClientConfig {
  accessToken: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
}

export class DropboxAPIClient extends BaseAPIClient {
  protected baseUrl: string;
  private config: DropboxAPIClientConfig;

  constructor(config: DropboxAPIClientConfig) {
    super();
    this.config = config;
    this.baseUrl = 'https://api.dropbox.com';
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
   * Upload file to Dropbox
   */
  async uploadFile({ path: string, content: string, mode?: string }: { path: string, content: string, mode?: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/upload_file', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Upload File failed: ${error}`);
    }
  }

  /**
   * Download file from Dropbox
   */
  async downloadFile({ path: string }: { path: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/download_file', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Download File failed: ${error}`);
    }
  }

  /**
   * Create new folder
   */
  async createFolder({ path: string, autorename?: boolean }: { path: string, autorename?: boolean }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/create_folder', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Create Folder failed: ${error}`);
    }
  }

  /**
   * List files in folder
   */
  async listFiles({ path?: string, recursive?: boolean, limit?: number }: { path?: string, recursive?: boolean, limit?: number }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/list_files', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`List Files failed: ${error}`);
    }
  }

  /**
   * Create shareable link for file
   */
  async shareFile({ path: string, settings?: Record<string, any> }: { path: string, settings?: Record<string, any> }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/share_file', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Share File failed: ${error}`);
    }
  }


  /**
   * Poll for Trigger when file is uploaded
   */
  async pollFileUploaded({ path?: string }: { path?: string }): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/file_uploaded', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling File Uploaded failed:`, error);
      return [];
    }
  }

  /**
   * Poll for Trigger when file is modified
   */
  async pollFileModified({ path?: string }: { path?: string }): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/file_modified', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling File Modified failed:`, error);
      return [];
    }
  }
}