import { Buffer } from 'buffer';
import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

export class ZendeskAPIClient extends BaseAPIClient {
  private subdomain: string;
  private email?: string;
  private apiToken?: string;
  private accessToken?: string;

  constructor(credentials: APICredentials) {
    const subdomain = credentials.subdomain;
    if (!subdomain) {
      throw new Error('Zendesk integration requires subdomain');
    }
    super(`https://${subdomain}.zendesk.com/api/v2`, credentials);
    this.subdomain = subdomain;
    this.email = credentials.email;
    this.apiToken = credentials.apiToken;
    this.accessToken = credentials.accessToken;

    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'create_ticket': this.createTicket.bind(this) as any,
      'add_comment': this.addComment.bind(this) as any,
      'list_tickets': this.listTickets.bind(this) as any,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    if (this.accessToken) {
      return {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      };
    }
    if (!this.email || !this.apiToken) {
      throw new Error('Zendesk integration requires email and apiToken or accessToken');
    }
    const basic = Buffer.from(`${this.email}/token:${this.apiToken}`).toString('base64');
    return {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/json'
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/users/me.json', this.getAuthHeaders());
  }

  public async createTicket(params: { subject: string; comment: { body: string }; requester?: { name?: string; email: string } }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['subject', 'comment']);
    return this.post('/tickets.json', { ticket: params }, this.getAuthHeaders());
  }

  public async addComment(params: { ticketId: number | string; body: string; public?: boolean }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['ticketId', 'body']);
    return this.put(`/tickets/${params.ticketId}.json`, {
      ticket: {
        comment: {
          body: params.body,
          public: params.public ?? true
        }
      }
    }, this.getAuthHeaders());
  }

  public async listTickets(params: { status?: string; perPage?: number } = {}): Promise<APIResponse<any>> {
    const query: Record<string, any> = {};
    if (params.status) query.status = params.status;
    if (params.perPage) query.per_page = params.perPage;
    const qs = this.buildQueryString(query);
    return this.get(`/tickets.json${qs}`, this.getAuthHeaders());
  }
}

