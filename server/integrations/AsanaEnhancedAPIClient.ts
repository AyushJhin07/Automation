// ASANA ENHANCED API CLIENT
// Auto-generated API client for Asana Enhanced integration

import { BaseAPIClient } from './BaseAPIClient';

export interface AsanaEnhancedAPIClientConfig {
  accessToken: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
}

export class AsanaEnhancedAPIClient extends BaseAPIClient {
  protected baseUrl: string;
  private config: AsanaEnhancedAPIClientConfig;

  constructor(config: AsanaEnhancedAPIClientConfig) {
    super();
    this.config = config;
    this.baseUrl = 'https://app.asana.com/api/1.0';
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
      const response = await this.makeRequest('GET', '/user');
      return response.status === 200;
      return true;
    } catch (error) {
      console.error(`❌ ${this.constructor.name} connection test failed:`, error);
      return false;
    }
  }


  /**
   * Create a new task in a project
   */
  async createTask({ projectId: string, name: string, assignee?: string, dueOn?: string }: { projectId: string, name: string, assignee?: string, dueOn?: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/create_task', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Create Task failed: ${error}`);
    }
  }

  /**
   * Update an existing task
   */
  async updateTask({ taskId: string, fields: Record<string, any> }: { taskId: string, fields: Record<string, any> }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/update_task', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Update Task failed: ${error}`);
    }
  }

  /**
   * Move a task to a different section
   */
  async moveTask({ taskId: string, sectionId: string }: { taskId: string, sectionId: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/move_task', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Move Task failed: ${error}`);
    }
  }

  /**
   * Add a comment to a task
   */
  async addComment({ taskId: string, text: string }: { taskId: string, text: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/add_comment', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Add Comment failed: ${error}`);
    }
  }

  /**
   * Assign a task to a user
   */
  async assignTask({ taskId: string, assignee: string }: { taskId: string, assignee: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/assign_task', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Assign Task failed: ${error}`);
    }
  }

  /**
   * Add a subtask to a task
   */
  async addSubtask({ taskId: string, name: string }: { taskId: string, name: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/add_subtask', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Add Subtask failed: ${error}`);
    }
  }

  /**
   * Add a tag to a task
   */
  async addTag({ taskId: string, tagId: string }: { taskId: string, tagId: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/add_tag', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Add Tag failed: ${error}`);
    }
  }

  /**
   * Set due date for a task
   */
  async setDueDate({ taskId: string, dueOn: string }: { taskId: string, dueOn: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/set_due_date', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Set Due Date failed: ${error}`);
    }
  }

  /**
   * Create a new section in a project
   */
  async createSection({ projectId: string, name: string }: { projectId: string, name: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/create_section', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Create Section failed: ${error}`);
    }
  }


  /**
   * Poll for Triggered when a task is created
   */
  async pollTaskCreated({ projectId: string }: { projectId: string }): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/task_created', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Task Created failed:`, error);
      return [];
    }
  }

  /**
   * Poll for Triggered when a task is updated
   */
  async pollTaskUpdated({ projectId: string }: { projectId: string }): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/task_updated', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Task Updated failed:`, error);
      return [];
    }
  }

  /**
   * Poll for Triggered when a task is completed
   */
  async pollTaskCompleted({ projectId: string }: { projectId: string }): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/task_completed', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Task Completed failed:`, error);
      return [];
    }
  }

  /**
   * Poll for Triggered when a comment is added
   */
  async pollCommentAdded({ projectId: string }: { projectId: string }): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/comment_added', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Comment Added failed:`, error);
      return [];
    }
  }
}