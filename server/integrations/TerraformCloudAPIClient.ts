import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

interface WorkspaceParams {
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

interface VariableDefinition {
  key: string;
  value: string;
  category: 'terraform' | 'env';
  sensitive?: boolean;
}

interface SetVariablesParams {
  workspace_id: string;
  variables: VariableDefinition[];
}

export class TerraformCloudAPIClient extends BaseAPIClient {
  private readonly organization: string;

  constructor(credentials: APICredentials) {
    const baseUrl = (credentials.baseUrl || 'https://app.terraform.io/api/v2').replace(/\/$/, '');
    super(baseUrl, credentials);
    this.organization = credentials.organization || credentials.org || '';

    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'create_workspace': this.createWorkspace.bind(this) as any,
      'trigger_run': this.triggerRun.bind(this) as any,
      'get_run_status': this.getRunStatus.bind(this) as any,
      'set_variables': this.setVariables.bind(this) as any,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const token = this.credentials.api_token || this.credentials.accessToken || this.credentials.token;
    const headers: Record<string, string> = {
      'Content-Type': 'application/vnd.api+json'
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    return headers;
  }

  private ensureOrganization(): void {
    if (!this.organization) {
      throw new Error('Terraform Cloud organization is required');
    }
  }

  public async testConnection(): Promise<APIResponse<any>> {
    this.ensureOrganization();
    return this.get(`/organizations/${this.organization}`);
  }

  public async createWorkspace(params: WorkspaceParams): Promise<APIResponse<any>> {
    this.ensureOrganization();
    this.validateRequiredParams(params as Record<string, any>, ['name']);

    const payload = {
      data: {
        type: 'workspaces',
        attributes: {
          name: params.name,
          terraform_version: params.terraform_version,
          working_directory: params.working_directory,
          auto_apply: params.auto_apply ?? false
        }
      }
    };

    return this.post(`/organizations/${this.organization}/workspaces`, payload);
  }

  public async triggerRun(params: TriggerRunParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['workspace_id']);

    const payload = {
      data: {
        type: 'runs',
        attributes: {
          message: params.message || 'Triggered via automation',
          is_destroy: params.is_destroy ?? false
        },
        relationships: {
          workspace: {
            data: {
              type: 'workspaces',
              id: params.workspace_id
            }
          }
        }
      }
    };

    return this.post('/runs', payload);
  }

  public async getRunStatus(params: GetRunStatusParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['run_id']);
    return this.get(`/runs/${params.run_id}`);
  }

  public async setVariables(params: SetVariablesParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['workspace_id', 'variables']);

    const results: any[] = [];
    for (const variable of params.variables) {
      const payload = {
        data: {
          type: 'vars',
          attributes: {
            key: variable.key,
            value: variable.value,
            category: variable.category,
            hcl: false,
            sensitive: variable.sensitive ?? false
          },
          relationships: {
            workspace: {
              data: {
                type: 'workspaces',
                id: params.workspace_id
              }
            }
          }
        }
      };

      const response = await this.post('/vars', payload);
      if (!response.success) {
        return response;
      }
      results.push(response.data);
    }

    return { success: true, data: results };
  }
}
