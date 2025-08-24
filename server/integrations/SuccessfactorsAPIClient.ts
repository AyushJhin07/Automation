// SUCCESSFACTORS API CLIENT
// Auto-generated API client for SuccessFactors integration

import { BaseAPIClient } from './BaseAPIClient';

export interface SuccessfactorsAPIClientConfig {
  accessToken: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
}

export class SuccessfactorsAPIClient extends BaseAPIClient {
  protected baseUrl: string;
  private config: SuccessfactorsAPIClientConfig;

  constructor(config: SuccessfactorsAPIClientConfig) {
    super();
    this.config = config;
    this.baseUrl = 'https://api4.successfactors.com/odata/v2';
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
   * Create a new employee in SuccessFactors
   */
  async createEmployee({ userId: string, personalInfo: Record<string, any>, employmentInfo: Record<string, any> }: { userId: string, personalInfo: Record<string, any>, employmentInfo: Record<string, any> }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/create_employee', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Create Employee failed: ${error}`);
    }
  }

  /**
   * Update employee information
   */
  async updateEmployee({ userId: string, updates: Record<string, any> }: { userId: string, updates: Record<string, any> }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/update_employee', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Update Employee failed: ${error}`);
    }
  }

  /**
   * Terminate an employee
   */
  async terminateEmployee({ userId: string, terminationDate: string, reason?: string }: { userId: string, terminationDate: string, reason?: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/terminate_employee', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Terminate Employee failed: ${error}`);
    }
  }

  /**
   * Retrieve list of employees
   */
  async listEmployees({ filter?: string, top?: number }: { filter?: string, top?: number }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/list_employees', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`List Employees failed: ${error}`);
    }
  }


  /**
   * Poll for Triggered when a new employee is created
   */
  async pollEmployeeCreated(params: Record<string, any> = {}): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/employee_created', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Employee Created failed:`, error);
      return [];
    }
  }

  /**
   * Poll for Triggered when employee data is updated
   */
  async pollEmployeeUpdated(params: Record<string, any> = {}): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/employee_updated', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Employee Updated failed:`, error);
      return [];
    }
  }
}