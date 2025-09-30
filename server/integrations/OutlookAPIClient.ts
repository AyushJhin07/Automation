import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

export class OutlookAPIClient extends BaseAPIClient {
  constructor(credentials: APICredentials) {
    super('https://graph.microsoft.com/v1.0', credentials);
    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'send_mail': this.sendMail.bind(this) as any,
      'send_email': this.sendMail.bind(this) as any,
      'list_messages': this.listMessages.bind(this) as any,
      'get_messages': this.listMessages.bind(this) as any,
      'create_event': this.createEvent.bind(this) as any,
      'create_calendar_event': this.createEvent.bind(this) as any,
      'get_calendar_events': this.getCalendarEvents.bind(this) as any,
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
    return this.get('/me', this.getAuthHeaders());
  }

  public async sendMail(params: { subject: string; body: string; to: string[] }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['subject', 'body', 'to']);
    return this.post('/me/sendMail', {
      message: {
        subject: params.subject,
        body: { contentType: 'HTML', content: params.body },
        toRecipients: params.to.map(email => ({ emailAddress: { address: email } }))
      }
    }, this.getAuthHeaders());
  }

  public async listMessages(params: { top?: number } = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString({ '$top': params.top });
    return this.get(`/me/messages${query}`, this.getAuthHeaders());
  }

  public async createEvent(params: { subject: string; start: Record<string, any>; end: Record<string, any>; attendees?: any[] }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['subject', 'start', 'end']);
    return this.post('/me/events', {
      subject: params.subject,
      start: params.start,
      end: params.end,
      attendees: params.attendees
    }, this.getAuthHeaders());
  }

  public async getCalendarEvents(params: { top?: number } = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString({ '$top': params.top });
    return this.get(`/me/events${query}`, this.getAuthHeaders());
  }
}
