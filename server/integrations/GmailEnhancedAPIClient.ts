// GMAIL ENHANCED API CLIENT
// Auto-generated API client for Gmail Enhanced integration

import { BaseAPIClient } from './BaseAPIClient';

export interface GmailEnhancedAPIClientConfig {
  accessToken: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
}

export class GmailEnhancedAPIClient extends BaseAPIClient {
  protected baseUrl: string;
  private config: GmailEnhancedAPIClientConfig;

  constructor(config: GmailEnhancedAPIClientConfig) {
    super();
    this.config = config;
    this.baseUrl = 'https://gmail.googleapis.com/gmail/v1';
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
    } catch (error) {
      console.error(`❌ ${this.constructor.name} connection test failed:`, error);
      return false;
    }
  }


  /**
   * Send a new email
   */
  async send(params: { to: string, subject: string, bodyText?: string, bodyHtml?: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/send', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Send Email failed: ${error}`);
    }
  }

  /**
   * Reply to an email thread
   */
  async reply(params: { threadId: string, bodyText?: string, bodyHtml?: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/reply', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Reply to Email failed: ${error}`);
    }
  }

  /**
   * Forward an email
   */
  async forward(params: { msgId: string, to: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/forward', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Forward Email failed: ${error}`);
    }
  }

  /**
   * Create an email draft
   */
  async createDraft(params: { to: string, subject: string, body: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/create_draft', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Create Draft failed: ${error}`);
    }
  }

  /**
   * Send an existing draft
   */
  async sendDraft(params: { draftId: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/send_draft', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Send Draft failed: ${error}`);
    }
  }

  /**
   * Add a label to a message
   */
  async addLabel(params: { msgId: string, label: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/add_label', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Add Label failed: ${error}`);
    }
  }

  /**
   * Remove a label from a message
   */
  async removeLabel(params: { msgId: string, label: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/remove_label', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Remove Label failed: ${error}`);
    }
  }

  /**
   * Mark a message as read
   */
  async markRead(params: { msgId: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/mark_read', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Mark as Read failed: ${error}`);
    }
  }

  /**
   * Mark a message as unread
   */
  async markUnread(params: { msgId: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/mark_unread', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Mark as Unread failed: ${error}`);
    }
  }

  /**
   * Batch modify multiple messages
   */
  async batchModify(params: { messageIds: any[], add?: any[], remove?: any[] }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/batch_modify', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Batch Modify failed: ${error}`);
    }
  }


  /**
   * Poll for Triggered when a new email is received
   */
  async pollNewEmail(params: { query?: string }): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/new_email', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling New Email failed:`, error);
      return [];
    }
  }

  /**
   * Poll for Triggered when a specific label is added
   */
  async pollLabelAdded(params: { label: string }): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/label_added', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Label Added failed:`, error);
      return [];
    }
  }

  /**
   * Poll for Triggered when an email with attachment is received
   */
  async pollAttachmentReceived(params: { minSizeKb?: number, query?: string }): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/attachment_received', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Attachment Received failed:`, error);
      return [];
    }
  }

  /**
   * Poll for Triggered when an email thread is updated
   */
  async pollThreadUpdated(params: { query?: string }): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/thread_updated', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Thread Updated failed:`, error);
      return [];
    }
  }
}