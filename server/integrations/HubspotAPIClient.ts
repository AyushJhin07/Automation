// HUBSPOT API CLIENT
// Auto-generated API client for HubSpot integration

import { BaseAPIClient } from './BaseAPIClient';

export interface HubspotAPIClientConfig {
  accessToken: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
}

export class HubspotAPIClient extends BaseAPIClient {
  protected baseUrl: string;
  private config: HubspotAPIClientConfig;

  constructor(config: HubspotAPIClientConfig) {
    super();
    this.config = config;
    this.baseUrl = 'https://api.hubapi.com';
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
   * Create a new contact in HubSpot
   */
  async createContact(params: Record<string, any> = {}): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/create_contact', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Create Contact failed: ${error}`);
    }
  }

  /**
   * Update an existing contact in HubSpot
   */
  async updateContact(params: Record<string, any> = {}): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/update_contact', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Update Contact failed: ${error}`);
    }
  }

  /**
   * Create a new deal in HubSpot
   */
  async createDeal(params: Record<string, any> = {}): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/create_deal', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Create Deal failed: ${error}`);
    }
  }

  /**
   * Create a new company in HubSpot
   */
  async createCompany(params: Record<string, any> = {}): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/create_company', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Create Company failed: ${error}`);
    }
  }

  /**
   * Create a new task in HubSpot
   */
  async createTask(params: Record<string, any> = {}): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/create_task', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Create Task failed: ${error}`);
    }
  }

  /**
   * Send an email through HubSpot
   */
  async sendEmail(params: Record<string, any> = {}): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/send_email', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Send Email failed: ${error}`);
    }
  }

  /**
   * Delete a contact from HubSpot
   */
  async deleteContact(params: Record<string, any> = {}): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/delete_contact', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Delete Contact failed: ${error}`);
    }
  }

  /**
   * Retrieve a specific contact
   */
  async getContact(params: Record<string, any> = {}): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/get_contact', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Get Contact failed: ${error}`);
    }
  }

  /**
   * Search for contacts using filters
   */
  async searchContacts(params: Record<string, any> = {}): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/search_contacts', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Search Contacts failed: ${error}`);
    }
  }

  /**
   * Update an existing company
   */
  async updateCompany(params: Record<string, any> = {}): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/update_company', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Update Company failed: ${error}`);
    }
  }

  /**
   * Delete a company from HubSpot
   */
  async deleteCompany(params: Record<string, any> = {}): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/delete_company', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Delete Company failed: ${error}`);
    }
  }

  /**
   * Update an existing deal
   */
  async updateDeal(params: Record<string, any> = {}): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/update_deal', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Update Deal failed: ${error}`);
    }
  }

  /**
   * Delete a deal from HubSpot
   */
  async deleteDeal(params: Record<string, any> = {}): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/delete_deal', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Delete Deal failed: ${error}`);
    }
  }

  /**
   * Create a new support ticket
   */
  async createTicket(params: Record<string, any> = {}): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/create_ticket', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Create Ticket failed: ${error}`);
    }
  }


  /**
   * Poll for Triggered when a new contact is created
   */
  async pollNewContact(params: Record<string, any> = {}): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/new_contact', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling New Contact Created failed:`, error);
      return [];
    }
  }

  /**
   * Poll for Triggered when a contact is updated
   */
  async pollContactUpdated(params: Record<string, any> = {}): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/contact_updated', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Contact Updated failed:`, error);
      return [];
    }
  }

  /**
   * Poll for Triggered when a new deal is created
   */
  async pollNewDeal(params: Record<string, any> = {}): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/new_deal', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling New Deal Created failed:`, error);
      return [];
    }
  }

  /**
   * Poll for Triggered when a deal moves to a different stage
   */
  async pollDealStageChanged(params: Record<string, any> = {}): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/deal_stage_changed', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Deal Stage Changed failed:`, error);
      return [];
    }
  }

  /**
   * Poll for Triggered when a HubSpot form is submitted
   */
  async pollFormSubmission(params: Record<string, any> = {}): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/form_submission', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Form Submission failed:`, error);
      return [];
    }
  }

  /**
   * Poll for Triggered when a new company is created
   */
  async pollCompanyCreated(params: Record<string, any> = {}): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/company_created', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Company Created failed:`, error);
      return [];
    }
  }

  /**
   * Poll for Triggered when a company is updated
   */
  async pollCompanyUpdated(params: Record<string, any> = {}): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/company_updated', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Company Updated failed:`, error);
      return [];
    }
  }

  /**
   * Poll for Triggered when a new deal is created
   */
  async pollDealCreated(params: Record<string, any> = {}): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/deal_created', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Deal Created failed:`, error);
      return [];
    }
  }

  /**
   * Poll for Triggered when a new ticket is created
   */
  async pollTicketCreated(params: Record<string, any> = {}): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/ticket_created', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Ticket Created failed:`, error);
      return [];
    }
  }

  /**
   * Poll for Triggered when a ticket is updated
   */
  async pollTicketUpdated(params: Record<string, any> = {}): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/ticket_updated', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Ticket Updated failed:`, error);
      return [];
    }
  }
}