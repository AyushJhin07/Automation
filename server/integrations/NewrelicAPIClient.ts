import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

export interface NewRelicCredentials extends APICredentials {
  apiKey: string;
  region?: string;
  accountId?: number;
}

export interface NewRelicGetApplicationsParams {
  filter?: {
    name?: string;
    host?: string;
    language?: string;
    ids?: number[];
  };
  page?: number;
}

export interface NewRelicGetApplicationMetricsParams {
  application_id: number;
  names?: string[];
  values?: string[];
  from?: string;
  to?: string;
  period?: number;
}

export interface NewRelicGetAlertsParams {
  filter?: {
    name?: string;
    enabled?: boolean;
    ids?: number[];
  };
  page?: number;
}

export interface NewRelicCreateAlertPolicyParams {
  policy: {
    name: string;
    incident_preference?: 'PER_POLICY' | 'PER_CONDITION' | 'PER_CONDITION_AND_TARGET';
    [key: string]: any;
  };
}

export interface NewRelicGetViolationsParams {
  filter?: {
    start_date?: string;
    end_date?: string;
    only_open?: boolean;
  };
  page?: number;
}

export interface NewRelicExecuteNrqlParams {
  nrql: string;
  accountId?: number;
  timeout?: number;
}

export class NewrelicAPIClient extends BaseAPIClient {
  private graphqlEndpoint: string;

  constructor(credentials: NewRelicCredentials) {
    if (!credentials?.apiKey) {
      throw new Error('New Relic integration requires an apiKey credential.');
    }

    const region = credentials.region && credentials.region.trim() ? credentials.region.trim() : 'api.newrelic.com';
    const baseUrl = `https://${region}`;

    super(baseUrl, credentials);

    this.graphqlEndpoint = `${baseUrl}/graphql`;

    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'get_applications': this.getApplications.bind(this) as any,
      'get_application_metrics': this.getApplicationMetrics.bind(this) as any,
      'get_alerts': this.getAlerts.bind(this) as any,
      'create_alert_policy': this.createAlertPolicy.bind(this) as any,
      'get_violations': this.getViolations.bind(this) as any,
      'execute_nrql': this.executeNrql.bind(this) as any,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const creds = this.credentials as NewRelicCredentials;
    return {
      'X-Api-Key': creds.apiKey,
      'Content-Type': 'application/json'
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/v2/applications.json', this.getAuthHeaders());
  }

  public async getApplications(params: NewRelicGetApplicationsParams = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString({
      'filter[name]': params.filter?.name,
      'filter[host]': params.filter?.host,
      'filter[language]': params.filter?.language,
      'filter[ids][]': params.filter?.ids,
      page: params.page,
    });
    return this.get(`/v2/applications.json${query}`, this.getAuthHeaders());
  }

  public async getApplicationMetrics(params: NewRelicGetApplicationMetricsParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['application_id']);
    const query = this.buildQueryString({
      'names[]': params.names,
      'values[]': params.values,
      from: params.from,
      to: params.to,
      period: params.period,
    });
    return this.get(`/v2/applications/${params.application_id}/metrics/data.json${query}`, this.getAuthHeaders());
  }

  public async getAlerts(params: NewRelicGetAlertsParams = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString({
      'filter[name]': params.filter?.name,
      'filter[enabled]': typeof params.filter?.enabled === 'boolean' ? String(params.filter.enabled) : undefined,
      'filter[ids][]': params.filter?.ids,
      page: params.page,
    });
    return this.get(`/v2/alerts_policies.json${query}`, this.getAuthHeaders());
  }

  public async createAlertPolicy(params: NewRelicCreateAlertPolicyParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['policy']);
    return this.post('/v2/alerts_policies.json', params, this.getAuthHeaders());
  }

  public async getViolations(params: NewRelicGetViolationsParams = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString({
      'filter[start_time]': params.filter?.start_date,
      'filter[end_time]': params.filter?.end_date,
      'filter[only_open]': params.filter?.only_open ? 'true' : undefined,
      page: params.page,
    });
    return this.get(`/v2/alerts_violations.json${query}`, this.getAuthHeaders());
  }

  public async executeNrql(params: NewRelicExecuteNrqlParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['nrql']);
    const creds = this.credentials as NewRelicCredentials;
    const accountId = params.accountId ?? creds.accountId;
    if (!accountId) {
      return { success: false, error: 'Account ID is required to execute NRQL queries.' };
    }

    const query = `{
  actor {
    account(id: ${accountId}) {
      nrql(query: "${params.nrql.replace(/"/g, '\\"')}") {
        results
      }
    }
  }
}`;

    try {
      const response = await fetch(this.graphqlEndpoint, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ query }),
      });

      const text = await response.text();
      const data = text ? JSON.parse(text) : null;

      if (!response.ok) {
        return { success: false, error: data?.errors?.[0]?.message ?? `HTTP ${response.status}`, data };
      }

      return { success: true, data };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }
}
