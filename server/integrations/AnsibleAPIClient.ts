import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

interface AnsibleCredentials extends APICredentials {
  api_token?: string;
  token?: string;
  base_url?: string;
  baseUrl?: string;
  url?: string;
}

interface LaunchJobTemplateParams {
  job_template_id: string;
  extra_vars?: Record<string, any>;
  inventory?: string;
  limit?: string;
}

interface GetJobStatusParams {
  job_id: string;
}

interface CreateInventoryParams {
  name: string;
  description?: string;
  organization?: string;
}

interface AddHostParams {
  inventory_id: string;
  name: string;
  variables?: Record<string, any>;
}

interface DeleteJobTemplateParams {
  job_template_id: string;
}

function sanitizeBaseUrl(url: string): string {
  return url.replace(/\/$/, '');
}

export class AnsibleAPIClient extends BaseAPIClient {
  private readonly token: string;

  constructor(credentials: AnsibleCredentials) {
    const baseUrl = credentials.base_url || credentials.baseUrl || credentials.url;
    if (!baseUrl) {
      throw new Error('Ansible integration requires a base_url');
    }

    const token = credentials.api_token || credentials.token;
    if (!token) {
      throw new Error('Ansible integration requires an API token');
    }

    super(sanitizeBaseUrl(baseUrl), credentials);

    this.token = token;

    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'launch_job_template': this.launchJobTemplate.bind(this) as any,
      'get_job_status': this.getJobStatus.bind(this) as any,
      'create_inventory': this.createInventory.bind(this) as any,
      'add_host': this.addHost.bind(this) as any,
      'list_job_templates': this.listJobTemplates.bind(this) as any,
      'delete_job_template': this.deleteJobTemplate.bind(this) as any,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/json',
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/ping/');
  }

  public async launchJobTemplate(params: LaunchJobTemplateParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['job_template_id']);
    const payload: Record<string, any> = {
      extra_vars: params.extra_vars,
      inventory: params.inventory,
      limit: params.limit,
    };
    return this.post(`/job_templates/${encodeURIComponent(params.job_template_id)}/launch/`, payload);
  }

  public async getJobStatus(params: GetJobStatusParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['job_id']);
    return this.get(`/jobs/${encodeURIComponent(params.job_id)}/`);
  }

  public async createInventory(params: CreateInventoryParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['name']);
    const payload = {
      name: params.name,
      description: params.description,
      organization: params.organization,
    };
    return this.post('/inventories/', payload);
  }

  public async addHost(params: AddHostParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['inventory_id', 'name']);
    const payload = {
      name: params.name,
      variables: params.variables,
    };
    return this.post(`/inventories/${encodeURIComponent(params.inventory_id)}/hosts/`, payload);
  }

  public async listJobTemplates(): Promise<APIResponse<any>> {
    return this.get('/job_templates/');
  }

  public async deleteJobTemplate(params: DeleteJobTemplateParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['job_template_id']);
    return this.delete(`/job_templates/${encodeURIComponent(params.job_template_id)}/`);
  }
}
