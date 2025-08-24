// PAGERDUTY API CLIENT
// Auto-generated API client for PagerDuty integration

import { BaseAPIClient } from './BaseAPIClient';

export interface PagerdutyAPIClientConfig {
  apiKey: string;
}

export class PagerdutyAPIClient extends BaseAPIClient {
  protected baseUrl: string;
  private config: PagerdutyAPIClientConfig;

  constructor(config: PagerdutyAPIClientConfig) {
    super();
    this.config = config;
    this.baseUrl = 'https://api.pagerduty.com';
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
   * Create a new incident in PagerDuty
   */
  async createIncident({ title: string, service_id: string, urgency?: string, incident_key?: string, details?: string }: { title: string, service_id: string, urgency?: string, incident_key?: string, details?: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/create_incident', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Create Incident failed: ${error}`);
    }
  }

  /**
   * Acknowledge an incident
   */
  async acknowledgeIncident({ incident_id: string, from: string }: { incident_id: string, from: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/acknowledge_incident', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Acknowledge Incident failed: ${error}`);
    }
  }

  /**
   * Resolve an incident
   */
  async resolveIncident({ incident_id: string, from: string, resolution?: string }: { incident_id: string, from: string, resolution?: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/resolve_incident', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Resolve Incident failed: ${error}`);
    }
  }

  /**
   * Add a note to an incident
   */
  async addNote({ incident_id: string, content: string, from: string }: { incident_id: string, content: string, from: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/add_note', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Add Note failed: ${error}`);
    }
  }


  /**
   * Poll for Triggered when a new incident is created
   */
  async pollIncidentTriggered(params: Record<string, any> = {}): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/incident_triggered', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Incident Triggered failed:`, error);
      return [];
    }
  }

  /**
   * Poll for Triggered when an incident is resolved
   */
  async pollIncidentResolved(params: Record<string, any> = {}): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/incident_resolved', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Incident Resolved failed:`, error);
      return [];
    }
  }
}