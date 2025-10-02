import { Buffer } from 'buffer';
import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

interface AzureDevOpsCredentials extends APICredentials {
  organization: string;
  personal_access_token?: string;
  personalAccessToken?: string;
  project?: string;
}

interface WorkItemParams {
  type: string;
  title: string;
  description?: string;
  assigned_to?: string;
  area_path?: string;
  iteration_path?: string;
  priority?: number;
}

interface TriggerBuildParams {
  definition_id: string;
  source_branch?: string;
  parameters?: Record<string, any>;
}

interface CreateReleaseParams {
  definition_id: string;
  description?: string;
  artifacts?: Array<Record<string, any>>;
}

interface GetBuildStatusParams {
  build_id: string;
}

export class AzureDevopsAPIClient extends BaseAPIClient {
  private readonly project?: string;
  private readonly apiVersion = '7.0';
  private readonly personalAccessToken: string;

  constructor(credentials: AzureDevOpsCredentials) {
    const organization = credentials.organization || credentials.org;
    const personalAccessToken = credentials.personal_access_token || credentials.personalAccessToken;
    if (!organization) {
      throw new Error('Azure DevOps integration requires an organization');
    }
    if (!personalAccessToken) {
      throw new Error('Azure DevOps integration requires a personal access token');
    }

    const baseURL = `https://dev.azure.com/${encodeURIComponent(organization)}`;
    super(baseURL, credentials);

    this.personalAccessToken = personalAccessToken;
    this.project = credentials.project;

    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'create_work_item': this.createWorkItem.bind(this) as any,
      'trigger_build': this.triggerBuild.bind(this) as any,
      'create_release': this.createRelease.bind(this) as any,
      'get_build_status': this.getBuildStatus.bind(this) as any,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const token = Buffer.from(`:${this.personalAccessToken}`).toString('base64');
    return {
      Authorization: `Basic ${token}`,
      Accept: 'application/json',
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get(`/_apis/projects?api-version=${this.apiVersion}`);
  }

  public async createWorkItem(params: WorkItemParams): Promise<APIResponse<any>> {
    this.ensureProject();
    this.validateRequiredParams(params as any, ['type', 'title']);

    const operations: Array<{ op: string; path: string; value: any }> = [
      { op: 'add', path: '/fields/System.Title', value: params.title }
    ];

    if (params.description) {
      operations.push({ op: 'add', path: '/fields/System.Description', value: params.description });
    }
    if (params.assigned_to) {
      operations.push({ op: 'add', path: '/fields/System.AssignedTo', value: params.assigned_to });
    }
    if (params.area_path) {
      operations.push({ op: 'add', path: '/fields/System.AreaPath', value: params.area_path });
    }
    if (params.iteration_path) {
      operations.push({ op: 'add', path: '/fields/System.IterationPath', value: params.iteration_path });
    }
    if (typeof params.priority === 'number') {
      operations.push({ op: 'add', path: '/fields/Microsoft.VSTS.Common.Priority', value: params.priority });
    }

    const endpoint = `/${encodeURIComponent(this.project!)}/_apis/wit/workitems/$${encodeURIComponent(params.type)}?api-version=${this.apiVersion}`;
    return this.patch(endpoint, operations, {
      'Content-Type': 'application/json-patch+json',
    });
  }

  public async triggerBuild(params: TriggerBuildParams): Promise<APIResponse<any>> {
    this.ensureProject();
    this.validateRequiredParams(params as any, ['definition_id']);

    const payload: Record<string, any> = {
      definition: { id: params.definition_id },
    };
    if (params.source_branch) {
      payload.sourceBranch = params.source_branch;
    }
    if (params.parameters) {
      payload.parameters = JSON.stringify(params.parameters);
    }

    const endpoint = `/${encodeURIComponent(this.project!)}/_apis/build/builds?api-version=${this.apiVersion}`;
    return this.post(endpoint, payload);
  }

  public async createRelease(params: CreateReleaseParams): Promise<APIResponse<any>> {
    this.ensureProject();
    this.validateRequiredParams(params as any, ['definition_id']);

    const payload: Record<string, any> = {
      definitionId: params.definition_id,
    };

    if (params.description) {
      payload.description = params.description;
    }

    if (params.artifacts) {
      payload.artifacts = params.artifacts;
    }

    const endpoint = `/${encodeURIComponent(this.project!)}/_apis/release/releases?api-version=${this.apiVersion}`;
    return this.post(endpoint, payload);
  }

  public async getBuildStatus(params: GetBuildStatusParams): Promise<APIResponse<any>> {
    this.ensureProject();
    this.validateRequiredParams(params as any, ['build_id']);

    const endpoint = `/${encodeURIComponent(this.project!)}/_apis/build/builds/${encodeURIComponent(params.build_id)}?api-version=${this.apiVersion}`;
    return this.get(endpoint);
  }

  private ensureProject(): void {
    if (!this.project) {
      throw new Error('Azure DevOps integration requires a project');
    }
  }
}
