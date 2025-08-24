// OKTA API CLIENT
// Auto-generated API client for Okta integration

import { BaseAPIClient } from './BaseAPIClient';

export interface OktaAPIClientConfig {
  apiKey: string;
}

export class OktaAPIClient extends BaseAPIClient {
  protected baseUrl: string;
  private config: OktaAPIClientConfig;

  constructor(config: OktaAPIClientConfig) {
    super();
    this.config = config;
    this.baseUrl = 'https://your-domain.okta.com/api/v1';
  }

  /**
   * Get authentication headers
   */
  protected getAuthHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.config.apiKey}`,
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
   * Create a new user in Okta
   */
  async createUser({ email: string, firstName: string, lastName: string, login: string, password?: string }: { email: string, firstName: string, lastName: string, login: string, password?: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/create_user', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Create User failed: ${error}`);
    }
  }

  /**
   * Update an existing user
   */
  async updateUser({ userId: string, profile: Record<string, any> }: { userId: string, profile: Record<string, any> }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/update_user', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Update User failed: ${error}`);
    }
  }

  /**
   * Deactivate a user account
   */
  async deactivateUser({ userId: string, sendEmail?: boolean }: { userId: string, sendEmail?: boolean }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/deactivate_user', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Deactivate User failed: ${error}`);
    }
  }

  /**
   * Assign a user to a group
   */
  async assignGroup({ userId: string, groupId: string }: { userId: string, groupId: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/assign_group', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Assign Group failed: ${error}`);
    }
  }

  /**
   * Reset user password
   */
  async resetPassword({ userId: string, sendEmail?: boolean }: { userId: string, sendEmail?: boolean }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/reset_password', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Reset Password failed: ${error}`);
    }
  }


  /**
   * Poll for Triggered when a new user is created
   */
  async pollUserCreated(params: Record<string, any> = {}): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/user_created', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling User Created failed:`, error);
      return [];
    }
  }

  /**
   * Poll for Triggered when a user is suspended
   */
  async pollUserSuspended(params: Record<string, any> = {}): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/user_suspended', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling User Suspended failed:`, error);
      return [];
    }
  }

  /**
   * Poll for Triggered when a user is assigned to a group
   */
  async pollGroupAssigned(params: Record<string, any> = {}): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/group_assigned', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Group Assigned failed:`, error);
      return [];
    }
  }
}