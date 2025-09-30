import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

export class GoogleSlidesAPIClient extends BaseAPIClient {
  constructor(credentials: APICredentials) {
    super('https://slides.googleapis.com/v1', credentials);
    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'create_presentation': this.createPresentation.bind(this) as any,
      'get_presentation': this.getPresentation.bind(this) as any,
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
    const resp = await fetch('https://slides.googleapis.com/$discovery/rest?version=v1');
    return resp.ok ? { success: true, data: await resp.json().catch(() => ({})) } : { success: false, error: `HTTP ${resp.status}` };
  }

  public async createPresentation(params: { title: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['title']);
    return this.post('/presentations', { title: params.title }, this.getAuthHeaders());
  }

  public async getPresentation(params: { presentationId: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['presentationId']);
    return this.get(`/presentations/${params.presentationId}`, this.getAuthHeaders());
  }
}

