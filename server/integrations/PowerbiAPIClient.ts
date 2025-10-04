import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

type RefreshObject = {
  table: string;
  partition?: string;
};

type ListDatasetsParams = {
  groupId?: string;
  top?: number;
  skip?: number;
  filter?: string;
};

type TriggerDatasetRefreshParams = {
  datasetId: string;
  groupId?: string;
  notifyOption?: 'MailOnCompletion' | 'MailOnFailure' | 'NoNotification';
  type?: 'Full' | 'Calculate';
  commitMode?: 'transactional' | 'partialBatch';
  applyRefreshPolicy?: boolean;
  maxParallelism?: number;
  retryCount?: number;
  objects?: RefreshObject[];
  advancedSettings?: Record<string, any>;
  waitForCompletion?: boolean;
  pollIntervalSeconds?: number;
  maxPollAttempts?: number;
};

type ListDatasetRefreshesParams = {
  datasetId: string;
  groupId?: string;
  top?: number;
  skip?: number;
};

type DatasetRefreshTriggerParams = {
  datasetId: string;
  groupId?: string;
  top?: number;
};

type ExecuteQueryParams = {
  datasetId: string;
  groupId?: string;
  sql?: string;
  query?: string;
  parameters?: Record<string, unknown> | Array<{ name: string; value: unknown }>;
};

type AddRowsParams = {
  datasetId: string;
  groupId?: string;
  tableName: string;
  rows: Array<Record<string, any> | string>;
};

type ListReportsParams = {
  groupId?: string;
};

type ListDashboardsParams = {
  groupId?: string;
};

type PowerBICredentials = APICredentials & {
  tenantId?: string;
  tenant?: string;
  authorityHost?: string;
  tokenUrl?: string;
  scope?: string;
  baseUrl?: string;
};

const DEFAULT_BASE_URL = 'https://api.powerbi.com/v1.0';
const DEFAULT_SCOPE = 'https://analysis.windows.net/powerbi/api/.default';
const DEFAULT_AUTHORITY = 'https://login.microsoftonline.com';

