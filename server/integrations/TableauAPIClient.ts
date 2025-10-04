import { Buffer } from 'node:buffer';

import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

type TableauCredentials = APICredentials & {
  serverUrl: string;
  apiVersion?: string;
  personalAccessTokenName?: string;
  personalAccessTokenSecret?: string;
  siteId?: string;
  siteContentUrl?: string;
};

type SignInParams = {
  personalAccessTokenName?: string;
  personalAccessTokenSecret?: string;
  siteContentUrl?: string;
  siteId?: string;
};

type ListSitesParams = {
  pageSize?: number;
  pageNumber?: number;
};

type ListWorkbooksParams = {
  siteId?: string;
  pageSize?: number;
  pageNumber?: number;
  filter?: string;
  sort?: string;
  fields?: string;
};

type GetWorkbookParams = {
  siteId?: string;
  workbookId: string;
};

type UpdateWorkbookParams = GetWorkbookParams & {
  name?: string;
  description?: string;
  showTabs?: boolean;
  projectId?: string;
  ownerId?: string;
};

type PublishWorkbookFile = {
  filename: string;
  content: string;
  contentType?: string;
  encoding?: BufferEncoding;
};

type PublishWorkbookParams = {
  siteId?: string;
  projectId: string;
  workbookName: string;
  showTabs?: boolean;
  overwrite?: boolean;
  asJob?: boolean;
  workbookFile: PublishWorkbookFile;
};

type ListViewsParams = {
  siteId?: string;
  workbookId: string;
  pageSize?: number;
  pageNumber?: number;
  filter?: string;
};

type GetViewParams = {
  siteId?: string;
  viewId: string;
};

type QueryViewDataParams = {
  siteId?: string;
  viewId: string;
  maxAge?: number;
  params?: Record<string, unknown>;
};

type ListDatasourcesParams = {
  siteId?: string;
  pageSize?: number;
  pageNumber?: number;
  filter?: string;
};

type GetDatasourceParams = {
  siteId?: string;
  datasourceId: string;
};

type RefreshExtractParams = {
  siteId?: string;
  datasourceId: string;
};

type ListUsersParams = {
  siteId?: string;
  pageSize?: number;
  pageNumber?: number;
  filter?: string;
};

type ListProjectsParams = {
  siteId?: string;
  pageSize?: number;
  pageNumber?: number;
};

type CreateProjectParams = {
  siteId?: string;
  name: string;
  description?: string;
  contentPermissions?: 'LockedToProject' | 'ManagedByOwner';
  parentProjectId?: string;
};

type UpdateProjectParams = CreateProjectParams & {
  projectId: string;
};

type DeleteProjectParams = {
  siteId?: string;
  projectId: string;
};

/**
 * Minimal Tableau REST API client supporting personal access token authentication and
 * the catalogued automation actions.
 */
export class TableauAPIClient extends BaseAPIClient {
  private readonly apiVersion: string;
  private readonly serverUrl: string;

  constructor(credentials: TableauCredentials) {
    const serverUrl = TableauAPIClient.normalizeServerUrl(credentials.serverUrl);
    if (!serverUrl) {
      throw new Error('Tableau integration requires a serverUrl credential');
    }

    const apiVersion = credentials.apiVersion ?? '3.22';
    super(`${serverUrl}/api/${apiVersion}`, credentials);

    this.apiVersion = apiVersion;
    this.serverUrl = serverUrl;

    this.registerAliasHandlers({
      test_connection: 'testConnection',
      sign_in: 'signIn',
      get_sites: 'listSites',
      get_workbooks: 'listWorkbooks',
      get_workbook: 'getWorkbook',
      update_workbook: 'updateWorkbook',
      publish_workbook: 'publishWorkbook',
      get_views: 'listViews',
      get_view: 'getView',
      query_view_data: 'queryViewData',
      get_datasources: 'listDatasources',
      get_datasource: 'getDatasource',
      refresh_extract: 'refreshExtract',
      get_users: 'listUsers',
      get_projects: 'listProjects',
      create_project: 'createProject',
      update_project: 'updateProject',
      delete_project: 'deleteProject',
    });
  }

  private static normalizeServerUrl(url: string | undefined): string {
    if (!url) {
      return '';
    }

    const trimmed = url.trim();
    if (!trimmed) {
      return '';
    }

    return trimmed.replace(/\/$/, '');
  }

