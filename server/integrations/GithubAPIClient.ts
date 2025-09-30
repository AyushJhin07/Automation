// GITHUB API CLIENT (fixed)
// Minimal GitHub operations for live connectors

import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

export class GithubAPIClient extends BaseAPIClient {
  constructor(credentials: APICredentials) {
    super('https://api.github.com', credentials);
    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'create_issue': this.createIssue.bind(this) as any,
      'add_comment': this.addComment.bind(this) as any,
      'create_pull_request': this.createPullRequest.bind(this) as any,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const token = this.credentials.accessToken || this.credentials.token || '';
    return {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json'
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    const resp = await this.get('/user', { ...this.getAuthHeaders() });
    return resp;
  }

  public async createIssue(params: { owner: string; repo: string; title: string; body?: string; labels?: string[]; assignees?: string[] }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['owner', 'repo', 'title']);
    return this.post(`/repos/${params.owner}/${params.repo}/issues`, {
      title: params.title,
      body: params.body,
      labels: params.labels,
      assignees: params.assignees
    }, this.getAuthHeaders());
  }

  public async addComment(params: { owner: string; repo: string; issueNumber: number; body: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['owner', 'repo', 'issueNumber', 'body']);
    return this.post(`/repos/${params.owner}/${params.repo}/issues/${params.issueNumber}/comments`, { body: params.body }, this.getAuthHeaders());
  }

  public async createPullRequest(params: { owner: string; repo: string; title: string; head: string; base: string; body?: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['owner', 'repo', 'title', 'head', 'base']);
    return this.post(`/repos/${params.owner}/${params.repo}/pulls`, {
      title: params.title,
      head: params.head,
      base: params.base,
      body: params.body
    }, this.getAuthHeaders());
  }
}
