// GITHUB API CLIENT
// Auto-generated API client for GitHub integration

import { BaseAPIClient } from './BaseAPIClient';

export interface GithubAPIClientConfig {
  accessToken: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
}

export class GithubAPIClient extends BaseAPIClient {
  protected baseUrl: string;
  private config: GithubAPIClientConfig;

  constructor(config: GithubAPIClientConfig) {
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
   * Create new GitHub issue
   */
  async createIssue({ owner: string, repo: string, title: string, body?: string, labels?: any[], assignees?: any[] }: { owner: string, repo: string, title: string, body?: string, labels?: any[], assignees?: any[] }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/create_issue', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Create Issue failed: ${error}`);
    }
  }

  /**
   * Create new pull request
   */
  async createPullRequest({ owner: string, repo: string, title: string, head: string, base: string, body?: string }: { owner: string, repo: string, title: string, head: string, base: string, body?: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/create_pull_request', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Create Pull Request failed: ${error}`);
    }
  }

  /**
   * Add comment to issue or PR
   */
  async addComment({ owner: string, repo: string, issueNumber: number, body: string }: { owner: string, repo: string, issueNumber: number, body: string }): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/add_comment', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Add Comment failed: ${error}`);
    }
  }


  /**
   * Poll for Trigger when issue is opened
   */
  async pollIssueOpened({ owner: string, repo: string }: { owner: string, repo: string }): Promise<any[]> {
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
   * Poll for Trigger when PR is opened
   */
  async pollPullRequestOpened({ owner: string, repo: string }: { owner: string, repo: string }): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/pull_request_opened', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(`Polling Pull Request Opened failed:`, error);
      return [];
    }
  }
}