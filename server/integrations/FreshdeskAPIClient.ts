import { Buffer } from 'buffer';
import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

export class FreshdeskAPIClient extends BaseAPIClient {
  constructor(credentials: APICredentials) {
    const domain = credentials.domain || credentials.subdomain;
    if (!domain) {
      throw new Error('Freshdesk integration requires domain');
    }
    super(`https://${domain}.freshdesk.com/api/v2`, credentials);
    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'create_ticket': this.createTicket.bind(this) as any,
      'add_note': this.addNote.bind(this) as any,
      'list_tickets': this.listTickets.bind(this) as any,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const apiKey = this.credentials.apiKey || this.credentials.accessToken;
    if (!apiKey) {
      throw new Error('Freshdesk integration requires apiKey');
    }
    const basic = Buffer.from(`${apiKey}:X`).toString('base64');
    return {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/json'
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/contacts', this.getAuthHeaders());
  }

  public async createTicket(params: { subject: string; description: string; email?: string; priority?: number; status?: number }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['subject', 'description']);
    return this.post('/tickets', params, this.getAuthHeaders());
  }

  public async addNote(params: { ticketId: number; body: string; private?: boolean }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['ticketId', 'body']);
    return this.post(`/tickets/${params.ticketId}/notes`, {
      body: params.body,
      private: params.private ?? true
    }, this.getAuthHeaders());
  }

  public async listTickets(params: { perPage?: number } = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString({ per_page: params.perPage ?? 30 });
    return this.get(`/tickets${query}`, this.getAuthHeaders());
  }
}

