import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

export class GitlabAPIClient extends BaseAPIClient {
  constructor(credentials: APICredentials) {
    const host = credentials.baseUrl || 'https://gitlab.com';
    super(host.replace(/\/$/, '') + '/api/v4', credentials);
    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'create_issue': this.createIssue.bind(this) as any,
      'create_merge_request': this.createMergeRequest.bind(this) as any,
      'add_issue_note': this.addIssueNote.bind(this) as any,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const token = this.credentials.accessToken || this.credentials.token || this.credentials.apiKey || '';
    return {
      'PRIVATE-TOKEN': token,
      'Content-Type': 'application/json'
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/user', this.getAuthHeaders());
  }

  public async createIssue(params: { projectId: string | number; title: string; description?: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['projectId', 'title']);
    return this.post(`/projects/${params.projectId}/issues`, {
      title: params.title,
      description: params.description
    }, this.getAuthHeaders());
  }

  public async addIssueNote(params: { projectId: string | number; issueIid: number; body: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['projectId', 'issueIid', 'body']);
    return this.post(`/projects/${params.projectId}/issues/${params.issueIid}/notes`, {
      body: params.body
    }, this.getAuthHeaders());
  }

  public async createMergeRequest(params: { projectId: string | number; sourceBranch: string; targetBranch: string; title: string; description?: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['projectId', 'sourceBranch', 'targetBranch', 'title']);
    return this.post(`/projects/${params.projectId}/merge_requests`, {
      source_branch: params.sourceBranch,
      target_branch: params.targetBranch,
      title: params.title,
      description: params.description
    }, this.getAuthHeaders());
  }
}

