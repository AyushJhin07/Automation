import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

interface SharepointConfig {
  siteId?: string;
}

export class SharepointAPIClient extends BaseAPIClient {
  private config: SharepointConfig;

  constructor(credentials: APICredentials) {
    super('https://graph.microsoft.com/v1.0', credentials);
    this.config = {
      siteId: credentials.siteId || credentials.sharepointSiteId
    };
    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'list_sites': this.listSites.bind(this) as any,
      'list_lists': this.listLists.bind(this) as any,
      'create_list_item': this.createListItem.bind(this) as any,
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
    return this.get('/sites?search=sharepoint', this.getAuthHeaders());
  }

  public async listSites(): Promise<APIResponse<any>> {
    return this.get('/sites?search=*', this.getAuthHeaders());
  }

  public async listLists(params: { siteId?: string }): Promise<APIResponse<any>> {
    const siteId = params.siteId || this.config.siteId;
    if (!siteId) {
      return { success: false, error: 'siteId is required' };
    }
    return this.get(`/sites/${siteId}/lists`, this.getAuthHeaders());
  }

  public async createListItem(params: { siteId?: string; listId: string; fields: Record<string, any> }): Promise<APIResponse<any>> {
    const siteId = params.siteId || this.config.siteId;
    this.validateRequiredParams({ listId: params.listId, fields: params.fields } as any, ['listId', 'fields']);
    if (!siteId) {
      return { success: false, error: 'siteId is required' };
    }
    return this.post(`/sites/${siteId}/lists/${params.listId}/items`, {
      fields: params.fields
    }, this.getAuthHeaders());
  }
}

