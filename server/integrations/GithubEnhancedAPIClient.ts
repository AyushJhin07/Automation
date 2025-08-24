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
      return true;
    } catch (error) {
      console.error(`❌ ${this.constructor.name} connection test failed:`, error);
      return false;
    }
  }


  /**
   * Create a new issue
   */
  async createIssue({ repo: string, title: string, body?: string }: { repo: string, title: string, body?: string }): Promise<any> {
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
  async commentIssue({ repo: string, issueNumber: number, body: string }: { repo: string, issueNumber: number, body: string }): Promise<any> {
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
  async createRelease({ repo: string, tag: string, name?: string, body?: string }: { repo: string, tag: string, name?: string, body?: string }): Promise<any> {
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
  async dispatchWorkflow({ repo: string, workflowFile: string, ref: string, inputs?: Record<string, any> }: { repo: string, workflowFile: string, ref: string, inputs?: Record<string, any> }): Promise<any> {
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
  async addLabel({ repo: string, issueNumber: number, labels: any[] }: { repo: string, issueNumber: number, labels: any[] }): Promise<any> {
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
  async pollIssueOpened({ repo: string }: { repo: string }): Promise<any[]> {
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
  async pollIssueCommented({ repo: string }: { repo: string }): Promise<any[]> {
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
  async pollPullRequestOpened({ repo: string }: { repo: string }): Promise<any[]> {
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
  async pollReleasePublished({ repo: string }: { repo: string }): Promise<any[]> {
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