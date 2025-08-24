// SERVICENOW API CLIENT
// Auto-generated API client for ServiceNow integration

import { BaseAPIClient } from './BaseAPIClient';

export interface ServicenowAPIClientConfig {
  username: string;
  password: string;
}

export class ServicenowAPIClient extends BaseAPIClient {
  protected baseUrl: string;
  private config: ServicenowAPIClientConfig;

  constructor(config: ServicenowAPIClientConfig) {
    super();
    this.config = config;
    this.baseUrl = 'https://{instance}.service-now.com/api/now';
  }

  /**
   * Get authentication headers
   */
  protected getAuthHeaders(): Record<string, string> {
    const credentials = Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64');
    return {
      'Authorization': `Basic ${credentials}`,
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
   * Create a new incident in ServiceNow
   */
  async createIncident({ short_description: string, description?: string, urgency?: string, impact?: string, caller_id?: string, assignment_group?: string }: { short_description: string, description?: string, urgency?: string, impact?: string, caller_id?: string, assignment_group?: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/create_incident', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Create Incident failed: ${error}`);
    }
  }

  /**
   * Update an existing incident
   */
  async updateIncident({ incident_id: string, state?: string, work_notes?: string, resolution_code?: string, resolution_notes?: string }: { incident_id: string, state?: string, work_notes?: string, resolution_code?: string, resolution_notes?: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/update_incident', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Update Incident failed: ${error}`);
    }
  }

  /**
   * Resolve an incident
   */
  async resolveIncident({ incident_id: string, resolution_code: string, resolution_notes: string, close_notes?: string }: { incident_id: string, resolution_code: string, resolution_notes: string, close_notes?: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/resolve_incident', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Resolve Incident failed: ${error}`);
    }
  }

  /**
   * Create a new change request
   */
  async createChangeRequest({ short_description: string, description?: string, type?: string, risk?: string, implementation_plan?: string }: { short_description: string, description?: string, type?: string, risk?: string, implementation_plan?: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/create_change_request', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Create Change Request failed: ${error}`);
    }
  }

  /**
   * Approve a change request or other approval
   */
  async approveRequest({ request_id: string, state: string, comments?: string }: { request_id: string, state: string, comments?: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/approve_request', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Approve Request failed: ${error}`);
    }
  }


  /**
   * Poll for Triggered when a new incident is created
   */
  async pollIncidentCreated(params: Record<string, any> = {}): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/incident_created', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Incident Created failed:`, error);
      return [];
    }
  }

  /**
   * Poll for Triggered when a new change request is created
   */
  async pollChangeRequestCreated(params: Record<string, any> = {}): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/change_request_created', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Change Request Created failed:`, error);
      return [];
    }
  }
}