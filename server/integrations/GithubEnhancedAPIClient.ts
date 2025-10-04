// GITHUB ENHANCED API CLIENT
// Auto-generated API client for GitHub Enhanced integration

import { BaseAPIClient } from './BaseAPIClient';

export interface GithubEnhancedAPIClientConfig {
  accessToken: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
}

export class GithubEnhancedAPIClient extends BaseAPIClient {
  protected baseUrl: string;
  private config: GithubEnhancedAPIClientConfig;

  constructor(config: GithubEnhancedAPIClientConfig) {
    super();
    this.config = config;
    this.baseUrl = 'https://api.github.com';
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
    } catch (error) {
      console.error(`❌ ${this.constructor.name} connection test failed:`, error);
      return false;
    }
  }


  /**
   * Create a new issue
   */
  async createIssue(params: { repo: string, title: string, body?: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/create_issue', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Create Issue failed: ${error}`);
    }
  }

  /**
   * Add a comment to an issue
   */
  async commentIssue(params: { repo: string, issueNumber: number, body: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/comment_issue', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Comment on Issue failed: ${error}`);
    }
  }

  /**
   * Create a new release
   */
  async createRelease(params: { repo: string, tag: string, name?: string, body?: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/create_release', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Create Release failed: ${error}`);
    }
  }

  /**
   * Trigger a workflow dispatch event
   */
  async dispatchWorkflow(params: { repo: string, workflowFile: string, ref: string, inputs?: Record<string, any> }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/dispatch_workflow', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Dispatch Workflow failed: ${error}`);
    }
  }

  /**
   * Add labels to an issue
   */
  async addLabel(params: { repo: string, issueNumber: number, labels: any[] }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/add_label', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Add Label to Issue failed: ${error}`);
    }
  }


  /**
   * Poll for Triggered when an issue is opened
   */
  async pollIssueOpened(params: { repo: string }): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/issue_opened', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Issue Opened failed:`, error);
      return [];
    }
  }

  /**
   * Poll for Triggered when an issue is commented
   */
  async pollIssueCommented(params: { repo: string }): Promise<any[]> {
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
   * Poll for Triggered when a pull request is opened
   */
  async pollPullRequestOpened(params: { repo: string }): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/pull_request_opened', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Pull Request Opened failed:`, error);
      return [];
    }
  }

  /**
   * Poll for Triggered when a release is published
   */
  async pollReleasePublished(params: { repo: string }): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/release_published', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Release Published failed:`, error);
      return [];
    }
  }
}