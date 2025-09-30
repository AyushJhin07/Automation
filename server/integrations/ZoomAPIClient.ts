import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

export class ZoomAPIClient extends BaseAPIClient {
  constructor(credentials: APICredentials) {
    super('https://api.zoom.us/v2', credentials);
    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'create_meeting': this.createMeeting.bind(this) as any,
      'list_meetings': this.listMeetings.bind(this) as any,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const token = this.credentials.accessToken || this.credentials.jwtToken || '';
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/users/me', this.getAuthHeaders());
  }

  public async createMeeting(params: { topic: string; startTime: string; duration?: number; type?: number }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['topic', 'startTime']);
    return this.post('/users/me/meetings', {
      topic: params.topic,
      start_time: params.startTime,
      duration: params.duration,
      type: params.type || 2
    }, this.getAuthHeaders());
  }

  public async listMeetings(params: { type?: string } = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString({ type: params.type || 'scheduled' });
    return this.get(`/users/me/meetings${query}`, this.getAuthHeaders());
  }
}

