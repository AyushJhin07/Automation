import { APIResponse, BaseAPIClient } from './BaseAPIClient';
import { getErrorMessage } from '../types/common';

type FilterRecord = Record<string, string | number | boolean | Array<string | number>>;

type GetApplicationsParams = {
  filter?: FilterRecord;
  page?: number;
};

type GetApplicationMetricsParams = {
  application_id: number;
  names?: string[];
  values?: string[];
  from?: string;
  to?: string;
  period?: number;
};

type GetAlertsParams = {
  filter?: FilterRecord;
  page?: number;
};

type CreateAlertPolicyParams = {
  policy: {
    name: string;
    incident_preference?: 'PER_POLICY' | 'PER_CONDITION' | 'PER_CONDITION_AND_TARGET';
    [key: string]: unknown;
  };
};

type GetViolationsParams = {
  filter?: FilterRecord;
  page?: number;
};

type ExecuteNrqlParams = {
  nrql: string;
  timeout?: number;
  account_id?: number;
};

export interface NewrelicAPIClientConfig {
  apiKey: string;
  baseUrl?: string;
  graphqlUrl?: string;
  accountId?: number;
}

const DEFAULT_BASE_URL = 'https://api.newrelic.com/v2';
const DEFAULT_GRAPHQL_URL = 'https://api.newrelic.com/graphql';

export class NewrelicAPIClient extends BaseAPIClient {
  private graphqlUrl: string;
  private accountId?: number;

  constructor(config: NewrelicAPIClientConfig) {
    super((config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, ''), { apiKey: config.apiKey });
    this.graphqlUrl = config.graphqlUrl ?? DEFAULT_GRAPHQL_URL;
    this.accountId = config.accountId;

    this.registerHandlers({
      test_connection: () => this.testConnection(),
      get_applications: params => this.getApplications(params as GetApplicationsParams),
      get_application_metrics: params => this.getApplicationMetrics(params as GetApplicationMetricsParams),
      get_alerts: params => this.getAlerts(params as GetAlertsParams),
      create_alert_policy: params => this.createAlertPolicy(params as CreateAlertPolicyParams),
      get_violations: params => this.getViolations(params as GetViolationsParams),
      execute_nrql: params => this.executeNrql(params as ExecuteNrqlParams)
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const apiKey = (this.credentials as { apiKey?: string }).apiKey;
    if (!apiKey) {
      throw new Error('New Relic API key is required');
    }
    return {
      'X-Api-Key': apiKey
    };
  }

  public testConnection(): Promise<APIResponse> {
    return this.get('/applications.json');
  }

  public getApplications(params: GetApplicationsParams = {}): Promise<APIResponse> {
    const query = this.buildFilterQuery(params.filter, params.page);
    return this.get(`/applications.json${query}`);
  }

  public getApplicationMetrics(params: GetApplicationMetricsParams): Promise<APIResponse> {
    this.validateRequiredParams(params, ['application_id']);
    const queryParams = new URLSearchParams();
    if (params.names) {
      for (const name of params.names) {
        queryParams.append('names[]', name);
      }
    }
    if (params.values) {
      for (const value of params.values) {
        queryParams.append('values[]', value);
      }
    }
    if (params.from) queryParams.set('from', params.from);
    if (params.to) queryParams.set('to', params.to);
    if (params.period) queryParams.set('period', String(params.period));

    const qs = queryParams.toString();
    return this.get(`/applications/${encodeURIComponent(String(params.application_id))}/metrics/data.json${qs ? `?${qs}` : ''}`);
  }

  public getAlerts(params: GetAlertsParams = {}): Promise<APIResponse> {
    const query = this.buildFilterQuery(params.filter, params.page);
    return this.get(`/alerts_policies.json${query}`);
  }

  public createAlertPolicy(params: CreateAlertPolicyParams): Promise<APIResponse> {
    this.validateRequiredParams(params, ['policy']);
    this.validateRequiredParams(params.policy, ['name']);
    return this.post('/alerts_policies.json', params);
  }

  public getViolations(params: GetViolationsParams = {}): Promise<APIResponse> {
    const query = this.buildFilterQuery(params.filter, params.page);
    return this.get(`/alerts_violations.json${query}`);
  }

  public async executeNrql(params: ExecuteNrqlParams): Promise<APIResponse> {
    this.validateRequiredParams(params, ['nrql']);
    const accountId = params.account_id ?? this.accountId;
    if (!accountId) {
      return { success: false, error: 'account_id is required to execute NRQL queries.' };
    }

    const timeout = params.timeout ?? 10;
    const query = `{
      actor {
        account(id: ${accountId}) {
          nrql(query: "${params.nrql.replace(/"/g, '\\"')}", timeout: ${timeout}) {
            results
            totalResultCount
          }
        }
      }
    }`;

    try {
      const response = await fetch(this.graphqlUrl, {
        method: 'POST',
        headers: {
          ...this.getAuthHeaders(),
          'Content-Type': 'application/json',
          'API-Key': (this.credentials as { apiKey?: string }).apiKey ?? ''
        },
        body: JSON.stringify({ query })
      });

      const text = await response.text();
      const data = text ? JSON.parse(text) : null;

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
          statusCode: response.status,
          data
        };
      }

      return {
        success: true,
        data,
        statusCode: response.status,
        headers: Object.fromEntries(response.headers.entries())
      };
    } catch (error) {
      return {
        success: false,
        error: getErrorMessage(error)
      };
    }
  }

  private buildFilterQuery(filter?: FilterRecord, page?: number): string {
    const params = new URLSearchParams();
    if (filter) {
      for (const [key, value] of Object.entries(filter)) {
        if (value === undefined || value === null) continue;
        if (Array.isArray(value)) {
          params.set(`filter[${key}]`, value.join(','));
        } else {
          params.set(`filter[${key}]`, String(value));
        }
      }
    }
    if (page) {
      params.set('page', String(page));
    }
    const qs = params.toString();
    return qs ? `?${qs}` : '';
  }
}
