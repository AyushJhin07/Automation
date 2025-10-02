import { APIResponse, BaseAPIClient } from './BaseAPIClient';

type PaginationParams = {
  cursor?: string;
};

type OrganizationScopedParams = {
  organizationSlug: string;
};

type ProjectScopedParams = OrganizationScopedParams & {
  projectSlug: string;
};

type GetOrganizationsParams = {
  member?: boolean;
  owner?: boolean;
} & PaginationParams;

type CreateProjectParams = OrganizationScopedParams & {
  name: string;
  slug?: string;
  platform?: string;
  defaultRules?: boolean;
};

type UpdateProjectParams = ProjectScopedParams & {
  name?: string;
  slug?: string;
  platform?: string;
  isBookmarked?: boolean;
};

type GetIssuesParams = ProjectScopedParams & {
  statsPeriod?: '14d' | '24h';
  shortIdLookup?: boolean;
  query?: string;
  sort?: 'date' | 'new' | 'priority' | 'freq' | 'user';
} & PaginationParams;

type IssueIdentifierParams = {
  issueId: string;
};

type UpdateIssueParams = IssueIdentifierParams & {
  status?: 'resolved' | 'unresolved' | 'ignored';
  statusDetails?: Record<string, unknown>;
  assignedTo?: string;
  hasSeen?: boolean;
  isBookmarked?: boolean;
  isSubscribed?: boolean;
  inbox?: { state: string };
};

type GetEventsParams = IssueIdentifierParams & {
  full?: boolean;
} & PaginationParams;

type GetEventParams = ProjectScopedParams & {
  eventId: string;
};

type CreateReleaseParams = OrganizationScopedParams & {
  version: string;
  ref?: string;
  url?: string;
  projects: string[];
  dateReleased?: string;
  commits?: Array<Record<string, unknown>>;
  refs?: Array<Record<string, unknown>>;
};

type GetReleasesParams = OrganizationScopedParams & {
  query?: string;
  sort?: 'date' | 'date_added' | 'sessions';
} & PaginationParams;

type FinalizeReleaseParams = OrganizationScopedParams & {
  version: string;
  dateReleased?: string;
};

type GetTeamsParams = OrganizationScopedParams & PaginationParams;

export interface SentryAPIClientConfig {
  apiKey: string;
  baseUrl?: string;
}

const DEFAULT_BASE_URL = 'https://sentry.io/api/0';

