import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

export class JiraAPIClient extends BaseAPIClient {
  private baseUrl: string;

  constructor(credentials: APICredentials) {
    const baseUrl = credentials.baseUrl || credentials.instanceUrl;
    if (!baseUrl) {
      throw new Error('Jira integration requires baseUrl in credentials');
    }
    super(baseUrl.replace(/\/$/, '') + '/rest/api/3', credentials);
    this.baseUrl = baseUrl.replace(/\/$/, '');

    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'create_issue': this.createIssue.bind(this) as any,
      'add_comment': this.addComment.bind(this) as any,
      'transition_issue': this.transitionIssue.bind(this) as any,
      'search_issues': this.searchIssues.bind(this) as any,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const token = this.credentials.accessToken || this.credentials.token || '';
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/myself', this.getAuthHeaders());
  }

  public async createIssue(params: { fields: Record<string, any> }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['fields']);
    return this.post('/issue', { fields: params.fields }, this.getAuthHeaders());
  }

  public async addComment(params: { issueIdOrKey: string; body: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['issueIdOrKey', 'body']);
    return this.post(`/issue/${encodeURIComponent(params.issueIdOrKey)}/comment`, { body: params.body }, this.getAuthHeaders());
  }

  public async transitionIssue(params: { issueIdOrKey: string; transitionId: string; fields?: Record<string, any> }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['issueIdOrKey', 'transitionId']);
    return this.post(`/issue/${encodeURIComponent(params.issueIdOrKey)}/transitions`, {
      transition: { id: params.transitionId },
      fields: params.fields
    }, this.getAuthHeaders());
  }

  public async searchIssues(params: { jql: string; maxResults?: number }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['jql']);
    return this.post('/search', {
      jql: params.jql,
      maxResults: params.maxResults ?? 50
    }, this.getAuthHeaders());
  }
}

