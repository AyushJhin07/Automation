import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

export class CalendlyAPIClient extends BaseAPIClient {
  constructor(credentials: APICredentials) {
    super('https://api.calendly.com', credentials);
    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'list_event_types': this.listEventTypes.bind(this) as any,
      'get_event_types': this.listEventTypes.bind(this) as any,
      'list_scheduled_events': this.listScheduledEvents.bind(this) as any,
      'get_scheduled_events': this.listScheduledEvents.bind(this) as any,
      'get_event_invitees': this.listInvitees.bind(this) as any,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const token = this.credentials.accessToken || this.credentials.apiKey || '';
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/users/me', this.getAuthHeaders());
  }

  public async listEventTypes(params: { organization?: string } = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString({ organization: params.organization });
    return this.get(`/event_types${query}`, this.getAuthHeaders());
  }

  public async listScheduledEvents(params: { user?: string; status?: string } = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString({ user: params.user, status: params.status });
    return this.get(`/scheduled_events${query}`, this.getAuthHeaders());
  }

  public async listInvitees(params: { eventUri: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['eventUri']);
    const query = this.buildQueryString({ event: params.eventUri });
    return this.get(`/scheduled_events/${encodeURIComponent(params.eventUri)}/invitees${query}`, this.getAuthHeaders());
  }
}
