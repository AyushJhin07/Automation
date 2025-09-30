import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

export class JiraServiceManagementAPIClient extends BaseAPIClient {
  private baseUrl: string;

  constructor(credentials: APICredentials) {
    const site = credentials.baseUrl || credentials.instanceUrl;
    if (!site) {
      throw new Error('Jira Service Management integration requires baseUrl');
    }
    const restBase = site.replace(/\/$/, '') + '/rest/servicedeskapi';
    super(restBase, credentials);
    this.baseUrl = restBase;

    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'list_service_desks': this.listServiceDesks.bind(this) as any,
      'get_service_desks': this.listServiceDesks.bind(this) as any,
      'create_request': this.createRequest.bind(this) as any,
      'create_customer_request': this.createRequest.bind(this) as any,
      'add_comment': this.addComment.bind(this) as any,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    if (this.credentials.accessToken) {
      return {
        Authorization: `Bearer ${this.credentials.accessToken}`,
        'Content-Type': 'application/json'
      };
    }
    if (this.credentials.username && this.credentials.apiToken) {
      const basic = Buffer.from(`${this.credentials.username}:${this.credentials.apiToken}`).toString('base64');
      return {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/json'
      };
    }
    throw new Error('Jira Service Management integration requires accessToken or username/apiToken');
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/servicedesk', this.getAuthHeaders());
  }

  public async listServiceDesks(): Promise<APIResponse<any>> {
    return this.get('/servicedesk', this.getAuthHeaders());
  }

  public async createRequest(params: { serviceDeskId: string; requestTypeId: string; requestFieldValues: Record<string, any>; raiseOnBehalfOf?: string; summary?: string; description?: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['serviceDeskId', 'requestTypeId', 'requestFieldValues']);
    return this.post('/request', params, this.getAuthHeaders());
  }

  public async addComment(params: { requestIdOrKey: string; body: string; public?: boolean }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['requestIdOrKey', 'body']);
    return this.post(`/request/${params.requestIdOrKey}/comment`, {
      body: params.body,
      public: params.public ?? true
    }, this.getAuthHeaders());
  }
}
