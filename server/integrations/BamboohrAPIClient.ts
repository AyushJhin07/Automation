// BAMBOOHR API CLIENT
// Auto-generated API client for BambooHR integration

import { BaseAPIClient } from './BaseAPIClient';

export interface BamboohrAPIClientConfig {
  apiKey: string;
}

export class BamboohrAPIClient extends BaseAPIClient {
  protected baseUrl: string;
  private config: BamboohrAPIClientConfig;

  constructor(config: BamboohrAPIClientConfig) {
    super();
    this.config = config;
    this.baseUrl = 'https://api.bamboohr.com/api/gateway.php/{company_domain}/v1';
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
   * Add a new employee to BambooHR
   */
  async createEmployee({ firstName: string, lastName: string, workEmail?: string, hireDate?: string, department?: string }: { firstName: string, lastName: string, workEmail?: string, hireDate?: string, department?: string }): Promise<any> {
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
  async updateEmployee({ employeeId: string, fields: Record<string, any> }: { employeeId: string, fields: Record<string, any> }): Promise<any> {
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
  async terminateEmployee({ employeeId: string, terminationDate: string, terminationType?: string }: { employeeId: string, terminationDate: string, terminationType?: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/terminate_employee', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Terminate Employee failed: ${error}`);
    }
  }

  /**
   * Submit a time off request
   */
  async createTimeOffRequest({ employeeId: string, timeOffTypeId: string, start: string, end: string, note?: string }: { employeeId: string, timeOffTypeId: string, start: string, end: string, note?: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/create_time_off_request', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Create Time Off Request failed: ${error}`);
    }
  }

  /**
   * Approve a time off request
   */
  async approveTimeOff({ requestId: string, status: string, note?: string }: { requestId: string, status: string, note?: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/approve_time_off', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Approve Time Off failed: ${error}`);
    }
  }


  /**
   * Poll for Triggered when a new employee is added
   */
  async pollEmployeeAdded(params: Record<string, any> = {}): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/employee_added', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Employee Added failed:`, error);
      return [];
    }
  }

  /**
   * Poll for Triggered when time off is requested
   */
  async pollTimeOffRequested(params: Record<string, any> = {}): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/time_off_requested', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Time Off Requested failed:`, error);
      return [];
    }
  }
}