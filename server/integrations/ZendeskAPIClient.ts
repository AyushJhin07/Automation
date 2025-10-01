import { BaseAPIClient, APICredentials, APIResponse } from './BaseAPIClient';

export interface ZendeskCredentials extends APICredentials {
  subdomain: string;
  email?: string;
  apiToken?: string;
  accessToken?: string;
}

interface TicketPayload {
  ticket: Record<string, any>;
}

interface UpdateTicketParams extends TicketPayload {
  ticketId: number;
}

/**
 * Zendesk Support API client supporting token or OAuth authentication.
 */
export class ZendeskAPIClient extends BaseAPIClient {
  constructor(credentials: ZendeskCredentials) {
    if (!credentials?.subdomain) {
      throw new Error('Zendesk integration requires a subdomain');
    }

    const baseURL = `https://${credentials.subdomain}.zendesk.com/api/v2`;
    super(baseURL, credentials);
  }

  protected getAuthHeaders(): Record<string, string> {
    if (this.credentials.accessToken) {
      return {
        Authorization: `Bearer ${this.credentials.accessToken}`,
        'Content-Type': 'application/json'
      };
    }

    if (this.credentials.email && this.credentials.apiToken) {
      const token = Buffer.from(`${this.credentials.email}/token:${this.credentials.apiToken}`).toString('base64');
      return {
        Authorization: `Basic ${token}`,
        'Content-Type': 'application/json'
      };
    }

    throw new Error('Zendesk integration requires either accessToken or email+apiToken');
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/users/me.json');
  }

  public async listTickets(params: { page?: number; per_page?: number }): Promise<APIResponse<any>> {
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.set('page', String(params.page));
    if (params.per_page) searchParams.set('per_page', String(params.per_page));
    const qs = searchParams.toString();
    return this.get(`/tickets.json${qs ? `?${qs}` : ''}`);
  }

  public async createTicket(params: TicketPayload): Promise<APIResponse<any>> {
    return this.post('/tickets.json', params);
  }

  public async updateTicket(params: UpdateTicketParams): Promise<APIResponse<any>> {
    const { ticketId, ticket } = params;
    return this.put(`/tickets/${ticketId}.json`, { ticket });
  }

  public async ticketCreated(params: { page?: number; per_page?: number }): Promise<APIResponse<any>> {
    return this.listTickets(params);
  }

  private async put(endpoint: string, data: any): Promise<APIResponse<any>> {
    return this.makeRequest('PUT', endpoint, data);
  }

  // Override makeRequest so we can reuse Base logic while handling Buffer in browserless env
  protected override async makeRequest<T = any>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    endpoint: string,
    data?: any,
    headers: Record<string, string> = {}
  ): Promise<APIResponse<T>> {
    const requestHeaders = {
      ...headers,
      ...this.getAuthHeaders(),
    };

    const response = await super.makeRequest<T>(method, endpoint, data, requestHeaders);
    if (!response.success && response.error?.includes('HTTP 401')) {
      return { ...response, error: 'Authentication failed for Zendesk API' };
    }
    return response;
  }
}
