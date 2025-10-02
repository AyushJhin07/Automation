import { Buffer } from 'buffer';
import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';
import { getErrorMessage } from '../types/common';

type JenkinsCredentials = APICredentials & {
  instanceUrl?: string;
  instance_url?: string;
  username?: string;
  api_token?: string;
  apiToken?: string;
};

type BuildParams = {
  job_name: string;
  parameters?: Record<string, any>;
  token?: string;
  cause?: string;
};

type BuildLookup = {
  job_name: string;
  build_number: number;
};

type JobMutation = {
  job_name: string;
  config_xml: string;
  folder?: string;
};

type JobCopyParams = {
  from_job: string;
  to_job: string;
  folder?: string;
};

type QueueItemParams = {
  queue_id: number;
};

export class JenkinsAPIClient extends BaseAPIClient {
  private readonly username: string;
  private readonly apiToken: string;

  constructor(credentials: JenkinsCredentials) {
    const instanceUrl = (credentials.instanceUrl || credentials.instance_url || '').replace(/\/$/, '');
    if (!instanceUrl) {
      throw new Error('Jenkins integration requires an instance URL');
    }

    const username = credentials.username;
    const apiToken = credentials.api_token || credentials.apiToken || credentials.password || credentials.token;
    if (!username || !apiToken) {
      throw new Error('Jenkins integration requires username and API token');
    }

    super(instanceUrl, credentials);

    this.username = username;
    this.apiToken = apiToken;

    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'trigger_build': this.triggerBuild.bind(this) as any,
      'get_build_status': this.getBuildStatus.bind(this) as any,
      'get_last_build': this.getLastBuild.bind(this) as any,
      'get_build_console': this.getBuildConsole.bind(this) as any,
      'list_jobs': this.listJobs.bind(this) as any,
      'get_job_info': this.getJobInfo.bind(this) as any,
      'create_job': this.createJob.bind(this) as any,
      'update_job': this.updateJob.bind(this) as any,
      'delete_job': this.deleteJob.bind(this) as any,
      'enable_job': this.enableJob.bind(this) as any,
      'disable_job': this.disableJob.bind(this) as any,
      'copy_job': this.copyJob.bind(this) as any,
      'stop_build': this.stopBuild.bind(this) as any,
      'get_queue': this.getQueue.bind(this) as any,
      'cancel_queue_item': this.cancelQueueItem.bind(this) as any,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const token = Buffer.from(`${this.username}:${this.apiToken}`).toString('base64');
    return {
      Authorization: `Basic ${token}`,
      Accept: 'application/json',
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/api/json');
  }

  public async triggerBuild(params: BuildParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['job_name']);
    const jobPath = this.buildJobPath(params.job_name);
    const hasParameters = params.parameters && Object.keys(params.parameters).length > 0;
    const endpointBase = `/${jobPath}/${hasParameters ? 'buildWithParameters' : 'build'}`;
    const query = this.buildQueryString({ token: params.token, cause: params.cause });
    const endpoint = `${endpointBase}${query}`;

    if (hasParameters) {
      const form = new URLSearchParams();
      for (const [key, value] of Object.entries(params.parameters ?? {})) {
        form.append(key, String(value));
      }
      return this.rawRequest('POST', endpoint, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      });
    }

