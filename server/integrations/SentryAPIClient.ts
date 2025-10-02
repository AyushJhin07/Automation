import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

export interface SentryCredentials extends APICredentials {
  accessToken?: string;
  apiKey?: string;
  baseUrl?: string;
}

export interface SentryListParams {
  cursor?: string;
}

export interface SentryGetProjectsParams extends SentryListParams {
  organizationSlug: string;
}

export interface SentryGetProjectParams {
  organizationSlug: string;
  projectSlug: string;
}

export interface SentryCreateProjectParams {
  organizationSlug: string;
  name: string;
  slug?: string;
  platform?: string;
  defaultRules?: boolean;
}

export interface SentryUpdateProjectParams extends SentryGetProjectParams {
  name?: string;
  slug?: string;
  platform?: string;
  isBookmarked?: boolean;
  digestsMinDelay?: number;
  digestsMaxDelay?: number;
}

export interface SentryGetIssuesParams extends SentryGetProjectParams {
  statsPeriod?: string;
  shortIdLookup?: boolean;
  query?: string;
  sort?: string;
  cursor?: string;
}

export interface SentryGetIssueParams {
  issueId: string;
}

export interface SentryUpdateIssueParams extends SentryGetIssueParams {
  status?: 'resolved' | 'unresolved' | 'ignored';
  statusDetails?: Record<string, any>;
  assignedTo?: string;
  hasSeen?: boolean;
  isBookmarked?: boolean;
  isSubscribed?: boolean;
  isPublic?: boolean;
}

export interface SentryGetEventsParams extends SentryGetIssueParams {
  full?: boolean;
  cursor?: string;
}

export interface SentryGetEventParams {
  organizationSlug: string;
  projectSlug: string;
  eventId: string;
}

export interface SentryCreateReleaseParams {
  organizationSlug: string;
  version: string;
  ref?: string;
  url?: string;
  projects: string[];
  dateReleased?: string;
  commits?: Array<Record<string, any>>;
  refs?: Array<Record<string, any>>;
}

export interface SentryGetReleasesParams extends SentryListParams {
  organizationSlug: string;
  query?: string;
  sort?: string;
}

export interface SentryFinalizeReleaseParams {
  organizationSlug: string;
  version: string;
  dateReleased?: string;
}

export interface SentryGetTeamsParams extends SentryListParams {
  organizationSlug: string;
}

export class SentryAPIClient extends BaseAPIClient {
  constructor(credentials: SentryCredentials) {
    const baseUrl = (credentials.baseUrl ?? 'https://sentry.io/api/0').replace(/\/$/, '');

    if (!credentials.accessToken && !credentials.apiKey) {
      throw new Error('Sentry integration requires an access token or API key credential.');
    }

    super(baseUrl, credentials);

    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'get_organizations': this.getOrganizations.bind(this) as any,
      'get_organization': this.getOrganization.bind(this) as any,
      'get_projects': this.getProjects.bind(this) as any,
      'get_project': this.getProject.bind(this) as any,
      'create_project': this.createProject.bind(this) as any,
      'update_project': this.updateProject.bind(this) as any,
      'get_issues': this.getIssues.bind(this) as any,
      'get_issue': this.getIssue.bind(this) as any,
      'update_issue': this.updateIssue.bind(this) as any,
      'delete_issue': this.deleteIssue.bind(this) as any,
      'get_events': this.getEvents.bind(this) as any,
      'get_event': this.getEvent.bind(this) as any,
      'create_release': this.createRelease.bind(this) as any,
      'get_releases': this.getReleases.bind(this) as any,
      'finalize_release': this.finalizeRelease.bind(this) as any,
      'get_teams': this.getTeams.bind(this) as any,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const creds = this.credentials as SentryCredentials;
    const token = creds.accessToken ?? creds.apiKey;
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/organizations/', this.getAuthHeaders());
  }

  public async getOrganizations(params: { member?: boolean; owner?: boolean } = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString({
      member: params.member ? '1' : undefined,
      owner: params.owner ? '1' : undefined,
    });
    return this.get(`/organizations/${query}`, this.getAuthHeaders());
  }

  public async getOrganization(params: { organizationSlug: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['organizationSlug']);
    return this.get(`/organizations/${params.organizationSlug}/`, this.getAuthHeaders());
  }

