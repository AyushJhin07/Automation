// MAILCHIMP API CLIENT
// Auto-generated API client for Mailchimp integration

import { BaseAPIClient } from './BaseAPIClient';

export interface MailchimpAPIClientConfig {
  accessToken: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
}

export class MailchimpAPIClient extends BaseAPIClient {
  protected baseUrl: string;
  private config: MailchimpAPIClientConfig;

  constructor(config: MailchimpAPIClientConfig) {
    super();
    this.config = config;
    this.baseUrl = 'https://api.mailchimp.com';
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
   * Add subscriber to mailing list
   */
  async addSubscriber({ listId: string, email: string, firstName?: string, lastName?: string, status?: string, tags?: any[] }: { listId: string, email: string, firstName?: string, lastName?: string, status?: string, tags?: any[] }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/add_subscriber', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Add Subscriber failed: ${error}`);
    }
  }

  /**
   * Create email campaign
   */
  async createCampaign({ type: string, listId: string, subject: string, fromName: string, fromEmail: string, content: string }: { type: string, listId: string, subject: string, fromName: string, fromEmail: string, content: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/create_campaign', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Create Campaign failed: ${error}`);
    }
  }

  /**
   * Send email campaign
   */
  async sendCampaign({ campaignId: string }: { campaignId: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/send_campaign', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Send Campaign failed: ${error}`);
    }
  }

  /**
   * Update subscriber information
   */
  async updateSubscriber({ listId: string, email: string, firstName?: string, lastName?: string, status?: string }: { listId: string, email: string, firstName?: string, lastName?: string, status?: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/update_subscriber', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Update Subscriber failed: ${error}`);
    }
  }


  /**
   * Poll for Trigger when new subscriber is added
   */
  async pollSubscriberAdded({ listId?: string }: { listId?: string }): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/subscriber_added', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Subscriber Added failed:`, error);
      return [];
    }
  }

  /**
   * Poll for Trigger when campaign is sent
   */
  async pollCampaignSent({ campaignType?: string }: { campaignType?: string }): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/campaign_sent', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Campaign Sent failed:`, error);
      return [];
    }
  }
}