    return this.rawRequest('POST', endpoint);
  }

  public async getBuildStatus(params: BuildLookup): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['job_name', 'build_number']);
    const jobPath = this.buildJobPath(params.job_name);
    return this.get(`/${jobPath}/${params.build_number}/api/json`);
  }

  public async getLastBuild(params: { job_name: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['job_name']);
    const jobPath = this.buildJobPath(params.job_name);
    return this.get(`/${jobPath}/lastBuild/api/json`);
  }

  public async getBuildConsole(params: BuildLookup & { start?: number }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['job_name', 'build_number']);
    const jobPath = this.buildJobPath(params.job_name);
    const query = this.buildQueryString({ start: params.start ?? 0 });
    return this.get(`/${jobPath}/${params.build_number}/logText/progressiveText${query}`);
  }

  public async listJobs(params: { folder?: string; depth?: number } = {}): Promise<APIResponse<any>> {
    const folderPrefix = params.folder ? `${this.buildJobPath(params.folder)}/` : '';
    const query = this.buildQueryString({ depth: params.depth ?? 1, tree: 'jobs[name,color,url]' });
    return this.get(`/${folderPrefix}api/json${query}`);
  }

  public async getJobInfo(params: { job_name: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['job_name']);
    const jobPath = this.buildJobPath(params.job_name);
    return this.get(`/${jobPath}/api/json`);
  }

  public async createJob(params: JobMutation): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['job_name', 'config_xml']);
    const folderPrefix = params.folder ? `${this.buildJobPath(params.folder)}/` : '';
    const endpoint = `/${folderPrefix}createItem?name=${encodeURIComponent(params.job_name)}`;
    return this.rawRequest('POST', endpoint, {
      headers: { 'Content-Type': 'application/xml' },
      body: params.config_xml,
    });
  }

  public async updateJob(params: JobMutation): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['job_name', 'config_xml']);
    const jobPath = this.buildJobPath(params.job_name);
    return this.rawRequest('POST', `/${jobPath}/config.xml`, {
      headers: { 'Content-Type': 'application/xml' },
      body: params.config_xml,
    });
  }

  public async deleteJob(params: { job_name: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['job_name']);
    const jobPath = this.buildJobPath(params.job_name);
    return this.rawRequest('POST', `/${jobPath}/doDelete`);
  }

  public async enableJob(params: { job_name: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['job_name']);
    const jobPath = this.buildJobPath(params.job_name);
    return this.rawRequest('POST', `/${jobPath}/enable`);
  }

  public async disableJob(params: { job_name: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['job_name']);
    const jobPath = this.buildJobPath(params.job_name);
    return this.rawRequest('POST', `/${jobPath}/disable`);
  }

  public async copyJob(params: JobCopyParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['from_job', 'to_job']);
    const folderPrefix = params.folder ? `${this.buildJobPath(params.folder)}/` : '';
    const query = new URLSearchParams({ from: params.from_job, mode: 'copy' });
    const endpoint = `/${folderPrefix}createItem?name=${encodeURIComponent(params.to_job)}&${query.toString()}`;
    return this.rawRequest('POST', endpoint);
  }

  public async stopBuild(params: BuildLookup): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['job_name', 'build_number']);
    const jobPath = this.buildJobPath(params.job_name);
    return this.rawRequest('POST', `/${jobPath}/${params.build_number}/stop`);
  }

  public async getQueue(): Promise<APIResponse<any>> {
    return this.get('/queue/api/json');
  }

  public async cancelQueueItem(params: QueueItemParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['queue_id']);
    return this.rawRequest('POST', `/queue/cancelItem?id=${params.queue_id}`);
  }

  private buildJobPath(job: string): string {
    return job
      .split('/')
      .map(segment => segment.trim())
      .filter(Boolean)
      .map(segment => `job/${encodeURIComponent(segment)}`)
      .join('/');
  }

  private async rawRequest(
    method: 'POST' | 'PUT',
    endpoint: string,
    options: { headers?: Record<string, string>; body?: string } = {}
  ): Promise<APIResponse<any>> {
    try {
      const url = `${this.baseURL}${endpoint}`;
      const response = await fetch(url, {
        method,
        headers: {
          ...this.getAuthHeaders(),
          ...(options.headers ?? {}),
        },
        body: options.body,
      });

      const text = await response.text();
      let data: any = undefined;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      }

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
          statusCode: response.status,
          data,
        };
      }

      return {
        success: true,
        data,
        statusCode: response.status,
        headers: Object.fromEntries(response.headers.entries()),
      };
    } catch (error) {
      return {
        success: false,
        error: getErrorMessage(error),
        statusCode: 0,
      };
    }
  }
}
