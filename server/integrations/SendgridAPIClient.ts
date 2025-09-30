import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

export class SendgridAPIClient extends BaseAPIClient {
  constructor(credentials: APICredentials) {
    super('https://api.sendgrid.com/v3', credentials);
    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'send_email': this.sendEmail.bind(this) as any,
      'create_contact': this.createContact.bind(this) as any,
      'list_suppressions': this.listSuppressions.bind(this) as any,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const token = this.credentials.apiKey || this.credentials.accessToken || '';
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/user/account', this.getAuthHeaders());
  }

  public async sendEmail(params: { from: { email: string; name?: string }; to: { email: string; name?: string }[]; subject: string; content: { type: string; value: string }[] }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['from', 'to', 'subject', 'content']);
    return this.post('/mail/send', {
      personalizations: [{ to: params.to }],
      from: params.from,
      subject: params.subject,
      content: params.content,
    }, this.getAuthHeaders());
  }

  public async createContact(params: { listIds?: string[]; contacts: any[] }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['contacts']);
    return this.put('/marketing/contacts', params, this.getAuthHeaders());
  }

  public async listSuppressions(params: { groupId: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['groupId']);
    return this.get(`/asm/groups/${params.groupId}/suppressions`, this.getAuthHeaders());
  }
}

