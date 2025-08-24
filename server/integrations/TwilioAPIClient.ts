// TWILIO API CLIENT
// Auto-generated API client for Twilio integration

import { BaseAPIClient } from './BaseAPIClient';

export interface TwilioAPIClientConfig {
  apiKey: string;
}

export class TwilioAPIClient extends BaseAPIClient {
  protected baseUrl: string;
  private config: TwilioAPIClientConfig;

  constructor(config: TwilioAPIClientConfig) {
    super();
    this.config = config;
    this.baseUrl = 'https://api.twilio.com';
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
      const response = await this.makeRequest('GET', '/auth/test');
      return response.status === 200;
      return true;
    } catch (error) {
      console.error(`❌ ${this.constructor.name} connection test failed:`, error);
      return false;
    }
  }


  /**
   * Send SMS message
   */
  async sendSms({ to: string, from: string, body: string, mediaUrl?: string }: { to: string, from: string, body: string, mediaUrl?: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/send_sms', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Send SMS failed: ${error}`);
    }
  }

  /**
   * Initiate phone call
   */
  async makeCall({ to: string, from: string, url: string }: { to: string, from: string, url: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/make_call', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Make Call failed: ${error}`);
    }
  }

  /**
   * Send WhatsApp message
   */
  async sendWhatsapp({ to: string, from: string, body: string }: { to: string, from: string, body: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/send_whatsapp', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Send WhatsApp Message failed: ${error}`);
    }
  }


  /**
   * Poll for Trigger when SMS is received
   */
  async pollMessageReceived({ from?: string }: { from?: string }): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/message_received', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Message Received failed:`, error);
      return [];
    }
  }

  /**
   * Poll for Trigger when call ends
   */
  async pollCallCompleted({ minDuration?: number }: { minDuration?: number }): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/call_completed', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Call Completed failed:`, error);
      return [];
    }
  }
}