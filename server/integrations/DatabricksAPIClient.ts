import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

type CollectionResult<T = any> = {
  items: T[];
  meta: Record<string, any>;
};

interface DatabricksCredentials extends APICredentials {
  host?: string;
  baseUrl?: string;
  baseURL?: string;
  workspaceUrl?: string;
  workspace?: string;
  site?: string;
  domain?: string;
  region?: string;
  personalAccessToken?: string;
  pat?: string;
  token?: string;
  apiKey?: string;
  [key: string]: any;
}

interface ListClustersParams {
  can_use_client?: string;
}

interface GetClusterParams {
  cluster_id: string;
}

interface StartStopClusterParams {
  cluster_id: string;
}

interface SubmitRunParams {
  run_name?: string;
  new_cluster?: Record<string, any>;
  existing_cluster_id?: string;
  notebook_task?: Record<string, any>;
  spark_jar_task?: Record<string, any>;
  spark_python_task?: Record<string, any>;
  spark_submit_task?: Record<string, any>;
  timeout_seconds?: number;
  idempotency_token?: string;
}

interface GetRunParams {
  run_id: number | string;
  include_history?: boolean;
}

interface CancelRunParams {
  run_id: number | string;
}

interface ListJobsParams {
  limit?: number;
  offset?: number;
  expand_tasks?: boolean;
}

interface CreateJobParams {
  name?: string;
  new_cluster?: Record<string, any>;
  existing_cluster_id?: string;
  notebook_task?: Record<string, any>;
  spark_jar_task?: Record<string, any>;
  libraries?: Array<Record<string, any>>;
  email_notifications?: Record<string, any>;
  timeout_seconds?: number;
  max_retries?: number;
  min_retry_interval_millis?: number;
  retry_on_timeout?: boolean;
  schedule?: Record<string, any>;
  max_concurrent_runs?: number;
}

interface JobCompletedParams {
  job_id?: number | string;
  limit?: number;
  offset?: number;
}

interface ExecuteSqlStatementParams {
  warehouse_id: string;
  statement: string;
  catalog?: string;
  schema?: string;
  parameters?: Record<string, any>;
  waitTimeoutSeconds?: number;
}

const TERMINAL_STATEMENT_STATES = new Set(['SUCCEEDED', 'FAILED', 'CANCELED']);

export class DatabricksAPIClient extends BaseAPIClient {
  private readonly host: string;
  private readonly personalAccessToken: string;

