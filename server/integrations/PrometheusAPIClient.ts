import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

export interface PrometheusCredentials extends APICredentials {
  serverUrl: string;
  username?: string;
  password?: string;
  accessToken?: string;
}

export interface PrometheusQueryMetricsParams {
  query: string;
  time?: string;
  timeout?: string;
}

export interface PrometheusQueryRangeParams {
  query: string;
  start: string;
  end: string;
  step: string;
  timeout?: string;
}

export interface PrometheusGetTargetsParams {
  state?: 'active' | 'dropped' | 'any';
}

export interface PrometheusGetAlertsParams {
  filter?: string;
}

export class PrometheusAPIClient extends BaseAPIClient {
  constructor(credentials: PrometheusCredentials) {
    if (!credentials?.serverUrl) {
      throw new Error('Prometheus integration requires a serverUrl credential.');
    }

    const baseUrl = credentials.serverUrl.replace(/\/$/, '');
    super(baseUrl, credentials);

    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'query_metrics': this.queryMetrics.bind(this) as any,
      'query_range': this.queryRange.bind(this) as any,
      'get_targets': this.getTargets.bind(this) as any,
      'get_alerts': this.getAlerts.bind(this) as any,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const creds = this.credentials as PrometheusCredentials;
    const headers: Record<string, string> = {};

    if (creds.accessToken) {
      headers.Authorization = `Bearer ${creds.accessToken}`;
    } else if (creds.username && creds.password) {
      const token = Buffer.from(`${creds.username}:${creds.password}`).toString('base64');
      headers.Authorization = `Basic ${token}`;
    }

    return headers;
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/api/v1/status/buildinfo', this.getAuthHeaders());
  }

  public async queryMetrics(params: PrometheusQueryMetricsParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['query']);
    const query = this.buildQueryString({
      query: params.query,
      time: params.time,
      timeout: params.timeout,
    });
    return this.get(`/api/v1/query${query}`, this.getAuthHeaders());
  }

  public async queryRange(params: PrometheusQueryRangeParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['query', 'start', 'end', 'step']);
    const query = this.buildQueryString({
      query: params.query,
      start: params.start,
      end: params.end,
      step: params.step,
      timeout: params.timeout,
    });
    return this.get(`/api/v1/query_range${query}`, this.getAuthHeaders());
  }

  public async getTargets(params: PrometheusGetTargetsParams = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString({
      state: params.state && params.state !== 'any' ? params.state : undefined,
    });
    return this.get(`/api/v1/targets${query}`, this.getAuthHeaders());
  }

  public async getAlerts(params: PrometheusGetAlertsParams = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString({
      filter: params.filter,
    });
    return this.get(`/api/v1/alerts${query}`, this.getAuthHeaders());
  }
}