  private get tableauCredentials(): TableauCredentials {
    return this.credentials as TableauCredentials;
  }

  protected getAuthHeaders(): Record<string, string> {
    const token = this.tableauCredentials.accessToken;
    if (!token) {
      throw new Error('Tableau integration is missing an authenticated session token');
    }

    return {
      'X-Tableau-Auth': token,
      Accept: 'application/json',
    };
  }

  protected override async makeRequest<T = any>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    endpoint: string,
    data?: any,
    headers: Record<string, string> = {}
  ): Promise<APIResponse<T>> {
    if (!this.isAuthEndpoint(endpoint)) {
      await this.ensureAuthToken();
    }

    return super.makeRequest(method, endpoint, data, headers);
  }

  private isAuthEndpoint(endpoint: string): boolean {
    const normalized = endpoint.startsWith('http')
      ? new URL(endpoint).pathname
      : endpoint;

    return normalized.startsWith('/auth/signin') || normalized.startsWith('/auth/signout');
  }

  private async ensureAuthToken(overrides: SignInParams & { force?: boolean } = {}): Promise<void> {
    if (this.tableauCredentials.accessToken && !overrides.force) {
      return;
    }

    const response = await this.performSignIn(overrides);
    if (!response.success) {
      throw new Error(response.error ?? 'Failed to authenticate with Tableau');
    }

    const token = (response.data as any)?.credentials?.token ?? this.tableauCredentials.accessToken;
    if (!token) {
      throw new Error('Tableau sign-in response did not include an access token');
    }

    this.tableauCredentials.accessToken = token;

    const responseSiteId = (response.data as any)?.credentials?.site?.id;
    const resolvedSiteId = overrides.siteId ?? responseSiteId;
    if (resolvedSiteId) {
      this.tableauCredentials.siteId = resolvedSiteId;
    }

    if (overrides.siteContentUrl) {
      this.tableauCredentials.siteContentUrl = overrides.siteContentUrl;
    } else if ((response.data as any)?.credentials?.site?.contentUrl) {
      this.tableauCredentials.siteContentUrl = (response.data as any).credentials.site.contentUrl;
    }

    if (overrides.personalAccessTokenName) {
      this.tableauCredentials.personalAccessTokenName = overrides.personalAccessTokenName;
    }
    if (overrides.personalAccessTokenSecret) {
      this.tableauCredentials.personalAccessTokenSecret = overrides.personalAccessTokenSecret;
    }
  }

  private async performSignIn(params: SignInParams = {}): Promise<APIResponse<any>> {
    const credentials = this.tableauCredentials;
    const personalAccessTokenName = params.personalAccessTokenName ?? credentials.personalAccessTokenName;
    const personalAccessTokenSecret = params.personalAccessTokenSecret ?? credentials.personalAccessTokenSecret;

    if (!personalAccessTokenName || !personalAccessTokenSecret) {
      return {
        success: false,
        error: 'Tableau personal access token name and secret are required to authenticate',
      };
    }

    const siteContentUrl = params.siteContentUrl ?? credentials.siteContentUrl ?? '';
    const body: Record<string, any> = {
      credentials: {
        personalAccessTokenName,
        personalAccessTokenSecret,
      },
    };

    if (siteContentUrl) {
      body.credentials.site = { contentUrl: siteContentUrl };
    }

    const response = await super.makeRequest<any>('POST', '/auth/signin', body, {
      'Content-Type': 'application/json',
    });

    if (response.success) {
      const payload = (response.data as any)?.credentials ?? {};
      if (payload.token) {
        credentials.accessToken = payload.token;
      }
      if (payload.site?.id) {
        credentials.siteId = payload.site.id;
      }
      if (payload.site?.contentUrl) {
        credentials.siteContentUrl = payload.site.contentUrl;
      }
      credentials.personalAccessTokenName = personalAccessTokenName;
      credentials.personalAccessTokenSecret = personalAccessTokenSecret;
    }

    return response;
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.listSites();
  }

  public async signIn(params: SignInParams = {}): Promise<APIResponse<any>> {
    return this.performSignIn(params);
  }

  public async listSites(params: ListSitesParams = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString({
      pageSize: params.pageSize,
      pageNumber: params.pageNumber,
    });

    return this.get(`/sites${query}`);
  }

  public async listWorkbooks(params: ListWorkbooksParams = {}): Promise<APIResponse<any>> {
    const siteId = this.resolveSiteId(params.siteId);
    const query = this.buildQueryString({
      pageSize: params.pageSize,
      pageNumber: params.pageNumber,
      filter: params.filter,
      sort: params.sort,
      fields: params.fields,
    });

    return this.get(`${this.buildSitePath(siteId, '/workbooks')}${query}`);
  }

  public async getWorkbook(params: GetWorkbookParams): Promise<APIResponse<any>> {
    const siteId = this.resolveSiteId(params.siteId);
    const workbookId = this.encodeId(params.workbookId);

    return this.get(this.buildSitePath(siteId, `/workbooks/${workbookId}`));
  }

  public async updateWorkbook(params: UpdateWorkbookParams): Promise<APIResponse<any>> {
    const siteId = this.resolveSiteId(params.siteId);
    const workbookId = this.encodeId(params.workbookId);
    const workbookPayload: Record<string, any> = {};

    if (params.name !== undefined) workbookPayload.name = params.name;
    if (params.description !== undefined) workbookPayload.description = params.description;
    if (params.showTabs !== undefined) workbookPayload.showTabs = params.showTabs;
    if (params.projectId) workbookPayload.project = { id: params.projectId };
    if (params.ownerId) workbookPayload.owner = { id: params.ownerId };

    return this.put(this.buildSitePath(siteId, `/workbooks/${workbookId}`), {
      workbook: workbookPayload,
    });
  }

  public async publishWorkbook(params: PublishWorkbookParams): Promise<APIResponse<any>> {
    const siteId = this.resolveSiteId(params.siteId);
    const form = this.buildWorkbookFormData(params);
    const query = this.buildQueryString({
      overwrite: params.overwrite,
      asJob: params.asJob,
    });

    return this.post(this.buildSitePath(siteId, `/workbooks${query}`), form, {
      Accept: 'application/json',
    });
  }

  public async listViews(params: ListViewsParams): Promise<APIResponse<any>> {
    const siteId = this.resolveSiteId(params.siteId);
    const workbookId = this.encodeId(params.workbookId);
    const query = this.buildQueryString({
      pageSize: params.pageSize,
      pageNumber: params.pageNumber,
      filter: params.filter,
    });

    return this.get(this.buildSitePath(siteId, `/workbooks/${workbookId}/views${query}`));
  }

  public async getView(params: GetViewParams): Promise<APIResponse<any>> {
    const siteId = this.resolveSiteId(params.siteId);
    const viewId = this.encodeId(params.viewId);

    return this.get(this.buildSitePath(siteId, `/views/${viewId}`));
  }

  public async queryViewData(params: QueryViewDataParams): Promise<APIResponse<any>> {
    const siteId = this.resolveSiteId(params.siteId);
    const viewId = this.encodeId(params.viewId);
    const queryParams: Record<string, unknown> = {};

    if (params.maxAge !== undefined) {
      queryParams.maxAge = params.maxAge;
    }

    if (params.params) {
      for (const [key, value] of Object.entries(params.params)) {
        queryParams[key] = value;
      }
    }

    const query = this.buildQueryString(queryParams);
    return this.get(this.buildSitePath(siteId, `/views/${viewId}/data${query}`));
  }

  public async listDatasources(params: ListDatasourcesParams = {}): Promise<APIResponse<any>> {
    const siteId = this.resolveSiteId(params.siteId);
    const query = this.buildQueryString({
      pageSize: params.pageSize,
      pageNumber: params.pageNumber,
      filter: params.filter,
    });

    return this.get(this.buildSitePath(siteId, `/datasources${query}`));
  }

  public async getDatasource(params: GetDatasourceParams): Promise<APIResponse<any>> {
    const siteId = this.resolveSiteId(params.siteId);
    const datasourceId = this.encodeId(params.datasourceId);

    return this.get(this.buildSitePath(siteId, `/datasources/${datasourceId}`));
  }

  public async refreshExtract(params: RefreshExtractParams): Promise<APIResponse<any>> {
    const siteId = this.resolveSiteId(params.siteId);
    const datasourceId = this.encodeId(params.datasourceId);

    return this.post(this.buildSitePath(siteId, `/datasources/${datasourceId}/refreshes`));
  }

  public async listUsers(params: ListUsersParams = {}): Promise<APIResponse<any>> {
    const siteId = this.resolveSiteId(params.siteId);
    const query = this.buildQueryString({
      pageSize: params.pageSize,
      pageNumber: params.pageNumber,
      filter: params.filter,
    });

    return this.get(this.buildSitePath(siteId, `/users${query}`));
  }

  public async listProjects(params: ListProjectsParams = {}): Promise<APIResponse<any>> {
    const siteId = this.resolveSiteId(params.siteId);
    const query = this.buildQueryString({
      pageSize: params.pageSize,
      pageNumber: params.pageNumber,
    });

    return this.get(this.buildSitePath(siteId, `/projects${query}`));
  }

  public async createProject(params: CreateProjectParams): Promise<APIResponse<any>> {
    const siteId = this.resolveSiteId(params.siteId);
    const projectPayload: Record<string, any> = {
      name: params.name,
    };

    if (params.description !== undefined) projectPayload.description = params.description;
    if (params.contentPermissions !== undefined) projectPayload.contentPermissions = params.contentPermissions;
    if (params.parentProjectId) projectPayload.parentProjectId = params.parentProjectId;

    return this.post(this.buildSitePath(siteId, '/projects'), {
      project: projectPayload,
    });
  }

  public async updateProject(params: UpdateProjectParams): Promise<APIResponse<any>> {
    const siteId = this.resolveSiteId(params.siteId);
    const projectId = this.encodeId(params.projectId);
    const projectPayload: Record<string, any> = {};

    if (params.name !== undefined) projectPayload.name = params.name;
    if (params.description !== undefined) projectPayload.description = params.description;
    if (params.contentPermissions !== undefined) projectPayload.contentPermissions = params.contentPermissions;
    if (params.parentProjectId) projectPayload.parentProjectId = params.parentProjectId;

    return this.put(this.buildSitePath(siteId, `/projects/${projectId}`), {
      project: projectPayload,
    });
  }

  public async deleteProject(params: DeleteProjectParams): Promise<APIResponse<any>> {
    const siteId = this.resolveSiteId(params.siteId);
    const projectId = this.encodeId(params.projectId);

    return this.delete(this.buildSitePath(siteId, `/projects/${projectId}`));
  }

  private resolveSiteId(explicitSiteId?: string): string {
    const siteId = explicitSiteId ?? this.tableauCredentials.siteId;
    if (!siteId) {
      throw new Error('Tableau requests require a siteId. Provide one in the action parameters or connection credentials.');
    }
    return siteId;
  }

  private buildSitePath(siteId: string, suffix: string): string {
    const normalizedSuffix = suffix.startsWith('/') ? suffix : `/${suffix}`;
    return `/sites/${this.encodeId(siteId)}${normalizedSuffix}`;
  }

  private encodeId(id: string): string {
    return encodeURIComponent(id);
  }

  private buildQueryString(params: Record<string, unknown>): string {
    const query = new URLSearchParams();

    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === '') {
        continue;
      }

      if (Array.isArray(value)) {
        for (const item of value) {
          if (item !== undefined && item !== null) {
            query.append(key, String(item));
          }
        }
        continue;
      }

      if (typeof value === 'boolean') {
        query.set(key, value ? 'true' : 'false');
        continue;
      }

      query.set(key, String(value));
    }

    const serialized = query.toString();
    return serialized ? `?${serialized}` : '';
  }

  private buildWorkbookFormData(params: PublishWorkbookParams): FormData {
    const { workbookFile } = params;
    if (!workbookFile?.filename || !workbookFile.content) {
      throw new Error('Publishing a workbook requires a filename and content payload');
    }

    const encoding = workbookFile.encoding ?? 'base64';
    let buffer: Buffer;
    try {
      buffer = Buffer.from(workbookFile.content, encoding);
    } catch (error) {
      throw new Error(`Failed to decode workbook content using ${encoding} encoding: ${(error as Error).message}`);
    }

    const blob = new Blob([buffer], {
      type: workbookFile.contentType ?? 'application/octet-stream',
    });

    const form = new FormData();
    form.set(
      'request_payload',
      JSON.stringify({
        workbook: {
          name: params.workbookName,
          showTabs: params.showTabs ?? false,
          project: { id: params.projectId },
        },
      })
    );
    form.set('tableau_workbook', blob, workbookFile.filename);

    return form;
  }
}