  constructor(credentials: DatabricksCredentials) {
    const host = DatabricksAPIClient.normalizeHost(credentials);
    const personalAccessToken = DatabricksAPIClient.resolveToken(credentials);
    const normalizedCredentials: APICredentials = {
      ...credentials,
      accessToken: personalAccessToken,
    };

    super(`${host}/api/2.0`, normalizedCredentials);

    this.host = host;
    this.personalAccessToken = personalAccessToken;

    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'list_clusters': this.listClusters.bind(this) as any,
      'get_cluster': this.getCluster.bind(this) as any,
      'start_cluster': this.startCluster.bind(this) as any,
      'stop_cluster': this.stopCluster.bind(this) as any,
      'submit_run': this.submitRun.bind(this) as any,
      'get_run': this.getRun.bind(this) as any,
      'cancel_run': this.cancelRun.bind(this) as any,
      'list_jobs': this.listJobs.bind(this) as any,
      'create_job': this.createJob.bind(this) as any,
      'execute_sql_statement': this.executeSqlStatement.bind(this) as any,
      'job_completed': this.pollJobCompleted.bind(this) as any,
      'cluster_started': this.pollClusterStarted.bind(this) as any,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.personalAccessToken}`,
    };
  }

  public async testConnection(): Promise<APIResponse<CollectionResult>> {
    const response = await this.withRetries(() => this.post('/clusters/list', {}), {
      retries: 1,
      initialDelayMs: 500,
    });

    return this.normalizeCollection(response, 'clusters');
  }

  public async listClusters(params: ListClustersParams = {}): Promise<APIResponse<CollectionResult>> {
    const payload = this.cleanPayload({
      can_use_client: params.can_use_client,
    });

    const response = await this.withRetries(() => this.post('/clusters/list', payload), {
      retries: 2,
      initialDelayMs: 500,
    });

    return this.normalizeCollection(response, 'clusters');
  }

  public async getCluster(params: GetClusterParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['cluster_id']);

    return this.withRetries(
      () => this.post('/clusters/get', { cluster_id: params.cluster_id }),
      { retries: 2, initialDelayMs: 500 },
    );
  }

  public async startCluster(params: StartStopClusterParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['cluster_id']);

    return this.withRetries(
      () => this.post('/clusters/start', { cluster_id: params.cluster_id }),
      { retries: 2, initialDelayMs: 500 },
    );
  }

  public async stopCluster(params: StartStopClusterParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['cluster_id']);

    return this.withRetries(
      () => this.post('/clusters/delete', { cluster_id: params.cluster_id }),
      { retries: 2, initialDelayMs: 500 },
    );
  }

  public async submitRun(params: SubmitRunParams): Promise<APIResponse<any>> {
    const payload = this.cleanPayload({
      run_name: params.run_name,
      new_cluster: params.new_cluster,
      existing_cluster_id: params.existing_cluster_id,
      notebook_task: params.notebook_task,
      spark_jar_task: params.spark_jar_task,
      spark_python_task: params.spark_python_task,
      spark_submit_task: params.spark_submit_task,
      timeout_seconds: params.timeout_seconds,
      idempotency_token: params.idempotency_token,
    });

    return this.withRetries(
      () => this.post('/jobs/runs/submit', payload),
      { retries: 2, initialDelayMs: 500 },
    );
  }

  public async getRun(params: GetRunParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['run_id']);

    const query = this.buildQueryString({
      run_id: params.run_id,
      include_history: params.include_history ? 'true' : undefined,
    });

    return this.withRetries(
      () => this.get(`/jobs/runs/get${query}`),
      { retries: 2, initialDelayMs: 500 },
    );
  }

  public async cancelRun(params: CancelRunParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['run_id']);

    return this.withRetries(
      () => this.post('/jobs/runs/cancel', { run_id: params.run_id }),
      { retries: 2, initialDelayMs: 500 },
    );
  }

  public async listJobs(params: ListJobsParams = {}): Promise<APIResponse<CollectionResult>> {
    const query = this.buildQueryString({
      limit: params.limit,
      offset: params.offset,
      expand_tasks: params.expand_tasks ? 'true' : undefined,
    });

    const response = await this.withRetries(
      () => this.get(`/jobs/list${query}`),
      { retries: 2, initialDelayMs: 500 },
    );

    return this.normalizeCollection(response, 'jobs');
  }

  public async createJob(params: CreateJobParams): Promise<APIResponse<any>> {
    const payload = this.cleanPayload({
      name: params.name,
      new_cluster: params.new_cluster,
      existing_cluster_id: params.existing_cluster_id,
      notebook_task: params.notebook_task,
      spark_jar_task: params.spark_jar_task,
      libraries: params.libraries,
      email_notifications: params.email_notifications,
      timeout_seconds: params.timeout_seconds,
      max_retries: params.max_retries,
      min_retry_interval_millis: params.min_retry_interval_millis,
      retry_on_timeout: params.retry_on_timeout,
      schedule: params.schedule,
      max_concurrent_runs: params.max_concurrent_runs,
    });

    return this.withRetries(
      () => this.post('/jobs/create', payload),
      { retries: 2, initialDelayMs: 500 },
    );
  }

  public async executeSqlStatement(params: ExecuteSqlStatementParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['warehouse_id', 'statement']);

    const { waitTimeoutSeconds = 30, ...rest } = params;
    const payload = this.cleanPayload({
      warehouse_id: rest.warehouse_id,
      statement: rest.statement,
      catalog: rest.catalog,
      schema: rest.schema,
      parameters: rest.parameters,
    });

    const submission = await this.withRetries(
      () => this.post('/sql/statements', payload),
      { retries: 2, initialDelayMs: 500 },
    );

    if (!submission.success) {
      return submission;
    }

    const statementId = submission.data?.statement_id ?? submission.data?.id;
    const state = submission.data?.status?.state;

    if (!statementId || TERMINAL_STATEMENT_STATES.has(state)) {
      return submission;
    }

    const deadline = Date.now() + Math.max(0, waitTimeoutSeconds) * 1000;
    let latest: APIResponse<any> = submission;

    while (Date.now() < deadline) {
      const currentState = latest.data?.status?.state;
      if (TERMINAL_STATEMENT_STATES.has(currentState)) {
        return latest;
      }

      await this.sleep(1000);

      latest = await this.withRetries(
        () => this.get(`/sql/statements/${statementId}`),
        { retries: 2, initialDelayMs: 500 },
      );

      if (!latest.success) {
        return latest;
      }
    }

    return {
      success: false,
      error: `SQL statement ${statementId} did not complete within ${waitTimeoutSeconds} seconds`,
      statusCode: latest.statusCode,
      data: latest.data,
      headers: latest.headers,
    };
  }

  public async pollJobCompleted(params: JobCompletedParams = {}): Promise<APIResponse<CollectionResult>> {
    const query = this.buildQueryString({
      completed_only: 'true',
      job_id: params.job_id,
      limit: params.limit,
      offset: params.offset,
    });

    const response = await this.withRetries(
      () => this.get(`/jobs/runs/list${query}`),
      { retries: 2, initialDelayMs: 500 },
    );

    return this.normalizeCollection(
      response,
      'runs',
      runs => runs.filter(run => run?.state?.life_cycle_state === 'TERMINATED'),
    );
  }

  public async pollClusterStarted(): Promise<APIResponse<CollectionResult>> {
    const response = await this.listClusters();
    if (!response.success) {
      return response;
    }

    const items = (response.data?.items ?? []).filter(cluster => {
      const state = cluster?.state?.state ?? cluster?.state;
      return typeof state === 'string' ? state.toUpperCase() === 'RUNNING' : false;
    });

    return {
      success: true,
      data: {
        items,
        meta: response.data?.meta ?? {},
      },
      statusCode: response.statusCode,
      headers: response.headers,
    };
  }

  private normalizeCollection<T = any>(
    response: APIResponse<any>,
    key: string,
    transform?: (items: any[]) => T[],
  ): APIResponse<CollectionResult<T>> {
    if (!response.success) {
      return response as APIResponse<CollectionResult<T>>;
    }

    const payload = response.data ?? {};
    const rawItems = Array.isArray(payload[key]) ? payload[key] : [];
    const items = transform ? transform(rawItems) : rawItems;

    return {
      success: true,
      data: {
        items,
        meta: this.extractCollectionMeta(payload, items.length),
      },
      statusCode: response.statusCode,
      headers: response.headers,
    };
  }

  private extractCollectionMeta(payload: any, fallbackCount: number): Record<string, any> {
    const meta: Record<string, any> = {};

    if (payload && typeof payload === 'object') {
      const candidateKeys: Array<[string, string]> = [
        ['next_page', 'nextPage'],
        ['prev_page', 'prevPage'],
        ['has_more', 'hasMore'],
        ['total_count', 'totalCount'],
        ['next_page_token', 'nextPageToken'],
      ];

      for (const [source, target] of candidateKeys) {
        if (payload[source] !== undefined) {
          meta[target] = payload[source];
        }
      }
    }

    if (Object.keys(meta).length === 0) {
      meta.totalCount = fallbackCount;
    }

    return meta;
  }

  private cleanPayload<T extends Record<string, any>>(payload: T): T {
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(payload)) {
      if (value !== undefined && value !== null) {
        cleaned[key] = value;
      }
    }
    return cleaned as T;
  }

  private static normalizeHost(credentials: DatabricksCredentials): string {
    const candidates = [
      credentials.host,
      credentials.baseUrl,
      credentials.baseURL,
      credentials.workspaceUrl,
      credentials.workspace,
      credentials.site,
      credentials.domain,
    ];

    const host = candidates.find(value => typeof value === 'string' && value.trim().length > 0);
    if (!host) {
      throw new Error('Databricks integration requires a host (e.g. https://adb-123.cloud.databricks.com)');
    }

    let normalized = host.trim();
    if (!/^https?:\/\//i.test(normalized)) {
      normalized = `https://${normalized}`;
    }

    const url = new URL(normalized);
    // Strip any API suffixes from the path to ensure we anchor at the workspace host.
    if (url.pathname) {
      const segments = url.pathname.split('/').filter(Boolean);
      if (segments.length) {
        const filtered = segments.filter(segment => !/^api$/i.test(segment) && !/^2\.0$/i.test(segment) && !/^2\.1$/i.test(segment));
        url.pathname = filtered.length ? `/${filtered.join('/')}` : '';
      }
    }

    url.search = '';
    url.hash = '';

    return url.origin;
  }

  private static resolveToken(credentials: DatabricksCredentials): string {
    const candidates = [
      credentials.personalAccessToken,
      credentials.pat,
      credentials.token,
      credentials.apiKey,
      credentials.accessToken,
      credentials['personal_access_token'],
      credentials['personal-access-token'],
    ];

    const token = candidates.find(value => typeof value === 'string' && value.trim().length > 0);
    if (!token) {
      throw new Error('Databricks integration requires a personal access token');
    }

    return token.trim();
  }
}
