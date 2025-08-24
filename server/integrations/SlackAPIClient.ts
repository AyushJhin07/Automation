// SLACK API CLIENT
// Auto-generated API client for Slack integration

import { BaseAPIClient } from './BaseAPIClient';

export interface SlackAPIClientConfig {
  accessToken: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
}

export class SlackAPIClient extends BaseAPIClient {
  protected baseUrl: string;
  private config: SlackAPIClientConfig;

  constructor(config: SlackAPIClientConfig) {
    super();
    this.config = config;
    this.baseUrl = 'https://slack.com/api';
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
      const response = await this.makeRequest('GET', '/auth/test');
      return response.status === 200;
      return true;
    } catch (error) {
      console.error(`❌ ${this.constructor.name} connection test failed:`, error);
      return false;
    }
  }


  /**
   * Send a message to a Slack channel or user
   */
  async sendMessage(params: Record<string, any> = {}): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/send_message', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Send Message failed: ${error}`);
    }
  }

  /**
   * Create a new Slack channel
   */
  async createChannel(params: Record<string, any> = {}): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/create_channel', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Create Channel failed: ${error}`);
    }
  }

  /**
   * Upload a file to Slack
   */
  async uploadFile(params: Record<string, any> = {}): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/upload_file', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Upload File failed: ${error}`);
    }
  }

  /**
   * Add an emoji reaction to a message
   */
  async addReaction(params: Record<string, any> = {}): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/add_reaction', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Add Reaction failed: ${error}`);
    }
  }

  /**
   * Set the status for the authenticated user
   */
  async setStatus(params: Record<string, any> = {}): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/set_status', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Set User Status failed: ${error}`);
    }
  }

  /**
   * Reply to a message in a thread
   */
  async replyInThread(params: Record<string, any> = {}): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/reply_in_thread', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Reply in Thread failed: ${error}`);
    }
  }

  /**
   * Update an existing message
   */
  async updateMessage(params: Record<string, any> = {}): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/update_message', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Update Message failed: ${error}`);
    }
  }

  /**
   * Delete a message
   */
  async deleteMessage(params: Record<string, any> = {}): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/delete_message', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Delete Message failed: ${error}`);
    }
  }

  /**
   * Schedule a message to be sent later
   */
  async scheduleMessage(params: Record<string, any> = {}): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/schedule_message', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Schedule Message failed: ${error}`);
    }
  }

  /**
   * Pin a message to a channel
   */
  async pinMessage(params: Record<string, any> = {}): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/pin_message', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Pin Message failed: ${error}`);
    }
  }

  /**
   * Unpin a message from a channel
   */
  async unpinMessage(params: Record<string, any> = {}): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/unpin_message', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Unpin Message failed: ${error}`);
    }
  }

  /**
   * Remove a reaction from a message
   */
  async removeReaction(params: Record<string, any> = {}): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/remove_reaction', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Remove Reaction failed: ${error}`);
    }
  }

  /**
   * Get a list of workspace users
   */
  async listUsers(params: Record<string, any> = {}): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/list_users', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`List Users failed: ${error}`);
    }
  }

  /**
   * Get a list of channels
   */
  async listChannels(params: Record<string, any> = {}): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/list_channels', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`List Channels failed: ${error}`);
    }
  }

  /**
   * Archive a channel
   */
  async archiveChannel(params: Record<string, any> = {}): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/archive_channel', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Archive Channel failed: ${error}`);
    }
  }


  /**
   * Poll for Triggered when a new message is posted
   */
  async pollNewMessage(params: Record<string, any> = {}): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/new_message', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling New Message failed:`, error);
      return [];
    }
  }

  /**
   * Poll for Triggered when a new channel is created
   */
  async pollNewChannel(params: Record<string, any> = {}): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/new_channel', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling New Channel Created failed:`, error);
      return [];
    }
  }

  /**
   * Poll for Triggered when a new user joins the workspace
   */
  async pollUserJoined(params: Record<string, any> = {}): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/user_joined', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling User Joined Workspace failed:`, error);
      return [];
    }
  }

  /**
   * Poll for Triggered when a message is edited
   */
  async pollMessageEdited(params: Record<string, any> = {}): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/message_edited', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Message Edited failed:`, error);
      return [];
    }
  }

  /**
   * Poll for Triggered when a reaction is removed from a message
   */
  async pollReactionRemoved(params: Record<string, any> = {}): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/reaction_removed', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Reaction Removed failed:`, error);
      return [];
    }
  }

  /**
   * Poll for Triggered when a file is uploaded
   */
  async pollFileUploaded(params: Record<string, any> = {}): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/file_uploaded', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling File Uploaded failed:`, error);
      return [];
    }
  }

  /**
   * Poll for Triggered when a user leaves the workspace
   */
  async pollUserLeft(params: Record<string, any> = {}): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/user_left', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling User Left failed:`, error);
      return [];
    }
  }

  /**
   * Poll for Triggered when a channel is archived
   */
  async pollChannelArchived(params: Record<string, any> = {}): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/channel_archived', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Channel Archived failed:`, error);
      return [];
    }
  }
}