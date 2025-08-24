// GREENHOUSE API CLIENT
// Auto-generated API client for Greenhouse integration

import { BaseAPIClient } from './BaseAPIClient';

export interface GreenhouseAPIClientConfig {
  apiKey: string;
}

export class GreenhouseAPIClient extends BaseAPIClient {
  protected baseUrl: string;
  private config: GreenhouseAPIClientConfig;

  constructor(config: GreenhouseAPIClientConfig) {
    super();
    this.config = config;
    this.baseUrl = 'https://harvest.greenhouse.io/v1';
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
   * Create a new candidate
   */
  async createCandidate({ firstName: string, lastName: string, email: string, phone?: string }: { firstName: string, lastName: string, email: string, phone?: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/create_candidate', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Create Candidate failed: ${error}`);
    }
  }

  /**
   * Update candidate information
   */
  async updateCandidate({ candidateId: string, updates: Record<string, any> }: { candidateId: string, updates: Record<string, any> }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/update_candidate', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Update Candidate failed: ${error}`);
    }
  }

  /**
   * Move candidate to next stage
   */
  async advanceStage({ applicationId: string, stageId: string }: { applicationId: string, stageId: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/advance_stage', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Advance Stage failed: ${error}`);
    }
  }

  /**
   * Schedule an interview
   */
  async scheduleInterview({ applicationId: string, interviewerId: string, startTime: string, endTime: string }: { applicationId: string, interviewerId: string, startTime: string, endTime: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/schedule_interview', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Schedule Interview failed: ${error}`);
    }
  }

  /**
   * Add note to candidate
   */
  async addNote({ candidateId: string, message: string }: { candidateId: string, message: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/add_note', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Add Note failed: ${error}`);
    }
  }


  /**
   * Poll for Triggered when a candidate is created
   */
  async pollCandidateCreated(params: Record<string, any> = {}): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/candidate_created', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Candidate Created failed:`, error);
      return [];
    }
  }

  /**
   * Poll for Triggered when an application is updated
   */
  async pollApplicationUpdated(params: Record<string, any> = {}): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/application_updated', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Application Updated failed:`, error);
      return [];
    }
  }
}