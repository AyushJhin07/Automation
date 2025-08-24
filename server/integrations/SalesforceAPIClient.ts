// SALESFORCE API CLIENT
// Auto-generated API client for Salesforce integration

import { BaseAPIClient } from './BaseAPIClient';

export interface SalesforceAPIClientConfig {
  accessToken: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
}

export class SalesforceAPIClient extends BaseAPIClient {
  protected baseUrl: string;
  private config: SalesforceAPIClientConfig;

  constructor(config: SalesforceAPIClientConfig) {
    super();
    this.config = config;
    this.baseUrl = 'https://api.salesforce.com';
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
      const response = await this.makeRequest('GET', '/users/me');
      return response.status === 200;
      return true;
    } catch (error) {
      console.error(`❌ ${this.constructor.name} connection test failed:`, error);
      return false;
    }
  }


  /**
   * Create a new lead in Salesforce
   */
  async createLead({ firstName: string, lastName: string, email: string, company: string, phone?: string, status?: string }: { firstName: string, lastName: string, email: string, company: string, phone?: string, status?: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/create_lead', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Create Lead failed: ${error}`);
    }
  }

  /**
   * Create a new sales opportunity
   */
  async createOpportunity({ name: string, accountId: string, amount?: number, closeDate: string, stageName: string }: { name: string, accountId: string, amount?: number, closeDate: string, stageName: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/create_opportunity', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Create Opportunity failed: ${error}`);
    }
  }

  /**
   * Update contact information
   */
  async updateContact({ contactId: string, firstName?: string, lastName?: string, email?: string, phone?: string }: { contactId: string, firstName?: string, lastName?: string, email?: string, phone?: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/update_contact', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Update Contact failed: ${error}`);
    }
  }

  /**
   * Create a new task
   */
  async createTask({ subject: string, description?: string, whoId?: string, whatId?: string, activityDate?: string, priority?: string }: { subject: string, description?: string, whoId?: string, whatId?: string, activityDate?: string, priority?: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/create_task', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Create Task failed: ${error}`);
    }
  }


  /**
   * Poll for Trigger when new lead is created
   */
  async pollLeadCreated({ source?: string }: { source?: string }): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/lead_created', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Lead Created failed:`, error);
      return [];
    }
  }

  /**
   * Poll for Trigger when opportunity is closed
   */
  async pollOpportunityClosed({ stage?: string }: { stage?: string }): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/opportunity_closed', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Opportunity Closed failed:`, error);
      return [];
    }
  }
}