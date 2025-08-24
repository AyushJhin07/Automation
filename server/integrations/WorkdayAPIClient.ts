// WORKDAY API CLIENT
// Auto-generated API client for Workday integration

import { BaseAPIClient } from './BaseAPIClient';

export interface WorkdayAPIClientConfig {
  accessToken: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
}

export class WorkdayAPIClient extends BaseAPIClient {
  protected baseUrl: string;
  private config: WorkdayAPIClientConfig;

  constructor(config: WorkdayAPIClientConfig) {
    super();
    this.config = config;
    this.baseUrl = 'https://wd5-impl-services1.workday.com/ccx/api/v1';
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
   * Create a new worker in Workday
   */
  async createWorker({ personalData: Record<string, any>, positionData: Record<string, any>, hireDate: string }: { personalData: Record<string, any>, positionData: Record<string, any>, hireDate: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/create_worker', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Create Worker failed: ${error}`);
    }
  }

  /**
   * Update worker information
   */
  async updateWorker({ workerId: string, personalData?: Record<string, any>, positionData?: Record<string, any> }: { workerId: string, personalData?: Record<string, any>, positionData?: Record<string, any> }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/update_worker', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Update Worker failed: ${error}`);
    }
  }

  /**
   * Terminate a worker's employment
   */
  async terminateWorker({ workerId: string, terminationDate: string, reason: string }: { workerId: string, terminationDate: string, reason: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/terminate_worker', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Terminate Worker failed: ${error}`);
    }
  }

  /**
   * Create a new position
   */
  async createPosition({ positionTitle: string, department: string, jobProfile: string }: { positionTitle: string, department: string, jobProfile: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/create_position', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Create Position failed: ${error}`);
    }
  }

  /**
   * Update position details
   */
  async updatePosition({ positionId: string, updates: Record<string, any> }: { positionId: string, updates: Record<string, any> }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/update_position', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Update Position failed: ${error}`);
    }
  }


  /**
   * Poll for Triggered when a new worker is hired
   */
  async pollWorkerHired(params: Record<string, any> = {}): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/worker_hired', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Worker Hired failed:`, error);
      return [];
    }
  }

  /**
   * Poll for Triggered when a worker is terminated
   */
  async pollWorkerTerminated(params: Record<string, any> = {}): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/worker_terminated', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Worker Terminated failed:`, error);
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