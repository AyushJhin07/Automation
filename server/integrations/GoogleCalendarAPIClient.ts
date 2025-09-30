import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

export class GoogleCalendarAPIClient extends BaseAPIClient {
  constructor(credentials: APICredentials) {
    super('https://www.googleapis.com/calendar/v3', credentials);
    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'list_calendars': this.listCalendars.bind(this) as any,
      'list_events': this.listEvents.bind(this) as any,
      'create_event': this.createEvent.bind(this) as any,
      'update_event': this.updateEvent.bind(this) as any,
      'delete_event': this.deleteEvent.bind(this) as any,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const token = this.credentials.accessToken || this.credentials.token || '';
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/users/me/calendarList', this.getAuthHeaders());
  }

  public async listCalendars(): Promise<APIResponse<any>> {
    return this.get('/users/me/calendarList', this.getAuthHeaders());
  }

  public async listEvents(params: { calendarId: string; maxResults?: number; timeMin?: string; timeMax?: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['calendarId']);
    const query = this.buildQueryString({
      maxResults: params.maxResults ?? 50,
      timeMin: params.timeMin,
      timeMax: params.timeMax,
      singleEvents: true,
      orderBy: 'startTime'
    });
    return this.get(`/calendars/${encodeURIComponent(params.calendarId)}/events${query}`, this.getAuthHeaders());
  }

  public async createEvent(params: { calendarId: string; summary: string; start: Record<string, any>; end: Record<string, any>; description?: string; attendees?: any[] }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['calendarId', 'summary', 'start', 'end']);
    return this.post(`/calendars/${encodeURIComponent(params.calendarId)}/events`, {
      summary: params.summary,
      description: params.description,
      start: params.start,
      end: params.end,
      attendees: params.attendees
    }, this.getAuthHeaders());
  }

  public async updateEvent(params: { calendarId: string; eventId: string; updates: Record<string, any> }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['calendarId', 'eventId', 'updates']);
    return this.patch(`/calendars/${encodeURIComponent(params.calendarId)}/events/${encodeURIComponent(params.eventId)}`, params.updates, this.getAuthHeaders());
  }

  public async deleteEvent(params: { calendarId: string; eventId: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['calendarId', 'eventId']);
    return this.delete(`/calendars/${encodeURIComponent(params.calendarId)}/events/${encodeURIComponent(params.eventId)}`, this.getAuthHeaders());
  }
}