export class SentryAPIClient extends BaseAPIClient {
  constructor(config: SentryAPIClientConfig) {
    super((config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, ''), { apiKey: config.apiKey });

    this.registerHandlers({
      test_connection: () => this.testConnection(),
      get_organizations: params => this.getOrganizations(params as GetOrganizationsParams),
      get_organization: params => this.getOrganization(params as OrganizationScopedParams),
      get_projects: params => this.getProjects(params as OrganizationScopedParams & PaginationParams),
      get_project: params => this.getProject(params as ProjectScopedParams),
      create_project: params => this.createProject(params as CreateProjectParams),
      update_project: params => this.updateProject(params as UpdateProjectParams),
      get_issues: params => this.getIssues(params as GetIssuesParams),
      get_issue: params => this.getIssue(params as IssueIdentifierParams),
      update_issue: params => this.updateIssue(params as UpdateIssueParams),
      delete_issue: params => this.deleteIssue(params as IssueIdentifierParams),
      get_events: params => this.getEvents(params as GetEventsParams),
      get_event: params => this.getEvent(params as GetEventParams),
      create_release: params => this.createRelease(params as CreateReleaseParams),
      get_releases: params => this.getReleases(params as GetReleasesParams),
      finalize_release: params => this.finalizeRelease(params as FinalizeReleaseParams),
      get_teams: params => this.getTeams(params as GetTeamsParams)
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const apiKey = (this.credentials as { apiKey?: string }).apiKey;
    if (!apiKey) {
      throw new Error('Sentry API key is required');
    }
    return {
      Authorization: `Bearer ${apiKey}`
    };
  }

  public testConnection(): Promise<APIResponse> {
    return this.get('/organizations/');
  }

  public getOrganizations(params: GetOrganizationsParams = {}): Promise<APIResponse> {
    const query = this.buildQueryString({
      member: params.member,
      owner: params.owner,
      cursor: params.cursor
    });
    return this.get(`/organizations/${query}`);
  }

  public getOrganization(params: OrganizationScopedParams): Promise<APIResponse> {
    this.validateRequiredParams(params, ['organizationSlug']);
    return this.get(`/organizations/${encodeURIComponent(params.organizationSlug)}/`);
  }

  public getProjects(params: OrganizationScopedParams & PaginationParams): Promise<APIResponse> {
    this.validateRequiredParams(params, ['organizationSlug']);
    const query = this.buildQueryString({ cursor: params.cursor });
    return this.get(`/organizations/${encodeURIComponent(params.organizationSlug)}/projects/${query}`);
  }

  public getProject(params: ProjectScopedParams): Promise<APIResponse> {
    this.validateRequiredParams(params, ['organizationSlug', 'projectSlug']);
    return this.get(`/projects/${encodeURIComponent(params.organizationSlug)}/${encodeURIComponent(params.projectSlug)}/`);
  }

  public createProject(params: CreateProjectParams): Promise<APIResponse> {
    this.validateRequiredParams(params, ['organizationSlug', 'name']);
    const body = {
      name: params.name,
      slug: params.slug,
      platform: params.platform,
      default_rules: params.defaultRules ?? true
    };
    return this.post(`/organizations/${encodeURIComponent(params.organizationSlug)}/projects/`, body);
  }

  public updateProject(params: UpdateProjectParams): Promise<APIResponse> {
    this.validateRequiredParams(params, ['organizationSlug', 'projectSlug']);
    const body = {
      name: params.name,
      slug: params.slug,
      platform: params.platform,
      isBookmarked: params.isBookmarked
    };
    return this.put(
      `/projects/${encodeURIComponent(params.organizationSlug)}/${encodeURIComponent(params.projectSlug)}/`,
      body
    );
  }

  public getIssues(params: GetIssuesParams): Promise<APIResponse> {
    this.validateRequiredParams(params, ['organizationSlug', 'projectSlug']);
    const query = this.buildQueryString({
      statsPeriod: params.statsPeriod,
      shortIdLookup: params.shortIdLookup,
      query: params.query,
      sort: params.sort,
      cursor: params.cursor
    });
    return this.get(
      `/projects/${encodeURIComponent(params.organizationSlug)}/${encodeURIComponent(params.projectSlug)}/issues/${query}`
    );
  }

  public getIssue(params: IssueIdentifierParams): Promise<APIResponse> {
    this.validateRequiredParams(params, ['issueId']);
    return this.get(`/issues/${encodeURIComponent(params.issueId)}/`);
  }

  public updateIssue(params: UpdateIssueParams): Promise<APIResponse> {
    this.validateRequiredParams(params, ['issueId']);
    const body = {
      status: params.status,
      statusDetails: params.statusDetails,
      assignedTo: params.assignedTo,
      hasSeen: params.hasSeen,
      isBookmarked: params.isBookmarked,
      isSubscribed: params.isSubscribed,
      inbox: params.inbox
    };
    return this.put(`/issues/${encodeURIComponent(params.issueId)}/`, body);
  }

  public deleteIssue(params: IssueIdentifierParams): Promise<APIResponse> {
    this.validateRequiredParams(params, ['issueId']);
    return this.delete(`/issues/${encodeURIComponent(params.issueId)}/`);
  }

  public getEvents(params: GetEventsParams): Promise<APIResponse> {
    this.validateRequiredParams(params, ['issueId']);
    const query = this.buildQueryString({ full: params.full, cursor: params.cursor });
    return this.get(`/issues/${encodeURIComponent(params.issueId)}/events/${query}`);
  }

  public getEvent(params: GetEventParams): Promise<APIResponse> {
    this.validateRequiredParams(params, ['organizationSlug', 'projectSlug', 'eventId']);
    return this.get(
      `/projects/${encodeURIComponent(params.organizationSlug)}/${encodeURIComponent(params.projectSlug)}/events/${encodeURIComponent(params.eventId)}/`
    );
  }

  public createRelease(params: CreateReleaseParams): Promise<APIResponse> {
    this.validateRequiredParams(params, ['organizationSlug', 'version', 'projects']);
    const body = {
      version: params.version,
      ref: params.ref,
      url: params.url,
      projects: params.projects,
      dateReleased: params.dateReleased,
      commits: params.commits,
      refs: params.refs
    };
    return this.post(`/organizations/${encodeURIComponent(params.organizationSlug)}/releases/`, body);
  }

  public getReleases(params: GetReleasesParams): Promise<APIResponse> {
    this.validateRequiredParams(params, ['organizationSlug']);
    const query = this.buildQueryString({ query: params.query, sort: params.sort, cursor: params.cursor });
    return this.get(`/organizations/${encodeURIComponent(params.organizationSlug)}/releases/${query}`);
  }

  public finalizeRelease(params: FinalizeReleaseParams): Promise<APIResponse> {
    this.validateRequiredParams(params, ['organizationSlug', 'version']);
    const body = params.dateReleased ? { dateReleased: params.dateReleased } : undefined;
    return this.put(
      `/organizations/${encodeURIComponent(params.organizationSlug)}/releases/${encodeURIComponent(params.version)}/`,
      body
    );
  }

  public getTeams(params: GetTeamsParams): Promise<APIResponse> {
    this.validateRequiredParams(params, ['organizationSlug']);
    const query = this.buildQueryString({ cursor: params.cursor });
    return this.get(`/organizations/${encodeURIComponent(params.organizationSlug)}/teams/${query}`);
  }
}
