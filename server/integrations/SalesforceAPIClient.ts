import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

export class SalesforceAPIClient extends BaseAPIClient {
  private instanceUrl: string;

  constructor(credentials: APICredentials) {
    const instanceUrl = credentials.instanceUrl || credentials.baseUrl;
    const accessToken = credentials.accessToken;
    if (!instanceUrl || !accessToken) {
      throw new Error('Salesforce integration requires instanceUrl and accessToken');
    }
    const base = instanceUrl.replace(/\/$/, '') + '/services/data/v60.0';
    super(base, credentials);
    this.instanceUrl = instanceUrl.replace(/\/$/, '');

    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'create_sobject': this.createSObject.bind(this) as any,
      'update_sobject': this.updateSObject.bind(this) as any,
      'query': this.query.bind(this) as any,
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
    return this.get('/sobjects', this.getAuthHeaders());
  }

  public async createSObject(params: { object: string; data: Record<string, any> }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['object', 'data']);
    return this.post(`/sobjects/${params.object}`, params.data, this.getAuthHeaders());
  }

  public async updateSObject(params: { object: string; id: string; data: Record<string, any> }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['object', 'id', 'data']);
    return this.patch(`/sobjects/${params.object}/${params.id}`, params.data, this.getAuthHeaders());
  }

  public async query(params: { soql: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['soql']);
    const query = this.buildQueryString({ q: params.soql });
    return this.get(`/query${query}`, this.getAuthHeaders());
  }
}

