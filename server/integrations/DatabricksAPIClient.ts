import type { APICredentials, APIResponse } from './BaseAPIClient';
import { BaseAPIClient } from './BaseAPIClient';

interface DatabricksListClustersParams {
  can_use_client?: string;
}

interface DatabricksClusterActionParams {
  cluster_id: string;
}

interface DatabricksSubmitRunParams {
  run_name?: string;
  new_cluster?: Record<string, any>;
  existing_cluster_id?: string;
  notebook_task?: Record<string, any>;
  spark_jar_task?: Record<string, any>;
  spark_python_task?: Record<string, any>;
  libraries?: any[];
  timeout_seconds?: number;
  idempotency_token?: string;
}

interface DatabricksGetRunParams {
  run_id: number;
  include_history?: boolean;
}

interface DatabricksCancelRunParams {
  run_id: number;
}

interface DatabricksListJobsParams {
  limit?: number;
  offset?: number;
  expand_tasks?: boolean;
}

interface DatabricksCreateJobParams extends Record<string, any> {}

function normalizeDatabricksHost(candidate?: string | null): string {
  const raw = `${candidate ?? ''}`.trim();
  if (!raw) {
    throw new Error('Databricks connector requires a workspace URL (for example https://adb-123.45.azuredatabricks.net).');
  }

  const prefixed = raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`;
  return prefixed.replace(/\/$/, '');
}

function resolveDatabricksHost(credentials: APICredentials, additionalConfig?: Record<string, any>): string {
  return (
    (additionalConfig?.workspaceUrl as string | undefined) ??
    (credentials as any).workspaceUrl ??
    (credentials as any).instanceUrl ??
    (credentials as any).host ??
    credentials.baseUrl ??
    ''
  );
}

export class DatabricksAPIClient extends BaseAPIClient {
  constructor(
    credentials: APICredentials & { workspaceUrl?: string; instanceUrl?: string; host?: string },
    additionalConfig?: Record<string, any>
  ) {
    const host = normalizeDatabricksHost(resolveDatabricksHost(credentials, additionalConfig));
    const baseURL = `${host}/api/2.0`;

    super(baseURL, credentials, { connectorId: 'databricks' });

    this.registerHandlers({
      test_connection: this.testConnection.bind(this) as any,
      list_clusters: this.listClusters.bind(this) as any,
      get_cluster: this.getCluster.bind(this) as any,
      start_cluster: this.startCluster.bind(this) as any,
      stop_cluster: this.stopCluster.bind(this) as any,
      submit_run: this.submitRun.bind(this) as any,
      get_run: this.getRun.bind(this) as any,
      cancel_run: this.cancelRun.bind(this) as any,
      list_jobs: this.listJobs.bind(this) as any,
      create_job: this.createJob.bind(this) as any,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const token = this.credentials.accessToken ?? this.credentials.apiKey;
    if (!token) {
      throw new Error('Databricks connector requires a personal access token.');
    }
    return { Authorization: `Bearer ${token}` };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.post('/clusters/list', {}, undefined, { retry: { maxAttempts: 1 } });
  }

  public async listClusters(params: DatabricksListClustersParams = {}): Promise<APIResponse<any>> {
    return this.post('/clusters/list', params);
  }

  public async getCluster(params: DatabricksClusterActionParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['cluster_id']);
    return this.get(`/clusters/get${this.buildQueryString({ cluster_id: params.cluster_id })}`);
  }

  public async startCluster(params: DatabricksClusterActionParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['cluster_id']);
    return this.post('/clusters/start', { cluster_id: params.cluster_id });
  }

  public async stopCluster(params: DatabricksClusterActionParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['cluster_id']);
    return this.post('/clusters/delete', { cluster_id: params.cluster_id });
  }

  public async submitRun(params: DatabricksSubmitRunParams): Promise<APIResponse<any>> {
    const hasTask = Boolean(params.notebook_task || params.spark_python_task || params.spark_jar_task);
    if (!hasTask) {
      throw new Error('Databricks run submissions require a notebook_task, spark_python_task, or spark_jar_task.');
    }

    return this.post('/jobs/runs/submit', params);
  }

  public async getRun(params: DatabricksGetRunParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['run_id']);
    return this.get(`/jobs/runs/get${this.buildQueryString({ run_id: params.run_id, include_history: params.include_history })}`);
  }

  public async cancelRun(params: DatabricksCancelRunParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['run_id']);
    return this.post('/jobs/runs/cancel', { run_id: params.run_id });
  }

  public async listJobs(params: DatabricksListJobsParams = {}): Promise<APIResponse<any>> {
    return this.get(
      `/jobs/list${this.buildQueryString({ limit: params.limit, offset: params.offset, expand_tasks: params.expand_tasks })}`
    );
  }

  public async createJob(params: DatabricksCreateJobParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['name']);
    return this.post('/jobs/create', params);
  }
}
