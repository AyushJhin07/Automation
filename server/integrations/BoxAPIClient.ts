import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

export class BoxAPIClient extends BaseAPIClient {
  constructor(credentials: APICredentials) {
    super('https://api.box.com/2.0', credentials);
    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'list_folders': this.listFolders.bind(this) as any,
      'create_folder': this.createFolder.bind(this) as any,
      'get_item': this.getItem.bind(this) as any,
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
    return this.get('/users/me', this.getAuthHeaders());
  }

  public async listFolders(params: { parentId?: string } = {}): Promise<APIResponse<any>> {
    const parentId = params.parentId || '0';
    return this.get(`/folders/${parentId}/items`, this.getAuthHeaders());
  }

  public async createFolder(params: { name: string; parentId?: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['name']);
    const body = {
      name: params.name,
      parent: {
        id: params.parentId || '0'
      }
    };
    return this.post('/folders', body, this.getAuthHeaders());
  }

  public async getItem(params: { itemId: string; type?: 'file' | 'folder' }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['itemId']);
    const type = params.type || 'file';
    return this.get(`/${type}s/${params.itemId}`, this.getAuthHeaders());
  }
}

