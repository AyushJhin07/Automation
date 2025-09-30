import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

export class IntercomAPIClient extends BaseAPIClient {
  constructor(credentials: APICredentials) {
    super('https://api.intercom.io', credentials);
    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'create_contact': this.createContact.bind(this) as any,
      'send_message': this.sendMessage.bind(this) as any,
      'list_conversations': this.listConversations.bind(this) as any,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const token = this.credentials.accessToken || this.credentials.apiKey || '';
    return {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/me', this.getAuthHeaders());
  }

  public async createContact(params: { email?: string; name?: string; phone?: string; customAttributes?: Record<string, any> }): Promise<APIResponse<any>> {
    return this.post('/contacts', {
      email: params.email,
      name: params.name,
      phone: params.phone,
      custom_attributes: params.customAttributes
    }, this.getAuthHeaders());
  }

  public async sendMessage(params: { from: { type: 'user' | 'contact' | 'admin'; id: string }; to: { type: 'user' | 'contact' | 'admin'; id: string }; body: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['from', 'to', 'body']);
    return this.post('/messages', {
      message_type: 'inapp',
      from: params.from,
      to: params.to,
      body: params.body
    }, this.getAuthHeaders());
  }

  public async listConversations(params: { perPage?: number } = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString({ per_page: params.perPage });
    return this.get(`/conversations${query}`, this.getAuthHeaders());
  }
}

