import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

export class GoogleFormsAPIClient extends BaseAPIClient {
  constructor(credentials: APICredentials) {
    super('https://forms.googleapis.com/v1', credentials);
    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'create_form': this.createForm.bind(this) as any,
      'get_form': this.getForm.bind(this) as any,
      'list_forms': this.listForms.bind(this) as any,
      'list_responses': this.listResponses.bind(this) as any,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const token = this.credentials.accessToken || '';
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    const resp = await fetch('https://forms.googleapis.com/$discovery/rest?version=v1');
    return resp.ok ? { success: true, data: await resp.json().catch(() => ({})) } : { success: false, error: `HTTP ${resp.status}` };
  }

  public async listForms(): Promise<APIResponse<any>> {
    return this.get('/forms', this.getAuthHeaders());
  }

  public async createForm(params: { info: Record<string, any> }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['info']);
    return this.post('/forms', { info: params.info }, this.getAuthHeaders());
  }

  public async getForm(params: { formId: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['formId']);
    return this.get(`/forms/${params.formId}`, this.getAuthHeaders());
  }

  public async listResponses(params: { formId: string; pageSize?: number }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['formId']);
    const query = this.buildQueryString({ pageSize: params.pageSize });
    return this.get(`/forms/${params.formId}/responses${query}`, this.getAuthHeaders());
  }
}
