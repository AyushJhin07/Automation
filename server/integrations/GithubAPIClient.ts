import { BaseAPIClient, APICredentials, APIResponse } from './BaseAPIClient';

export interface GithubCredentials extends APICredentials {
  accessToken: string;
}

interface RepositoryParams {
  owner: string;
  repo: string;
}

interface IssueParams extends RepositoryParams {
  issue_number: number;
}

interface CommentParams extends IssueParams {
  body: string;
}

/**
 * Minimal-yet-complete GitHub REST client that satisfies the actions and triggers defined in
 * connectors/github.json. The implementation sticks to the official v3 REST endpoints so we can
 * authenticate with personal or installation access tokens.
 */
export class GithubAPIClient extends BaseAPIClient {
  constructor(credentials: GithubCredentials) {
    if (!credentials?.accessToken) {
      throw new Error('GitHub integration requires an access token');
    }

    super('https://api.github.com', credentials);
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.credentials.accessToken}`,
      Accept: 'application/vnd.github+json'
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/user');
  }

  public async listRepositories(params: { visibility?: 'all' | 'public' | 'private'; affiliation?: string; per_page?: number }): Promise<APIResponse<any>> {
    const searchParams = new URLSearchParams();
    if (params.visibility) searchParams.set('visibility', params.visibility);
    if (params.affiliation) searchParams.set('affiliation', params.affiliation);
    if (params.per_page) searchParams.set('per_page', String(params.per_page));
    const qs = searchParams.toString();
    return this.get(`/user/repos${qs ? `?${qs}` : ''}`);
  }

  public async listCommits(params: RepositoryParams & { sha?: string; since?: string; until?: string; per_page?: number }): Promise<APIResponse<any>> {
    const searchParams = new URLSearchParams();
    if (params.sha) searchParams.set('sha', params.sha);
    if (params.since) searchParams.set('since', params.since);
    if (params.until) searchParams.set('until', params.until);
    if (params.per_page) searchParams.set('per_page', String(params.per_page));
    const qs = searchParams.toString();
    return this.get(`/repos/${params.owner}/${params.repo}/commits${qs ? `?${qs}` : ''}`);
  }

  public async createIssue(params: RepositoryParams & { title: string; body?: string; assignees?: string[]; labels?: string[] }): Promise<APIResponse<any>> {
    const payload = this.clean({
      title: params.title,
      body: params.body,
      assignees: params.assignees,
      labels: params.labels
    });
    return this.post(`/repos/${params.owner}/${params.repo}/issues`, payload);
  }

  public async updateIssue(params: IssueParams & { title?: string; body?: string; state?: 'open' | 'closed'; assignees?: string[]; labels?: string[] }): Promise<APIResponse<any>> {
    const payload = this.clean({
      title: params.title,
      body: params.body,
      state: params.state,
      assignees: params.assignees,
      labels: params.labels
    });
    return this.patch(`/repos/${params.owner}/${params.repo}/issues/${params.issue_number}`, payload);
  }

  public async createComment(params: CommentParams): Promise<APIResponse<any>> {
    const payload = { body: params.body };
    return this.post(`/repos/${params.owner}/${params.repo}/issues/${params.issue_number}/comments`, payload);
  }

  public async issueOpened(params: RepositoryParams & { since?: string }): Promise<APIResponse<any>> {
    const searchParams = new URLSearchParams({
      state: 'open'
    });
    if (params.since) {
      searchParams.set('since', params.since);
    }
    const qs = searchParams.toString();
    return this.get(`/repos/${params.owner}/${params.repo}/issues${qs ? `?${qs}` : ''}`);
  }

  public async pullRequestOpened(params: RepositoryParams & { state?: 'open' | 'all' | 'closed'; per_page?: number }): Promise<APIResponse<any>> {
    const searchParams = new URLSearchParams();
    searchParams.set('state', params.state ?? 'open');
    if (params.per_page) searchParams.set('per_page', String(params.per_page));
    const qs = searchParams.toString();
    return this.get(`/repos/${params.owner}/${params.repo}/pulls${qs ? `?${qs}` : ''}`);
  }

  private clean<T extends Record<string, any>>(value: T): T {
    return Object.fromEntries(
      Object.entries(value).filter(([, v]) => v !== undefined && v !== null)
    ) as T;
  }
}
