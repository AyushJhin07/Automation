import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

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
  inventory_id: string | number;
  name: string;
  variables?: Record<string, any>;
}

interface CreateJobTemplateParams {
  name: string;
  job_type?: 'run' | 'check';
  inventory: number | string;
  project: number | string;
  playbook: string;
  credential?: number | string;
}

interface ListJobTemplatesParams {
  name?: string;
  page?: number;
  page_size?: number;
}

interface DeleteJobTemplateParams {
  job_template_id: string | number;
}

export class AnsibleAPIClient extends BaseAPIClient {
  constructor(credentials: APICredentials) {
    const baseUrl = (credentials.base_url || credentials.baseUrl || 'https://your-ansible-tower.com/api/v2').replace(/\/$/, '');
    super(baseUrl, credentials);

    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'launch_job_template': this.launchJobTemplate.bind(this) as any,
      'get_job_status': this.getJobStatus.bind(this) as any,
      'create_inventory': this.createInventory.bind(this) as any,
      'add_host': this.addHost.bind(this) as any,
      'create_job_template': this.createJobTemplate.bind(this) as any,
      'list_job_templates': this.listJobTemplates.bind(this) as any,
      'delete_job_template': this.deleteJobTemplate.bind(this) as any,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const token = this.credentials.api_token || this.credentials.accessToken || this.credentials.token;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    return headers;
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/me/');
  }

  public async launchJobTemplate(params: LaunchJobTemplateParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['job_template_id']);
    const payload: Record<string, any> = {};
    if (params.extra_vars) payload.extra_vars = params.extra_vars;
    if (params.inventory) payload.inventory = params.inventory;
    if (params.limit) payload.limit = params.limit;
    return this.post(`/job_templates/${params.job_template_id}/launch/`, payload);
  }

  public async getJobStatus(params: GetJobStatusParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['job_id']);
    return this.get(`/jobs/${params.job_id}/`);
  }

  public async createInventory(params: CreateInventoryParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['name']);
    const payload = {
      name: params.name,
      description: params.description,
      organization: params.organization
    };
    return this.post('/inventories/', payload);
  }

  public async addHost(params: AddHostParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['inventory_id', 'name']);
    const payload = {
      name: params.name,
      variables: params.variables ?? {}
    };
    return this.post(`/inventories/${params.inventory_id}/hosts/`, payload);
  }

  public async createJobTemplate(params: CreateJobTemplateParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['name', 'inventory', 'project', 'playbook']);
    const payload: Record<string, any> = {
      name: params.name,
      job_type: params.job_type ?? 'run',
      inventory: params.inventory,
      project: params.project,
      playbook: params.playbook
    };
    if (params.credential) {
      payload.credential = params.credential;
    }
    return this.post('/job_templates/', payload);
  }

  public async listJobTemplates(params: ListJobTemplatesParams = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString({
      name: params.name,
      page: params.page,
      page_size: params.page_size
    });
    return this.get(`/job_templates/${query}`);
  }

  public async deleteJobTemplate(params: DeleteJobTemplateParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['job_template_id']);
    return this.delete(`/job_templates/${params.job_template_id}/`);
  }
}