function parseExpiry(raw: unknown): number | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw;
  }
  if (typeof raw === 'string' && raw.trim().length > 0) {
    const parsed = Date.parse(raw);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

export class PowerbiAPIClient extends BaseAPIClient {
  private readonly tokenEndpoint: string;
  private readonly scope: string;
  private readonly refreshSkewMs = 60_000;
  private refreshPromise?: Promise<void>;

  constructor(credentials: PowerBICredentials) {
    const baseUrl = (credentials.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    super(baseUrl, credentials);

    const tenantId = credentials.tenantId ?? credentials.tenant;
    if (!tenantId) {
      throw new Error('Power BI integration requires a tenantId in credentials');
    }

    const clientId = credentials.clientId ?? (credentials as Record<string, any>).client_id;
    if (!clientId) {
      throw new Error('Power BI integration requires a clientId');
    }

    const clientSecret = credentials.clientSecret ?? (credentials as Record<string, any>).client_secret;
    if (!clientSecret) {
      throw new Error('Power BI integration requires a clientSecret');
    }

    this.credentials.clientId = clientId;
    this.credentials.clientSecret = clientSecret;

    const authority = (credentials.authorityHost ?? DEFAULT_AUTHORITY).replace(/\/$/, '');
    this.tokenEndpoint = credentials.tokenUrl ?? `${authority}/${tenantId}/oauth2/v2.0/token`;
    this.scope = credentials.scope ?? DEFAULT_SCOPE;

    this.registerAliasHandlers({
      test_connection: 'testConnection',
      get_datasets: 'listDatasets',
      list_datasets: 'listDatasets',
      get_reports: 'listReports',
      get_dashboards: 'listDashboards',
      trigger_refresh: 'triggerDatasetRefresh',
      refresh_dataset: 'triggerDatasetRefresh',
      get_refreshes: 'listDatasetRefreshes',
      list_refreshes: 'listDatasetRefreshes',
      query_dataset: 'executeQuery',
      add_rows: 'addRows',
      dataset_refresh_completed: 'pollDatasetRefreshCompleted'
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const token = this.credentials.accessToken;
    if (!token) {
      throw new Error('Power BI integration is missing an access token');
    }
    return {
      Authorization: `Bearer ${token}`
    };
  }

  protected override async makeRequest<T = any>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    endpoint: string,
    data?: any,
    headers: Record<string, string> = {}
  ): Promise<APIResponse<T>> {
    await this.ensureAccessToken();
    return super.makeRequest(method, endpoint, data, headers);
  }

  private async ensureAccessToken(): Promise<void> {
    const expiresAt = parseExpiry((this.credentials as Record<string, any>).expiresAt);
    if (this.credentials.accessToken && (!expiresAt || expiresAt - Date.now() > this.refreshSkewMs)) {
      return;
    }

    if (!this.refreshPromise) {
      this.refreshPromise = (async () => {
        try {
          const clientId = this.credentials.clientId;
          const clientSecret = this.credentials.clientSecret;
          if (!clientId || !clientSecret) {
            throw new Error('Power BI token acquisition requires clientId and clientSecret');
          }

          const body = new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: clientId,
            client_secret: clientSecret,
            scope: this.scope,
          });

          const response = await fetch(this.tokenEndpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              Accept: 'application/json'
            },
            body
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Power BI token request failed: ${response.status} ${response.statusText} ${errorText}`);
          }

          const payload = await response.json();
          const nextExpiry = typeof payload.expires_in === 'number'
            ? Date.now() + Number(payload.expires_in) * 1000
            : undefined;

          await this.applyTokenRefresh({
            accessToken: payload.access_token,
            expiresAt: nextExpiry,
            tokenType: payload.token_type,
            scope: payload.scope
          });
        } finally {
          this.refreshPromise = undefined;
        }
      })();
    }

    await this.refreshPromise;
  }

  private resolveGroupSegment(groupId?: string): string {
    if (!groupId) {
      return '/myorg';
    }
    return `/groups/${encodeURIComponent(groupId)}`;
  }

  private resolveDatasetPath(datasetId: string, groupId?: string): string {
    return `${this.resolveGroupSegment(groupId)}/datasets/${encodeURIComponent(datasetId)}`;
  }

  private buildRefreshPayload(params: TriggerDatasetRefreshParams): Record<string, any> {
    const payload: Record<string, any> = {};

    if (params.notifyOption) {
      payload.notifyOption = params.notifyOption;
    }
    if (params.type) {
      payload.type = params.type;
    }
    if (params.commitMode) {
      payload.commitMode = params.commitMode;
    }
    if (typeof params.applyRefreshPolicy === 'boolean') {
      payload.applyRefreshPolicy = params.applyRefreshPolicy;
    }
    if (typeof params.maxParallelism === 'number') {
      payload.maxParallelism = params.maxParallelism;
    }
    if (typeof params.retryCount === 'number') {
      payload.retryCount = params.retryCount;
    }
    if (Array.isArray(params.objects) && params.objects.length > 0) {
      payload.objects = params.objects.map(obj => ({
        table: obj.table,
        partition: obj.partition,
      }));
    }
    if (params.advancedSettings && typeof params.advancedSettings === 'object') {
      Object.assign(payload, params.advancedSettings);
    }

    return payload;
  }

  private extractRefreshId(location?: string): string | undefined {
    if (!location) {
      return undefined;
    }

    try {
      const parsed = new URL(location, DEFAULT_BASE_URL);
      const segments = parsed.pathname.split('/').filter(Boolean);
      return segments.length ? segments[segments.length - 1] : undefined;
    } catch {
      const parts = location.split('/').filter(Boolean);
      return parts.length ? parts[parts.length - 1] : undefined;
    }
  }

  private normalizeRefreshList(data: any): any[] {
    if (!data) {
      return [];
    }
    if (Array.isArray(data)) {
      return data;
    }
    if (Array.isArray(data.value)) {
      return data.value;
    }
    if (Array.isArray(data.results)) {
      return data.results;
    }
    return [];
  }

  private resolvePollingOptions(params: TriggerDatasetRefreshParams): { intervalMs: number; maxAttempts: number } {
    const intervalSeconds = params.pollIntervalSeconds ?? 5;
    const intervalMs = Math.max(0, intervalSeconds) * 1000;
    const maxAttempts = Math.max(1, params.maxPollAttempts ?? 30);
    return { intervalMs, maxAttempts };
  }

  private async pollRefreshUntilComplete(
    location: string,
    options: { datasetId: string; refreshId?: string; intervalMs: number; maxAttempts: number }
  ): Promise<APIResponse<any>> {
    let attempt = 0;
    let lastResponse: APIResponse<any> | null = null;

    while (attempt < options.maxAttempts) {
      const statusResponse = await this.get(location);
      if (!statusResponse.success) {
        if (statusResponse.statusCode === 404 || statusResponse.statusCode === 202) {
          attempt += 1;
          if (options.intervalMs > 0) {
            await this.sleep(options.intervalMs);
          }
          continue;
        }
        return statusResponse;
      }

      const record = statusResponse.data ?? {};
      const status = typeof record?.status === 'string' ? record.status : undefined;
      const normalizedStatus = status ? status.toLowerCase() : undefined;

      if (!normalizedStatus || normalizedStatus === 'inprogress' || normalizedStatus === 'unknown') {
        attempt += 1;
        lastResponse = statusResponse;
        if (options.intervalMs > 0) {
          await this.sleep(options.intervalMs);
        }
        continue;
      }

      const refreshId = record.id ?? record.refreshId ?? options.refreshId ?? this.extractRefreshId(location);
      const data = {
        ...record,
        datasetId: options.datasetId,
        refreshId,
        status: status,
        location,
      };

      return {
        success: true,
        data,
        statusCode: statusResponse.statusCode,
        headers: statusResponse.headers,
      };
    }

    return {
      success: false,
      error: `Timed out waiting for dataset refresh completion after ${options.maxAttempts} attempts.`,
      data: lastResponse?.data,
      statusCode: lastResponse?.statusCode,
      headers: lastResponse?.headers,
    };
  }

  public testConnection(): Promise<APIResponse<any>> {
    return this.get('/myorg/datasets?$top=1');
  }

  public listDatasets(params: ListDatasetsParams = {}): Promise<APIResponse<any>> {
    const queryParams: Record<string, any> = {};
    if (typeof params.top === 'number') {
      queryParams['$top'] = params.top;
    }
    if (typeof params.skip === 'number') {
      queryParams['$skip'] = params.skip;
    }
    if (params.filter) {
      queryParams['$filter'] = params.filter;
    }

    const endpoint = `${this.resolveGroupSegment(params.groupId)}/datasets${this.buildQueryString(queryParams)}`;
    return this.get(endpoint);
  }

  public listReports(params: ListReportsParams = {}): Promise<APIResponse<any>> {
    return this.get(`${this.resolveGroupSegment(params.groupId)}/reports`);
  }

  public listDashboards(params: ListDashboardsParams = {}): Promise<APIResponse<any>> {
    return this.get(`${this.resolveGroupSegment(params.groupId)}/dashboards`);
  }

  public async triggerDatasetRefresh(params: TriggerDatasetRefreshParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['datasetId']);

    const endpoint = `${this.resolveDatasetPath(params.datasetId, params.groupId)}/refreshes`;
    const payload = this.buildRefreshPayload(params);
    const requestBody = Object.keys(payload).length > 0 ? payload : undefined;
    const response = await this.post(endpoint, requestBody);

    if (!response.success) {
      return response;
    }

    const location = response.headers?.location ?? response.headers?.Location;
    const refreshId = this.extractRefreshId(location);

    if (params.waitForCompletion === false || !location) {
      return {
        success: true,
        data: {
          status: 'Accepted',
          datasetId: params.datasetId,
          groupId: params.groupId,
          refreshId,
          location
        },
        statusCode: response.statusCode,
        headers: response.headers
      };
    }

    const options = this.resolvePollingOptions(params);
    return this.pollRefreshUntilComplete(location, {
      datasetId: params.datasetId,
      refreshId,
      intervalMs: options.intervalMs,
      maxAttempts: options.maxAttempts
    });
  }

  public listDatasetRefreshes(params: ListDatasetRefreshesParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['datasetId']);

    const queryParams: Record<string, any> = {};
    if (typeof params.top === 'number') {
      queryParams['$top'] = params.top;
    }
    if (typeof params.skip === 'number') {
      queryParams['$skip'] = params.skip;
    }

    const endpoint = `${this.resolveDatasetPath(params.datasetId, params.groupId)}/refreshes${this.buildQueryString(queryParams)}`;
    return this.get(endpoint);
  }

  public async executeQuery(params: ExecuteQueryParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['datasetId']);
    const queryText = params.query ?? params.sql;
    if (!queryText) {
      return { success: false, error: 'Query text is required (sql or query).' };
    }

    const payload: Record<string, any> = {
      queries: [
        {
          query: queryText
        }
      ]
    };

    if (params.parameters) {
      if (Array.isArray(params.parameters)) {
        payload.parameters = params.parameters;
      } else if (typeof params.parameters === 'object') {
        payload.parameters = Object.entries(params.parameters).map(([name, value]) => ({
          name,
          value
        }));
      }
    }

    const endpoint = `${this.resolveDatasetPath(params.datasetId, params.groupId)}/executeQueries`;
    return this.post(endpoint, payload);
  }

  public async addRows(params: AddRowsParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['datasetId', 'tableName', 'rows']);

    if (!Array.isArray(params.rows) || params.rows.length === 0) {
      return { success: false, error: 'rows must contain at least one row object.' };
    }

    const normalizedRows = params.rows.map(row => {
      if (typeof row === 'string') {
        try {
          return JSON.parse(row);
        } catch {
          throw new Error('rows contains a string that is not valid JSON');
        }
      }
      return row;
    });

    const endpoint = `${this.resolveDatasetPath(params.datasetId, params.groupId)}/tables/${encodeURIComponent(params.tableName)}/rows`;
    return this.post(endpoint, { rows: normalizedRows });
  }

  public async pollDatasetRefreshCompleted(params: DatasetRefreshTriggerParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['datasetId']);

    const historyResponse = await this.listDatasetRefreshes({
      datasetId: params.datasetId,
      groupId: params.groupId,
      top: params.top ?? 10
    });

    if (!historyResponse.success) {
      return historyResponse;
    }

    const records = this.normalizeRefreshList(historyResponse.data);
    const completed = records
      .filter(record => typeof record?.status === 'string' && record.status.toLowerCase() !== 'inprogress')
      .map(record => ({
        ...record,
        datasetId: params.datasetId,
        groupId: params.groupId,
      }));

    return {
      success: true,
      data: completed,
      statusCode: historyResponse.statusCode,
      headers: historyResponse.headers,
    };
  }
}
