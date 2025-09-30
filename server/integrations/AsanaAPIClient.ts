import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

export class AsanaAPIClient extends BaseAPIClient {
  constructor(credentials: APICredentials) {
    super('https://app.asana.com/api/1.0', credentials);
    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'create_task': this.createTask.bind(this) as any,
      'update_task': this.updateTask.bind(this) as any,
      'add_comment': this.addComment.bind(this) as any,
      'list_projects': this.listProjects.bind(this) as any,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const token = this.credentials.accessToken || this.credentials.token || '';
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/users/me', this.getAuthHeaders());
  }

  public async createTask(params: { workspace: string; name: string; projects?: string[]; assignee?: string; notes?: string; dueOn?: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['workspace', 'name']);
    return this.post('/tasks', {
      data: {
        workspace: params.workspace,
        name: params.name,
        projects: params.projects,
        assignee: params.assignee,
        notes: params.notes,
        due_on: params.dueOn,
      }
    }, this.getAuthHeaders());
  }

  public async updateTask(params: { taskId: string; updates: Record<string, any> }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['taskId', 'updates']);
    return this.put(`/tasks/${params.taskId}`, { data: params.updates }, this.getAuthHeaders());
  }

  public async addComment(params: { taskId: string; text: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['taskId', 'text']);
    return this.post(`/tasks/${params.taskId}/stories`, { data: { text: params.text } }, this.getAuthHeaders());
  }

  public async listProjects(params: { workspace: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['workspace']);
    const query = this.buildQueryString({ workspace: params.workspace, opt_fields: 'gid,name' });
    return this.get(`/projects${query}`, this.getAuthHeaders());
  }
}

