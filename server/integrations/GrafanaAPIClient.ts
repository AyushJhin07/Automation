import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

export interface GrafanaCredentials extends APICredentials {
  apiKey: string;
  serverUrl: string;
}

export interface GrafanaCreateDashboardParams {
  title: string;
  tags?: string[];
  folder_id?: number;
  overwrite?: boolean;
  dashboard?: Record<string, any>;
}

export interface GrafanaUpdateDashboardParams extends GrafanaCreateDashboardParams {
  uid: string;
  dashboard: Record<string, any>;
}

export interface GrafanaCreateDatasourceParams {
  name: string;
  type: string;
  url: string;
  access?: 'proxy' | 'direct';
  basic_auth?: boolean;
  jsonData?: Record<string, any>;
  secureJsonData?: Record<string, any>;
}

export interface GrafanaCreateAlertRuleParams {
  title: string;
  condition: string;
  folder_uid?: string;
  interval_seconds?: number;
  no_data_state?: 'NoData' | 'Alerting' | 'OK';
  annotations?: Record<string, string>;
  labels?: Record<string, string>;
}

export interface GrafanaGetDashboardParams {
  uid: string;
}

export interface GrafanaListDashboardsParams {
  query?: string;
  folderIds?: number[];
  starred?: boolean;
}

export interface GrafanaListAlertRulesParams {
  folder_uid?: string;
  dashboard_uid?: string;
}

export class GrafanaAPIClient extends BaseAPIClient {
  constructor(credentials: GrafanaCredentials) {
    if (!credentials?.apiKey) {
      throw new Error('Grafana integration requires an apiKey credential.');
    }
    if (!credentials?.serverUrl) {
      throw new Error('Grafana integration requires a serverUrl credential.');
    }

    const normalizedUrl = credentials.serverUrl.replace(/\/$/, '');
    super(`${normalizedUrl}/api`, credentials);

    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'create_dashboard': this.createDashboard.bind(this) as any,
      'update_dashboard': this.updateDashboard.bind(this) as any,
      'delete_dashboard': this.deleteDashboard.bind(this) as any,
      'list_dashboards': this.listDashboards.bind(this) as any,
      'create_datasource': this.createDatasource.bind(this) as any,
      'create_alert_rule': this.createAlertRule.bind(this) as any,
      'list_alert_rules': this.listAlertRules.bind(this) as any,
      'get_dashboard': this.getDashboard.bind(this) as any,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const creds = this.credentials as GrafanaCredentials;
    return {
      Authorization: `Bearer ${creds.apiKey}`,
      'Content-Type': 'application/json'
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/health', this.getAuthHeaders());
  }

  public async createDashboard(params: GrafanaCreateDashboardParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['title']);
    const dashboardDefinition = params.dashboard ?? {
      title: params.title,
      tags: params.tags ?? [],
      panels: []
    };

    const payload = {
      dashboard: { ...dashboardDefinition, title: dashboardDefinition.title ?? params.title },
      folderId: params.folder_id,
      overwrite: params.overwrite ?? false
    };

    return this.post('/dashboards/db', payload, this.getAuthHeaders());
  }

  public async updateDashboard(params: GrafanaUpdateDashboardParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['uid', 'dashboard']);

    const dashboardDefinition = { ...params.dashboard };
    if (!dashboardDefinition.uid) {
      dashboardDefinition.uid = params.uid;
    }
    if (!dashboardDefinition.title && params.title) {
      dashboardDefinition.title = params.title;
    }
    if (params.tags && !dashboardDefinition.tags) {
      dashboardDefinition.tags = params.tags;
    }

    const payload = {
      dashboard: dashboardDefinition,
      folderId: params.folder_id,
      overwrite: params.overwrite ?? true,
    };

    return this.post('/dashboards/db', payload, this.getAuthHeaders());
  }

  public async deleteDashboard(params: GrafanaGetDashboardParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['uid']);
    return this.delete(`/dashboards/uid/${params.uid}`, this.getAuthHeaders());
  }

  public async listDashboards(params: GrafanaListDashboardsParams = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString({
      query: params.query,
      folderIds: params.folderIds?.join(','),
      starred: params.starred ? 'true' : undefined,
      type: 'dash-db',
    });
    return this.get(`/search${query}`, this.getAuthHeaders());
  }

  public async createDatasource(params: GrafanaCreateDatasourceParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['name', 'type', 'url']);
    const payload = {
      name: params.name,
      type: params.type,
      url: params.url,
      access: params.access ?? 'proxy',
      basicAuth: params.basic_auth ?? false,
      jsonData: params.jsonData,
      secureJsonData: params.secureJsonData,
    };

    return this.post('/datasources', payload, this.getAuthHeaders());
  }

  public async createAlertRule(params: GrafanaCreateAlertRuleParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['title', 'condition']);
    const payload = {
      title: params.title,
      condition: params.condition,
      folderUID: params.folder_uid,
      intervalSeconds: params.interval_seconds ?? 60,
      noDataState: params.no_data_state ?? 'NoData',
      annotations: params.annotations,
      labels: params.labels,
    };

    return this.post('/alert-rules', payload, this.getAuthHeaders());
  }

  public async listAlertRules(params: GrafanaListAlertRulesParams = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString({
      folderUID: params.folder_uid,
      dashboardUID: params.dashboard_uid,
    });
    return this.get(`/alert-rules${query}`, this.getAuthHeaders());
  }

  public async getDashboard(params: GrafanaGetDashboardParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['uid']);
    return this.get(`/dashboards/uid/${params.uid}`, this.getAuthHeaders());
  }
}
