import { Buffer } from 'buffer';
import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

export class OnedriveAPIClient extends BaseAPIClient {
  constructor(credentials: APICredentials) {
    super('https://graph.microsoft.com/v1.0', credentials);
    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'list_driveroot': this.listDriveRoot.bind(this) as any,
      'get_files': this.listDriveRoot.bind(this) as any,
      'create_folder': this.createFolder.bind(this) as any,
      'get_item': this.getItem.bind(this) as any,
      'download_file': this.downloadFile.bind(this) as any,
      'share_file': this.shareFile.bind(this) as any,
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
    return this.get('/me/drive', this.getAuthHeaders());
  }

  public async listDriveRoot(params: { path?: string } = {}): Promise<APIResponse<any>> {
    const path = params.path ? `/root:/${params.path}:/children` : '/root/children';
    return this.get(`/me/drive${path}`, this.getAuthHeaders());
  }

  public async createFolder(params: { parentItemId?: string; name: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['name']);
    const body = {
      name: params.name,
      folder: {},
      '@microsoft.graph.conflictBehavior': 'rename'
    };
    const target = params.parentItemId
      ? `/me/drive/items/${params.parentItemId}/children`
      : '/me/drive/root/children';
    return this.post(target, body, this.getAuthHeaders());
  }

  public async getItem(params: { itemId: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['itemId']);
    return this.get(`/me/drive/items/${params.itemId}`, this.getAuthHeaders());
  }

  public async downloadFile(params: { itemId: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['itemId']);
    const resp = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${params.itemId}/content`, {
      headers: this.getAuthHeaders()
    });
    const data = await resp.text();
    return resp.ok ? { success: true, data } : { success: false, error: `HTTP ${resp.status}` };
  }

  public async shareFile(params: { itemId: string; type?: string; scope?: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['itemId']);
    return this.post(`/me/drive/items/${params.itemId}/createLink`, {
      type: params.type || 'view',
      scope: params.scope || 'anonymous'
    }, this.getAuthHeaders());
  }
}
