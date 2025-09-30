import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

export class TypeformAPIClient extends BaseAPIClient {
  constructor(credentials: APICredentials) {
    super('https://api.typeform.com', credentials);
    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'list_forms': this.listForms.bind(this) as any,
      'get_form': this.getForm.bind(this) as any,
      'list_responses': this.listResponses.bind(this) as any,
      'get_responses': this.listResponses.bind(this) as any,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const token = this.credentials.accessToken || this.credentials.token || this.credentials.apiKey || '';
    return {
      Authorization: `Bearer ${token}`,
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/forms', this.getAuthHeaders());
  }

  public async listForms(): Promise<APIResponse<any>> {
    return this.get('/forms', this.getAuthHeaders());
  }

  public async getForm(params: { formId: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['formId']);
    return this.get(`/forms/${params.formId}`, this.getAuthHeaders());
  }

  public async listResponses(params: { formId: string; pageSize?: number; since?: string; until?: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['formId']);
    const query = this.buildQueryString({
      page_size: params.pageSize ?? 50,
      since: params.since,
      until: params.until
    });
    return this.get(`/forms/${params.formId}/responses${query}`, this.getAuthHeaders());
  }
}
