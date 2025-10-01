import { BaseAPIClient, APICredentials, APIResponse } from './BaseAPIClient';

export interface GoogleCalendarCredentials extends APICredentials {
  accessToken: string;
}

interface CalendarListParams {
  minAccessRole?: string;
  showHidden?: boolean;
  maxResults?: number;
}

interface ListEventsParams {
  calendarId: string;
  timeMin?: string;
  timeMax?: string;
  singleEvents?: boolean;
  orderBy?: 'startTime' | 'updated';
  maxResults?: number;
  pageToken?: string;
}

interface EventMutationParams {
  calendarId: string;
  eventId?: string;
  requestBody: Record<string, any>;
}

/**
 * Lightweight Google Calendar client that relies on OAuth access tokens. Google APIs expect
 * bearer authentication and JSON payloads, which map directly to BaseAPIClient helpers.
 */
export class GoogleCalendarAPIClient extends BaseAPIClient {
  constructor(credentials: GoogleCalendarCredentials) {
    if (!credentials?.accessToken) {
      throw new Error('Google Calendar integration requires an OAuth access token');
    }

    super('https://www.googleapis.com/calendar/v3', credentials);
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.credentials.accessToken}`
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/users/me/calendarList');
  }

  public async listCalendars(params: CalendarListParams): Promise<APIResponse<any>> {
    const searchParams = new URLSearchParams();
    if (params.minAccessRole) searchParams.set('minAccessRole', params.minAccessRole);
    if (params.showHidden !== undefined) searchParams.set('showHidden', String(params.showHidden));
    if (params.maxResults) searchParams.set('maxResults', String(params.maxResults));
    const qs = searchParams.toString();
    return this.get(`/users/me/calendarList${qs ? `?${qs}` : ''}`);
  }

  public async listEvents(params: ListEventsParams): Promise<APIResponse<any>> {
    const searchParams = new URLSearchParams();
    searchParams.set('singleEvents', String(params.singleEvents ?? true));
    if (params.timeMin) searchParams.set('timeMin', params.timeMin);
    if (params.timeMax) searchParams.set('timeMax', params.timeMax);
    if (params.orderBy) searchParams.set('orderBy', params.orderBy);
    if (params.maxResults) searchParams.set('maxResults', String(params.maxResults));
    if (params.pageToken) searchParams.set('pageToken', params.pageToken);
    const qs = searchParams.toString();
    return this.get(`/calendars/${encodeURIComponent(params.calendarId)}/events${qs ? `?${qs}` : ''}`);
  }

  public async createEvent(params: EventMutationParams): Promise<APIResponse<any>> {
    return this.post(`/calendars/${encodeURIComponent(params.calendarId)}/events`, params.requestBody);
  }

  public async updateEvent(params: EventMutationParams & { sendUpdates?: 'all' | 'externalOnly' | 'none' }): Promise<APIResponse<any>> {
    if (!params.eventId) {
      throw new Error('updateEvent requires an eventId');
    }
    const searchParams = new URLSearchParams();
    if (params.sendUpdates) searchParams.set('sendUpdates', params.sendUpdates);
    const qs = searchParams.toString();
    return this.patch(`/calendars/${encodeURIComponent(params.calendarId)}/events/${encodeURIComponent(params.eventId)}${qs ? `?${qs}` : ''}`, params.requestBody);
  }

  public async deleteEvent(params: { calendarId: string; eventId: string; sendUpdates?: 'all' | 'externalOnly' | 'none' }): Promise<APIResponse<any>> {
    const searchParams = new URLSearchParams();
    if (params.sendUpdates) searchParams.set('sendUpdates', params.sendUpdates);
    const qs = searchParams.toString();
    return this.delete(`/calendars/${encodeURIComponent(params.calendarId)}/events/${encodeURIComponent(params.eventId)}${qs ? `?${qs}` : ''}`);
  }

  public async eventCreated(params: ListEventsParams): Promise<APIResponse<any>> {
    return this.listEvents(params);
  }
}
