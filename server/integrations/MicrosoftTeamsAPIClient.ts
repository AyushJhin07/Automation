import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

export class MicrosoftTeamsAPIClient extends BaseAPIClient {
  constructor(credentials: APICredentials) {
    super('https://graph.microsoft.com/v1.0', credentials);
    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'list_teams': this.listTeams.bind(this) as any,
      'list_channels': this.listChannels.bind(this) as any,
      'send_channel_message': this.sendChannelMessage.bind(this) as any,
      'send_message': this.sendChannelMessage.bind(this) as any,
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

  public async listTeams(): Promise<APIResponse<any>> {
    return this.get('/me/joinedTeams', this.getAuthHeaders());
  }

  public async listChannels(params: { teamId: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['teamId']);
    return this.get(`/teams/${params.teamId}/channels`, this.getAuthHeaders());
  }

  public async sendChannelMessage(params: { teamId: string; channelId: string; message: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['teamId', 'channelId', 'message']);
    return this.post(`/teams/${params.teamId}/channels/${params.channelId}/messages`, {
      body: {
        contentType: 'html',
        content: params.message
      }
    }, this.getAuthHeaders());
  }
}
