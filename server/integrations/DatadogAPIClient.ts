import { APIResponse, BaseAPIClient } from './BaseAPIClient';

type MetricPoint = [number, number];

type MetricSeries = {
  metric: string;
  points: MetricPoint[];
  type?: 'gauge' | 'rate' | 'count';
  interval?: number;
  host?: string;
  tags?: string[];
  unit?: string;
};

type SubmitMetricsParams = {
  series: MetricSeries[];
};

type QueryMetricsParams = {
  query: string;
  from: number;
  to: number;
};

type CreateEventParams = {
  title: string;
  text: string;
  date_happened?: number;
  priority?: 'normal' | 'low';
  host?: string;
  tags?: string[];
  alert_type?: 'error' | 'warning' | 'info' | 'success';
  aggregation_key?: string;
  source_type_name?: string;
};

type GetEventsParams = {
  start: number;
  end: number;
  priority?: 'normal' | 'low';
  sources?: string;
  tags?: string;
  unaggregated?: boolean;
};

type CreateMonitorParams = {
  type: string;
  query: string;
  name: string;
  message?: string;
  tags?: string[];
  options?: Record<string, unknown>;
  multi?: boolean;
  restricted_roles?: string[];
};

type GetMonitorsParams = {
  group_states?: string[];
  name?: string;
  tags?: string[];
  monitor_tags?: string[];
  with_downtimes?: boolean;
  id_offset?: number;
  page?: number;
  page_size?: number;
};

export interface DatadogAPIClientConfig {
  apiKey: string;
  appKey?: string;
  baseUrl?: string;
}

const DEFAULT_BASE_URL = 'https://api.datadoghq.com/api/v1';

export class DatadogAPIClient extends BaseAPIClient {
  constructor(config: DatadogAPIClientConfig) {
    super((config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, ''), {
      apiKey: config.apiKey,
      appKey: config.appKey
    });

    this.registerHandlers({
      test_connection: () => this.testConnection(),
      submit_metrics: params => this.submitMetrics(params as SubmitMetricsParams),
      query_metrics: params => this.queryMetrics(params as QueryMetricsParams),
      create_event: params => this.createEvent(params as CreateEventParams),
      get_events: params => this.getEvents(params as GetEventsParams),
      create_monitor: params => this.createMonitor(params as CreateMonitorParams),
      get_monitors: params => this.getMonitors(params as GetMonitorsParams)
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    const apiKey = (this.credentials as { apiKey?: string }).apiKey;
    if (!apiKey) {
      throw new Error('Datadog API key is required');
    }
    headers['DD-API-KEY'] = apiKey;

    const appKey = (this.credentials as { appKey?: string }).appKey;
    if (appKey) {
      headers['DD-APPLICATION-KEY'] = appKey;
    }

    return headers;
  }

  public testConnection(): Promise<APIResponse> {
    return this.get('/validate');
  }

  public submitMetrics(params: SubmitMetricsParams): Promise<APIResponse> {
    this.validateRequiredParams(params, ['series']);
    if (!Array.isArray(params.series) || params.series.length === 0) {
      return Promise.resolve({ success: false, error: 'series must contain at least one metric.' });
    }

    const body = {
      series: params.series.map(series => ({
        ...series,
        points: series.points.map(point => [Number(point[0]), Number(point[1])])
      }))
    };

    return this.post('/series', body);
  }

  public queryMetrics(params: QueryMetricsParams): Promise<APIResponse> {
    this.validateRequiredParams(params, ['query', 'from', 'to']);
    const queryParams = this.buildQueryString({
      query: params.query,
      from: params.from,
      to: params.to
    });
    return this.get(`/query${queryParams}`);
  }

  public createEvent(params: CreateEventParams): Promise<APIResponse> {
    this.validateRequiredParams(params, ['title', 'text']);
    return this.post('/events', params);
  }

  public getEvents(params: GetEventsParams): Promise<APIResponse> {
    this.validateRequiredParams(params, ['start', 'end']);
    const queryParams = this.buildQueryString(params as Record<string, any>);
    return this.get(`/events${queryParams}`);
  }

  public createMonitor(params: CreateMonitorParams): Promise<APIResponse> {
    this.validateRequiredParams(params, ['type', 'query', 'name']);
    return this.post('/monitor', params);
  }

  public getMonitors(params: GetMonitorsParams = {}): Promise<APIResponse> {
    const queryParams = this.buildQueryString({
      ...params,
      group_states: params.group_states?.join(','),
      tags: params.tags?.join(','),
      monitor_tags: params.monitor_tags?.join(',')
    });
    return this.get(`/monitor${queryParams}`);
  }
}
