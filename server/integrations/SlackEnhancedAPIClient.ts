// SLACK ENHANCED API CLIENT
// Auto-generated API client for Slack Enhanced integration

import { BaseAPIClient } from './BaseAPIClient';

export interface SlackEnhancedAPIClientConfig {
  accessToken: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
}

export class SlackEnhancedAPIClient extends BaseAPIClient {
  protected baseUrl: string;
  private config: SlackEnhancedAPIClientConfig;

  constructor(config: SlackEnhancedAPIClientConfig) {
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
   * Post a message to a channel
   */
  async postMessage({ channel: string, text: string, blocksJson?: Record<string, any> }: { channel: string, text: string, blocksJson?: Record<string, any> }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/post_message', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Post Message failed: ${error}`);
    }
  }

  /**
   * Reply to a message in a thread
   */
  async replyInThread({ channel: string, threadTs: string, text: string }: { channel: string, threadTs: string, text: string }): Promise<any> {
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
  async updateMessage({ channel: string, ts: string, text: string }: { channel: string, ts: string, text: string }): Promise<any> {
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
  async deleteMessage({ channel: string, ts: string }: { channel: string, ts: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/delete_message', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Delete Message failed: ${error}`);
    }
  }

  /**
   * Schedule a message for later
   */
  async scheduleMessage({ channel: string, text: string, postAt: string }: { channel: string, text: string, postAt: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/schedule_message', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Schedule Message failed: ${error}`);
    }
  }

  /**
   * Add a reaction to a message
   */
  async addReaction({ channel: string, ts: string, name: string }: { channel: string, ts: string, name: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/add_reaction', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Add Reaction failed: ${error}`);
    }
  }

  /**
   * Remove a reaction from a message
   */
  async removeReaction({ channel: string, ts: string, name: string }: { channel: string, ts: string, name: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/remove_reaction', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Remove Reaction failed: ${error}`);
    }
  }

  /**
   * Set the topic for a channel
   */
  async setTopic({ channel: string, topic: string }: { channel: string, topic: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/set_topic', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Set Channel Topic failed: ${error}`);
    }
  }

  /**
   * Set the purpose for a channel
   */
  async setPurpose({ channel: string, purpose: string }: { channel: string, purpose: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/set_purpose', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Set Channel Purpose failed: ${error}`);
    }
  }

  /**
   * Invite a user to a channel
   */
  async inviteUser({ channel: string, userId: string }: { channel: string, userId: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/invite_user', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Invite User to Channel failed: ${error}`);
    }
  }

  /**
   * Remove a user from a channel
   */
  async kickUser({ channel: string, userId: string }: { channel: string, userId: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/kick_user', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Remove User from Channel failed: ${error}`);
    }
  }

  /**
   * Upload a file to a channel
   */
  async uploadFile({ channel: string, filename: string, base64: string }: { channel: string, filename: string, base64: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/upload_file', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Upload File failed: ${error}`);
    }
  }


  /**
   * Poll for Triggered when a message is posted
   */
  async pollMessagePosted({ channel: string }: { channel: string }): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/message_posted', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Message Posted failed:`, error);
      return [];
    }
  }

  /**
   * Poll for Triggered when a message is edited
   */
  async pollMessageEdited({ channel: string }: { channel: string }): Promise<any[]> {
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
   * Poll for Triggered when a reaction is added to a message
   */
  async pollReactionAdded(params: Record<string, any> = {}): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/reaction_added', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Reaction Added failed:`, error);
      return [];
    }
  }

  /**
   * Poll for Triggered when a reaction is removed
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
   * Poll for Triggered when a user joins the workspace
   */
  async pollUserJoined(params: Record<string, any> = {}): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/user_joined', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling User Joined failed:`, error);
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
   * Poll for Triggered when a file is shared
   */
  async pollFileShared(params: Record<string, any> = {}): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/file_shared', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling File Shared failed:`, error);
      return [];
    }
  }

  /**
   * Poll for Triggered when a channel is created
   */
  async pollChannelCreated(params: Record<string, any> = {}): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/channel_created', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Channel Created failed:`, error);
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

  /**
   * Poll for Triggered when a channel is unarchived
   */
  async pollChannelUnarchived(params: Record<string, any> = {}): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/channel_unarchived', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Channel Unarchived failed:`, error);
      return [];
    }
  }
}