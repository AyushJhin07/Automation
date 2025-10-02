import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

interface TerraformVariable {
  key: string;
  value: string;
  category?: 'terraform' | 'env';
  sensitive?: boolean;
}

interface TerraformCredentials extends APICredentials {
  api_token?: string;
  token?: string;
  organization?: string;
  base_url?: string;
  apiBaseUrl?: string;
}

interface CreateWorkspaceParams {
  name: string;
  terraform_version?: string;
  working_directory?: string;
  auto_apply?: boolean;
}

interface TriggerRunParams {
  workspace_id: string;
  message?: string;
  is_destroy?: boolean;
}

interface GetRunStatusParams {
  run_id: string;
}

interface SetVariablesParams {
  workspace_id: string;
  variables: TerraformVariable[];
}

function ensureTrailingApi(url: string): string {
  return url.replace(/\/$/, '');
}

export class TerraformCloudAPIClient extends BaseAPIClient {
  private readonly token: string;
  private readonly organization: string;

  constructor(credentials: TerraformCredentials) {
    const baseUrl = credentials.apiBaseUrl || credentials.base_url || credentials.baseUrl || credentials.url || 'https://app.terraform.io/api/v2';
    const apiToken = credentials.api_token || credentials.token;
    const organization = credentials.organization;

    if (!apiToken) {
      throw new Error('Terraform Cloud integration requires an API token');
    }
    if (!organization) {
      throw new Error('Terraform Cloud integration requires an organization');
    }

    super(ensureTrailingApi(baseUrl), credentials);

    this.token = apiToken;
    this.organization = organization;

    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'create_workspace': this.createWorkspace.bind(this) as any,
      'trigger_run': this.triggerRun.bind(this) as any,
      'get_run_status': this.getRunStatus.bind(this) as any,
      'set_variables': this.setVariables.bind(this) as any,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get(`/organizations/${encodeURIComponent(this.organization)}`);
  }

  public async createWorkspace(params: CreateWorkspaceParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['name']);

    const payload = {
      data: {
        type: 'workspaces',
        attributes: {
          name: params.name,
          terraform_version: params.terraform_version,
          working_directory: params.working_directory,
          auto_apply: params.auto_apply ?? false,
        },
      },
    };

    return this.post(`/organizations/${encodeURIComponent(this.organization)}/workspaces`, payload);
  }

  public async triggerRun(params: TriggerRunParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['workspace_id']);

    const payload = {
      data: {
        attributes: {
          message: params.message ?? 'Triggered via API',
          'is-destroy': params.is_destroy ?? false,
        },
        relationships: {
          workspace: {
            data: { type: 'workspaces', id: params.workspace_id },
          },
        },
        type: 'runs',
      },
    };

    return this.post('/runs', payload);
  }

  public async getRunStatus(params: GetRunStatusParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['run_id']);
    return this.get(`/runs/${encodeURIComponent(params.run_id)}`);
  }

  public async setVariables(params: SetVariablesParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['workspace_id', 'variables']);

    const results: any[] = [];
    for (const variable of params.variables) {
      this.validateRequiredParams(variable as Record<string, any>, ['key', 'value']);
      const payload = {
        data: {
          type: 'vars',
          attributes: {
            key: variable.key,
            value: variable.value,
            category: variable.category || 'terraform',
            hcl: false,
            sensitive: variable.sensitive ?? false,
          },
        },
      };
      const response = await this.post(
        `/workspaces/${encodeURIComponent(params.workspace_id)}/vars`,
        payload
      );
      if (!response.success) {
        return response;
      }
      results.push(response.data);
    }

    return {
      success: true,
      data: results,
    };
  }
}
