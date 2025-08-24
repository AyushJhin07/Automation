// JIRA API CLIENT
// Auto-generated API client for Jira integration

import { BaseAPIClient } from './BaseAPIClient';

export interface JiraAPIClientConfig {
  accessToken: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
}

export class JiraAPIClient extends BaseAPIClient {
  protected baseUrl: string;
  private config: JiraAPIClientConfig;

  constructor(config: JiraAPIClientConfig) {
    super();
    this.config = config;
    this.baseUrl = 'https://api.atlassian.com/ex/jira/{cloudid}';
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
   * Create a new issue in Jira
   */
  async createIssue(params: Record<string, any> = {}): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/create_issue', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Create Issue failed: ${error}`);
    }
  }

  /**
   * Update an existing issue in Jira
   */
  async updateIssue(params: Record<string, any> = {}): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/update_issue', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Update Issue failed: ${error}`);
    }
  }

  /**
   * Transition an issue to a different status
   */
  async transitionIssue(params: Record<string, any> = {}): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/transition_issue', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Transition Issue failed: ${error}`);
    }
  }

  /**
   * Add a comment to an issue
   */
  async addComment(params: Record<string, any> = {}): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/add_comment', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Add Comment failed: ${error}`);
    }
  }

  /**
   * Create a new project in Jira
   */
  async createProject(params: Record<string, any> = {}): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/create_project', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Create Project failed: ${error}`);
    }
  }

  /**
   * Search for issues using JQL (Jira Query Language)
   */
  async searchIssues(params: Record<string, any> = {}): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/search_issues', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Search Issues failed: ${error}`);
    }
  }

  /**
   * Assign an issue to a user
   */
  async assignIssue(params: Record<string, any> = {}): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/assign_issue', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Assign Issue failed: ${error}`);
    }
  }

  /**
   * Add a watcher to an issue
   */
  async addWatcher(params: Record<string, any> = {}): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/add_watcher', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Add Watcher failed: ${error}`);
    }
  }

  /**
   * Add an attachment to an issue
   */
  async addAttachment(params: Record<string, any> = {}): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/add_attachment', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Add Attachment failed: ${error}`);
    }
  }

  /**
   * Create a link between two issues
   */
  async linkIssues(params: Record<string, any> = {}): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/link_issues', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Link Issues failed: ${error}`);
    }
  }

  /**
   * Add a label to an issue
   */
  async addLabel(params: Record<string, any> = {}): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/add_label', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Add Label failed: ${error}`);
    }
  }

  /**
   * Log work on an issue
   */
  async addWorklog(params: Record<string, any> = {}): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/add_worklog', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Add Worklog failed: ${error}`);
    }
  }

  /**
   * Create a subtask for an issue
   */
  async createSubtask(params: Record<string, any> = {}): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/create_subtask', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Create Subtask failed: ${error}`);
    }
  }


  /**
   * Poll for Triggered when a new issue is created
   */
  async pollIssueCreated(params: Record<string, any> = {}): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/issue_created', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Issue Created failed:`, error);
      return [];
    }
  }

  /**
   * Poll for Triggered when an issue is updated
   */
  async pollIssueUpdated(params: Record<string, any> = {}): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/issue_updated', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Issue Updated failed:`, error);
      return [];
    }
  }

  /**
   * Poll for Triggered when an issue status changes
   */
  async pollIssueTransitioned(params: Record<string, any> = {}): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/issue_transitioned', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Issue Status Changed failed:`, error);
      return [];
    }
  }

  /**
   * Poll for Triggered when a comment is added to an issue
   */
  async pollCommentAdded(params: Record<string, any> = {}): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/comment_added', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Comment Added failed:`, error);
      return [];
    }
  }

  /**
   * Poll for Triggered when an issue is deleted
   */
  async pollIssueDeleted(params: Record<string, any> = {}): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/issue_deleted', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Issue Deleted failed:`, error);
      return [];
    }
  }

  /**
   * Poll for Triggered when a comment is added to an issue
   */
  async pollIssueCommented(params: Record<string, any> = {}): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/issue_commented', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Issue Commented failed:`, error);
      return [];
    }
  }

  /**
   * Poll for Triggered when a sprint is started
   */
  async pollSprintStarted(params: Record<string, any> = {}): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/sprint_started', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Sprint Started failed:`, error);
      return [];
    }
  }
}