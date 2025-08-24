// LEVER API CLIENT
// Auto-generated API client for Lever integration

import { BaseAPIClient } from './BaseAPIClient';

export interface LeverAPIClientConfig {
  apiKey: string;
}

export class LeverAPIClient extends BaseAPIClient {
  protected baseUrl: string;
  private config: LeverAPIClientConfig;

  constructor(config: LeverAPIClientConfig) {
    super();
    this.config = config;
    this.baseUrl = 'https://api.lever.co/v1';
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
   * Create a new candidate opportunity
   */
  async createOpportunity({ name: string, email: string, phone?: string, posting_id?: string }: { name: string, email: string, phone?: string, posting_id?: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/create_opportunity', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Create Opportunity failed: ${error}`);
    }
  }

  /**
   * Update an existing opportunity
   */
  async updateOpportunity({ opportunity_id: string, updates: Record<string, any> }: { opportunity_id: string, updates: Record<string, any> }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/update_opportunity', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Update Opportunity failed: ${error}`);
    }
  }

  /**
   * Move candidate to a different stage
   */
  async moveToStage({ opportunity_id: string, stage_id: string }: { opportunity_id: string, stage_id: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/move_to_stage', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Move to Stage failed: ${error}`);
    }
  }

  /**
   * Add feedback for an interview
   */
  async addInterviewFeedback({ opportunity_id: string, interviewer_id: string, feedback: string, recommendation?: string }: { opportunity_id: string, interviewer_id: string, feedback: string, recommendation?: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/add_interview_feedback', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Add Interview Feedback failed: ${error}`);
    }
  }


  /**
   * Poll for Triggered when a new opportunity is created
   */
  async pollOpportunityCreated(params: Record<string, any> = {}): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/opportunity_created', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Opportunity Created failed:`, error);
      return [];
    }
  }

  /**
   * Poll for Triggered when a candidate is hired
   */
  async pollCandidateHired(params: Record<string, any> = {}): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/candidate_hired', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Candidate Hired failed:`, error);
      return [];
    }
  }
}