  public async getProjects(params: SentryGetProjectsParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['organizationSlug']);
    const query = this.buildQueryString({ cursor: params.cursor });
    return this.get(`/organizations/${params.organizationSlug}/projects/${query}`, this.getAuthHeaders());
  }

  public async getProject(params: SentryGetProjectParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['organizationSlug', 'projectSlug']);
    return this.get(`/projects/${params.organizationSlug}/${params.projectSlug}/`, this.getAuthHeaders());
  }

  public async createProject(params: SentryCreateProjectParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['organizationSlug', 'name']);
    const payload = {
      name: params.name,
      slug: params.slug,
      platform: params.platform,
      default_rules: params.defaultRules ?? true,
    };
    return this.post(`/organizations/${params.organizationSlug}/projects/`, payload, this.getAuthHeaders());
  }

  public async updateProject(params: SentryUpdateProjectParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['organizationSlug', 'projectSlug']);
    const payload = {
      name: params.name,
      slug: params.slug,
      platform: params.platform,
      isBookmarked: params.isBookmarked,
      digestsMinDelay: params.digestsMinDelay,
      digestsMaxDelay: params.digestsMaxDelay,
    };
    return this.put(`/projects/${params.organizationSlug}/${params.projectSlug}/`, payload, this.getAuthHeaders());
  }

  public async getIssues(params: SentryGetIssuesParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['organizationSlug', 'projectSlug']);
    const query = this.buildQueryString({
      statsPeriod: params.statsPeriod,
      shortIdLookup: params.shortIdLookup ? '1' : undefined,
      query: params.query,
      sort: params.sort,
      cursor: params.cursor,
    });
    return this.get(`/projects/${params.organizationSlug}/${params.projectSlug}/issues/${query}`, this.getAuthHeaders());
  }

  public async getIssue(params: SentryGetIssueParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['issueId']);
    return this.get(`/issues/${params.issueId}/`, this.getAuthHeaders());
  }

  public async updateIssue(params: SentryUpdateIssueParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['issueId']);
    const payload = {
      status: params.status,
      statusDetails: params.statusDetails,
      assignedTo: params.assignedTo,
      hasSeen: params.hasSeen,
      isBookmarked: params.isBookmarked,
      isSubscribed: params.isSubscribed,
      isPublic: params.isPublic,
    };
    return this.put(`/issues/${params.issueId}/`, payload, this.getAuthHeaders());
  }

  public async deleteIssue(params: SentryGetIssueParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['issueId']);
    return this.delete(`/issues/${params.issueId}/`, this.getAuthHeaders());
  }

  public async getEvents(params: SentryGetEventsParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['issueId']);
    const query = this.buildQueryString({
      full: params.full ? '1' : undefined,
      cursor: params.cursor,
    });
    return this.get(`/issues/${params.issueId}/events/${query}`, this.getAuthHeaders());
  }

  public async getEvent(params: SentryGetEventParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['organizationSlug', 'projectSlug', 'eventId']);
    return this.get(`/projects/${params.organizationSlug}/${params.projectSlug}/events/${params.eventId}/`, this.getAuthHeaders());
  }

  public async createRelease(params: SentryCreateReleaseParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['organizationSlug', 'version', 'projects']);
    const payload = {
      version: params.version,
      ref: params.ref,
      url: params.url,
      projects: params.projects,
      dateReleased: params.dateReleased,
      commits: params.commits,
      refs: params.refs,
    };
    return this.post(`/organizations/${params.organizationSlug}/releases/`, payload, this.getAuthHeaders());
  }

  public async getReleases(params: SentryGetReleasesParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['organizationSlug']);
    const query = this.buildQueryString({
      query: params.query,
      sort: params.sort,
      cursor: params.cursor,
    });
    return this.get(`/organizations/${params.organizationSlug}/releases/${query}`, this.getAuthHeaders());
  }

  public async finalizeRelease(params: SentryFinalizeReleaseParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['organizationSlug', 'version']);
    const payload = { dateReleased: params.dateReleased };
    return this.put(`/organizations/${params.organizationSlug}/releases/${params.version}/`, payload, this.getAuthHeaders());
  }

  public async getTeams(params: SentryGetTeamsParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['organizationSlug']);
    const query = this.buildQueryString({ cursor: params.cursor });
    return this.get(`/organizations/${params.organizationSlug}/teams/${query}`, this.getAuthHeaders());
  }
}
