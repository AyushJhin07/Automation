import { APIResponse, BaseAPIClient } from './BaseAPIClient';

export interface GrafanaAPIClientConfig {
  apiKey: string;
  serverUrl?: string;
}

type CreateDashboardParams = {
  title: string;
  tags?: string[];
  folder_id?: number;
  overwrite?: boolean;
  dashboard?: Record<string, unknown>;
};

type CreateDatasourceParams = {
  name: string;
  type: string;
  url: string;
  access?: 'proxy' | 'direct';
  basic_auth?: boolean;
  jsonData?: Record<string, unknown>;
  secureJsonData?: Record<string, unknown>;
};

type CreateAlertRuleParams = {
  title: string;
  condition: string;
  folder_uid?: string;
  interval_seconds?: number;
  no_data_state?: 'NoData' | 'Alerting' | 'OK';
  data?: unknown;
  annotations?: Record<string, string>;
};

type GetDashboardParams = {
  uid: string;
};

const DEFAULT_BASE_URL = 'https://your-grafana.com/api';

export class GrafanaAPIClient extends BaseAPIClient {
  constructor(config: GrafanaAPIClientConfig) {
    super((config.serverUrl ?? DEFAULT_BASE_URL).replace(/\/$/, ''), { apiKey: config.apiKey });

    this.registerHandlers({
      test_connection: () => this.testConnection(),
      create_dashboard: params => this.createDashboard(params as CreateDashboardParams),
      create_datasource: params => this.createDatasource(params as CreateDatasourceParams),
      create_alert_rule: params => this.createAlertRule(params as CreateAlertRuleParams),
      get_dashboard: params => this.getDashboard(params as GetDashboardParams)
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const apiKey = (this.credentials as { apiKey?: string }).apiKey;
    if (!apiKey) {
      throw new Error('Grafana API key is required');
    }

    return {
      Authorization: `Bearer ${apiKey}`
    };
  }

  public testConnection(): Promise<APIResponse> {
    return this.get('/health');
  }

  public createDashboard(params: CreateDashboardParams): Promise<APIResponse> {
    this.validateRequiredParams(params, ['title']);
    const dashboardDefinition = params.dashboard ?? {
      title: params.title,
      tags: params.tags ?? [],
      panels: []
    };

    const payload = {
      dashboard: dashboardDefinition,
      folderId: params.folder_id,
      overwrite: params.overwrite ?? false,
      message: 'Created via Automation'
    };

    return this.post('/dashboards/db', payload);
  }

  public createDatasource(params: CreateDatasourceParams): Promise<APIResponse> {
    this.validateRequiredParams(params, ['name', 'type', 'url']);
    return this.post('/datasources', {
      name: params.name,
      type: params.type,
      url: params.url,
      access: params.access ?? 'proxy',
      basicAuth: params.basic_auth ?? false,
      jsonData: params.jsonData,
      secureJsonData: params.secureJsonData
    });
  }

  public createAlertRule(params: CreateAlertRuleParams): Promise<APIResponse> {
    this.validateRequiredParams(params, ['title', 'condition']);
    const body = {
      title: params.title,
      condition: params.condition,
      folderUID: params.folder_uid,
      intervalSeconds: params.interval_seconds ?? 60,
      noDataState: params.no_data_state ?? 'NoData',
      data: params.data,
      annotations: params.annotations
    };

    return this.post('/alert-rules', body);
  }

  public getDashboard(params: GetDashboardParams): Promise<APIResponse> {
    this.validateRequiredParams(params, ['uid']);
    return this.get(`/dashboards/uid/${encodeURIComponent(params.uid)}`);
  }
}
