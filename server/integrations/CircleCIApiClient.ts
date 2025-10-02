import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

type TriggerPipelineParams = {
  project_slug: string;
  branch?: string;
  tag?: string;
  parameters?: Record<string, any>;
};

type ProjectScopedParams = {
  project_slug: string;
  branch?: string;
  page_token?: string;
};

type PipelineLookupParams = {
  pipeline_id: string;
  page_token?: string;
};

type WorkflowLookupParams = {
  workflow_id: string;
  page_token?: string;
};

type RerunWorkflowParams = {
  workflow_id: string;
  enable_ssh?: boolean;
  from_failed?: boolean;
  sparse_tree?: boolean;
};

export class CircleCIApiClient extends BaseAPIClient {
  private readonly token: string;

  constructor(credentials: APICredentials) {
    const token = credentials.apiKey || credentials.token || credentials.accessToken;
    if (!token) {
      throw new Error('CircleCI integration requires an API token');
    }

    super('https://circleci.com/api/v2', credentials);
    this.token = token;

    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'trigger_pipeline': this.triggerPipeline.bind(this) as any,
      'get_pipelines': this.getPipelines.bind(this) as any,
      'get_pipeline': this.getPipeline.bind(this) as any,
      'get_workflows': this.getWorkflows.bind(this) as any,
      'get_jobs': this.getJobs.bind(this) as any,
      'cancel_workflow': this.cancelWorkflow.bind(this) as any,
      'rerun_workflow': this.rerunWorkflow.bind(this) as any,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      'Circle-Token': this.token,
      Accept: 'application/json',
    };
  }

  private encodeProjectSlug(slug: string): string {
    return slug
      .split('/')
      .map(segment => encodeURIComponent(segment))
      .join('/');
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/me');
  }

  public async triggerPipeline(params: TriggerPipelineParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['project_slug']);
    const payload: Record<string, any> = {};
    if (params.branch) payload.branch = params.branch;
    if (params.tag) payload.tag = params.tag;
    if (params.parameters) payload.parameters = params.parameters;

    return this.post(`/project/${this.encodeProjectSlug(params.project_slug)}/pipeline`, payload);
  }

  public async getPipelines(params: ProjectScopedParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['project_slug']);
    const query = this.buildQueryString({ branch: params.branch, 'page-token': params.page_token });
    return this.get(`/project/${this.encodeProjectSlug(params.project_slug)}/pipeline${query}`);
  }

  public async getPipeline(params: PipelineLookupParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['pipeline_id']);
    return this.get(`/pipeline/${encodeURIComponent(params.pipeline_id)}`);
  }

  public async getWorkflows(params: PipelineLookupParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['pipeline_id']);
    const query = this.buildQueryString({ 'page-token': params.page_token });
    return this.get(`/pipeline/${encodeURIComponent(params.pipeline_id)}/workflow${query}`);
  }

  public async getJobs(params: WorkflowLookupParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['workflow_id']);
    const query = this.buildQueryString({ 'page-token': params.page_token });
    return this.get(`/workflow/${encodeURIComponent(params.workflow_id)}/job${query}`);
  }

  public async cancelWorkflow(params: { workflow_id: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['workflow_id']);
    return this.post(`/workflow/${encodeURIComponent(params.workflow_id)}/cancel`, {});
  }

  public async rerunWorkflow(params: RerunWorkflowParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['workflow_id']);
    const payload: Record<string, any> = {};
    if (typeof params.enable_ssh === 'boolean') payload.enable_ssh = params.enable_ssh;
    if (typeof params.from_failed === 'boolean') payload.from_failed = params.from_failed;
    if (typeof params.sparse_tree === 'boolean') payload.sparse_tree = params.sparse_tree;
    return this.post(`/workflow/${encodeURIComponent(params.workflow_id)}/rerun`, payload);
  }
}
