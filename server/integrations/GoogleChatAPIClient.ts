import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

export class GoogleChatAPIClient extends BaseAPIClient {
  constructor(credentials: APICredentials) {
    super('https://chat.googleapis.com/v1', credentials);
    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'list_spaces': this.listSpaces.bind(this) as any,
      'list_messages': this.listMessages.bind(this) as any,
      'create_message': this.createMessage.bind(this) as any,
      'send_message': this.createMessage.bind(this) as any,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const token = this.credentials.accessToken || '';
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8'
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/spaces', this.getAuthHeaders());
  }

  public async listSpaces(): Promise<APIResponse<any>> {
    return this.get('/spaces', this.getAuthHeaders());
  }

  public async createMessage(params: { space: string; text: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['space', 'text']);
    return this.post(`/spaces/${params.space}/messages`, { text: params.text }, this.getAuthHeaders());
  }

  public async listMessages(params: { space: string; pageSize?: number } ): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['space']);
    const query = this.buildQueryString({ pageSize: params.pageSize });
    return this.get(`/spaces/${params.space}/messages${query}`, this.getAuthHeaders());
  }
}
