// ADP API CLIENT
// Auto-generated API client for ADP integration

import { BaseAPIClient } from './BaseAPIClient';

export interface AdpAPIClientConfig {
  accessToken: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
}

export class AdpAPIClient extends BaseAPIClient {
  protected baseUrl: string;
  private config: AdpAPIClientConfig;

  constructor(config: AdpAPIClientConfig) {
    super();
    this.config = config;
    this.baseUrl = 'https://api.adp.com';
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
   * Create a new employee record
   */
  async createEmployee({ personalInfo: Record<string, any>, employmentInfo: Record<string, any>, compensation?: Record<string, any> }: { personalInfo: Record<string, any>, employmentInfo: Record<string, any>, compensation?: Record<string, any> }): Promise<any> {
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
  async updateEmployee({ employeeId: string, updates: Record<string, any> }: { employeeId: string, updates: Record<string, any> }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/update_employee', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Update Employee failed: ${error}`);
    }
  }

  /**
   * Execute payroll processing
   */
  async runPayroll({ payrollGroupId: string, payPeriodStart: string, payPeriodEnd: string }: { payrollGroupId: string, payPeriodStart: string, payPeriodEnd: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/run_payroll', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Run Payroll failed: ${error}`);
    }
  }

  /**
   * Retrieve payroll report data
   */
  async getPayrollReport({ reportType: string, payPeriod: string, format?: string }: { reportType: string, payPeriod: string, format?: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/get_payroll_report', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Get Payroll Report failed: ${error}`);
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
   * Poll for Triggered when payroll processing is completed
   */
  async pollPayrollCompleted(params: Record<string, any> = {}): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/payroll_completed', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Payroll Completed failed:`, error);
      return [];
    }
  }
}