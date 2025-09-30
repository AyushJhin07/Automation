import { Buffer } from 'buffer';
import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

export class ServicenowAPIClient extends BaseAPIClient {
  private instanceUrl: string;

  constructor(credentials: APICredentials) {
    const instanceUrl = credentials.instanceUrl || credentials.baseUrl;
    const user = credentials.username;
    const password = credentials.password;
    const token = credentials.accessToken;
    if (!instanceUrl) {
      throw new Error('ServiceNow integration requires instanceUrl');
    }
    super(instanceUrl.replace(/\/$/, '') + '/api/now', credentials);
    this.instanceUrl = instanceUrl.replace(/\/$/, '');

    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'create_incident': this.createIncident.bind(this) as any,
      'update_incident': this.updateIncident.bind(this) as any,
      'list_incidents': this.listIncidents.bind(this) as any,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.credentials.accessToken) {
      headers.Authorization = `Bearer ${this.credentials.accessToken}`;
    } else if (this.credentials.username && this.credentials.password) {
      const b64 = Buffer.from(`${this.credentials.username}:${this.credentials.password}`).toString('base64');
      headers.Authorization = `Basic ${b64}`;
    }
    return headers;
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/table/incident?sysparm_limit=1', this.getAuthHeaders());
  }

  public async createIncident(params: { shortDescription: string; description?: string; urgency?: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['shortDescription']);
    return this.post('/table/incident', {
      short_description: params.shortDescription,
      description: params.description,
      urgency: params.urgency
    }, this.getAuthHeaders());
  }

  public async updateIncident(params: { sysId: string; updates: Record<string, any> }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['sysId', 'updates']);
    return this.patch(`/table/incident/${params.sysId}`, params.updates, this.getAuthHeaders());
  }

  public async listIncidents(params: { limit?: number } = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString({ sysparm_limit: params.limit ?? 25 });
    return this.get(`/table/incident${query}`, this.getAuthHeaders());
  }
}
