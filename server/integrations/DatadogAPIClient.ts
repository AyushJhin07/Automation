import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

export interface DatadogCredentials extends APICredentials {
  apiKey: string;
  appKey?: string;
  site?: string;
  baseUrl?: string;
}

export interface DatadogMetricPoint extends Array<number> {}

export interface DatadogMetricSeries {
  metric: string;
  points: DatadogMetricPoint[];
  type?: 'gauge' | 'rate' | 'count';
  interval?: number;
  host?: string;
  tags?: string[];
  unit?: string;
}

export interface DatadogSubmitMetricsParams {
  series: DatadogMetricSeries[];
}

export interface DatadogQueryMetricsParams {
  query: string;
  from: number;
  to: number;
}

export interface DatadogCreateEventParams {
  title: string;
  text: string;
  date_happened?: number;
  priority?: 'normal' | 'low';
  host?: string;
  tags?: string[];
  alert_type?: 'error' | 'warning' | 'info' | 'success';
  aggregation_key?: string;
  source_type_name?: string;
}

export interface DatadogGetEventsParams {
  start: number;
  end: number;
  priority?: 'normal' | 'low';
  sources?: string;
  tags?: string;
  unaggregated?: boolean;
}

export interface DatadogCreateMonitorParams {
  type: string;
  query: string;
  name: string;
  message?: string;
  options?: Record<string, any>;
  tags?: string[];
  multi?: boolean;
  restricted_roles?: string[];
}

export interface DatadogGetMonitorsParams {
  group_states?: string[];
  name?: string;
  tags?: string[];
  monitor_tags?: string[];
  with_downtimes?: boolean;
  id_offset?: number;
  page?: number;
  page_size?: number;
}

export class DatadogAPIClient extends BaseAPIClient {
  constructor(credentials: DatadogCredentials) {
    if (!credentials?.apiKey) {
      throw new Error('Datadog integration requires an apiKey credential.');
    }

    const site = credentials.site ? credentials.site.replace(/^https?:\/\//, '') : 'datadoghq.com';
    const baseUrl = credentials.baseUrl ?? `https://api.${site}/api/v1`;

    super(baseUrl, credentials);

    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'submit_metrics': this.submitMetrics.bind(this) as any,
      'query_metrics': this.queryMetrics.bind(this) as any,
      'create_event': this.createEvent.bind(this) as any,
      'get_events': this.getEvents.bind(this) as any,
      'create_monitor': this.createMonitor.bind(this) as any,
      'get_monitors': this.getMonitors.bind(this) as any,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const creds = this.credentials as DatadogCredentials;
    const headers: Record<string, string> = {
      'DD-API-KEY': creds.apiKey
    };

    if (creds.appKey) {
      headers['DD-APPLICATION-KEY'] = creds.appKey;
    }

    return headers;
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/validate', this.getAuthHeaders());
  }

  public async submitMetrics(params: DatadogSubmitMetricsParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['series']);
    return this.post('/series', { series: params.series }, this.getAuthHeaders());
  }

  public async queryMetrics(params: DatadogQueryMetricsParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['query', 'from', 'to']);
    const query = this.buildQueryString({
      query: params.query,
      from: params.from,
      to: params.to
    });
    return this.get(`/query${query}`, this.getAuthHeaders());
  }

  public async createEvent(params: DatadogCreateEventParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['title', 'text']);
    return this.post('/events', params, this.getAuthHeaders());
  }

  public async getEvents(params: DatadogGetEventsParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['start', 'end']);
    const query = this.buildQueryString({
      start: params.start,
      end: params.end,
      priority: params.priority,
      sources: params.sources,
      tags: params.tags,
      unaggregated: params.unaggregated ? 'true' : undefined
    });
    return this.get(`/events${query}`, this.getAuthHeaders());
  }

  public async createMonitor(params: DatadogCreateMonitorParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['type', 'query', 'name']);
    const payload = {
      type: params.type,
      query: params.query,
      name: params.name,
      message: params.message,
      options: params.options,
      tags: params.tags,
      multi: params.multi,
      restricted_roles: params.restricted_roles,
    };
    return this.post('/monitor', payload, this.getAuthHeaders());
  }

  public async getMonitors(params: DatadogGetMonitorsParams = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString({
      group_states: params.group_states?.join(','),
      name: params.name,
      tags: params.tags?.join(','),
      monitor_tags: params.monitor_tags?.join(','),
      with_downtimes: params.with_downtimes ? 'true' : undefined,
      id_offset: params.id_offset,
      page: params.page,
      page_size: params.page_size,
    });
    return this.get(`/monitor${query}`, this.getAuthHeaders());
  }
}
