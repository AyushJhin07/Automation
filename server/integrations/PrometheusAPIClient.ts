import { APIResponse, BaseAPIClient } from './BaseAPIClient';

export interface PrometheusAPIClientConfig {
  serverUrl?: string;
  username?: string;
  password?: string;
}

type QueryMetricsParams = {
  query: string;
  time?: string;
  timeout?: string;
};

type QueryRangeParams = {
  query: string;
  start: string;
  end: string;
  step: string;
  timeout?: string;
};

type GetTargetsParams = {
  state?: 'active' | 'dropped' | 'any';
};

type GetAlertsParams = {
  filter?: string;
};

const DEFAULT_BASE_URL = 'http://prometheus-server:9090';

export class PrometheusAPIClient extends BaseAPIClient {
  constructor(config: PrometheusAPIClientConfig = {}) {
    super((config.serverUrl ?? DEFAULT_BASE_URL).replace(/\/$/, ''), {
      username: config.username,
      password: config.password
    });

    this.registerHandlers({
      test_connection: () => this.testConnection(),
      query_metrics: params => this.queryMetrics(params as QueryMetricsParams),
      query_range: params => this.queryRange(params as QueryRangeParams),
      get_targets: params => this.getTargets(params as GetTargetsParams),
      get_alerts: params => this.getAlerts(params as GetAlertsParams)
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    const creds = this.credentials as { username?: string; password?: string };
    if (creds.username && creds.password) {
      const encoded = Buffer.from(`${creds.username}:${creds.password}`).toString('base64');
      headers.Authorization = `Basic ${encoded}`;
    }
    return headers;
  }

  public testConnection(): Promise<APIResponse> {
    return this.get('/-/ready');
  }

  public queryMetrics(params: QueryMetricsParams): Promise<APIResponse> {
    this.validateRequiredParams(params, ['query']);
    const queryParams = this.buildQueryString({
      query: params.query,
      time: params.time,
      timeout: params.timeout
    });
    return this.get(`/api/v1/query${queryParams}`);
  }

  public queryRange(params: QueryRangeParams): Promise<APIResponse> {
    this.validateRequiredParams(params, ['query', 'start', 'end', 'step']);
    const queryParams = this.buildQueryString({
      query: params.query,
      start: params.start,
      end: params.end,
      step: params.step,
      timeout: params.timeout
    });
    return this.get(`/api/v1/query_range${queryParams}`);
  }

  public getTargets(params: GetTargetsParams = {}): Promise<APIResponse> {
    const queryParams = this.buildQueryString({ state: params.state });
    return this.get(`/api/v1/targets${queryParams}`);
  }

  public getAlerts(params: GetAlertsParams = {}): Promise<APIResponse> {
    const queryParams = this.buildQueryString({ filter: params.filter });
    return this.get(`/api/v1/alerts${queryParams}`);
  }
}
