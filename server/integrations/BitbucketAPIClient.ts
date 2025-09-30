import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

export class BitbucketAPIClient extends BaseAPIClient {
  constructor(credentials: APICredentials) {
    const baseUrl = credentials.baseUrl || 'https://api.bitbucket.org/2.0';
    super(baseUrl, credentials);
    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'create_issue': this.createIssue.bind(this) as any,
      'create_pull_request': this.createPullRequest.bind(this) as any,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    if (this.credentials.accessToken) {
      return {
        Authorization: `Bearer ${this.credentials.accessToken}`,
        'Content-Type': 'application/json'
      };
    }
    if (this.credentials.username && this.credentials.password) {
      const basic = Buffer.from(`${this.credentials.username}:${this.credentials.password}`).toString('base64');
      return {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/json'
      };
    }
    throw new Error('Bitbucket integration requires accessToken or username/password');
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/user', this.getAuthHeaders());
  }

  public async createIssue(params: { workspace: string; repoSlug: string; title: string; content?: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['workspace', 'repoSlug', 'title']);
    return this.post(`/repositories/${params.workspace}/${params.repoSlug}/issues`, {
      title: params.title,
      content: params.content ? { raw: params.content } : undefined
    }, this.getAuthHeaders());
  }

  public async createPullRequest(params: { workspace: string; repoSlug: string; title: string; sourceBranch: string; destinationBranch: string; description?: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['workspace', 'repoSlug', 'title', 'sourceBranch', 'destinationBranch']);
    return this.post(`/repositories/${params.workspace}/${params.repoSlug}/pullrequests`, {
      title: params.title,
      source: { branch: { name: params.sourceBranch } },
      destination: { branch: { name: params.destinationBranch } },
      summary: params.description ? { raw: params.description } : undefined
    }, this.getAuthHeaders());
  }
}

