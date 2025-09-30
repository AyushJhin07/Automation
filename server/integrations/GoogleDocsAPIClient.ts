import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

export class GoogleDocsAPIClient extends BaseAPIClient {
  constructor(credentials: APICredentials) {
    super('https://docs.googleapis.com/v1', credentials);
    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'create_document': this.createDocument.bind(this) as any,
      'get_document': this.getDocument.bind(this) as any,
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
    const resp = await fetch('https://docs.googleapis.com/$discovery/rest?version=v1');
    return resp.ok ? { success: true, data: await resp.json().catch(() => ({})) } : { success: false, error: `HTTP ${resp.status}` };
  }

  public async createDocument(params: { title: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['title']);
    return this.post('/documents', { title: params.title }, this.getAuthHeaders());
  }

  public async getDocument(params: { documentId: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['documentId']);
    return this.get(`/documents/${params.documentId}`, this.getAuthHeaders());
  }
}
