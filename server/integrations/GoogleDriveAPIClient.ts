import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

export class GoogleDriveAPIClient extends BaseAPIClient {
  constructor(credentials: APICredentials) {
    super('https://www.googleapis.com/drive/v3', credentials);
    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'list_files': this.listFiles.bind(this) as any,
      'list_folders': this.listFiles.bind(this) as any,
      'create_folder': this.createFolder.bind(this) as any,
      'create_file': this.uploadFile.bind(this) as any,
      'upload_file': this.uploadFile.bind(this) as any,
      'get_file': this.getItem.bind(this) as any,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const token = this.credentials.accessToken || this.credentials.token || '';
    return {
      Authorization: `Bearer ${token}`,
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/about?fields=user,storageQuota', this.getAuthHeaders());
  }

  public async listFiles(params: { pageSize?: number; q?: string; spaces?: string } = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString({
      pageSize: params.pageSize ?? 50,
      q: params.q,
      spaces: params.spaces ?? 'drive',
      fields: 'files(id,name,mimeType,modifiedTime,owners),nextPageToken'
    });
    return this.get(`/files${query}`, this.getAuthHeaders());
  }

  public async createFolder(params: { name: string; parentId?: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['name']);
    const body: Record<string, any> = {
      name: params.name,
      mimeType: 'application/vnd.google-apps.folder',
    };
    if (params.parentId) {
      body.parents = [params.parentId];
    }
    return this.post('/files', body, {
      ...this.getAuthHeaders(),
      'Content-Type': 'application/json'
    });
  }

  public async uploadFile(params: { name: string; mimeType?: string; content: string; parentId?: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['name', 'content']);
    const metadata: Record<string, any> = {
      name: params.name,
    };
    if (params.parentId) metadata.parents = [params.parentId];
    const boundary = 'drive_upload_boundary_' + Date.now();
    const bodyParts = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      JSON.stringify(metadata),
      `--${boundary}`,
      `Content-Type: ${params.mimeType || 'application/octet-stream'}`,
      '',
      params.content,
      `--${boundary}--`,
      ''
    ].join('\r\n');

    const resp = await fetch(`https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`, {
      method: 'POST',
      headers: {
        ...this.getAuthHeaders(),
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body: bodyParts
    });

    const data = await resp.json().catch(() => ({}));
    return resp.ok ? { success: true, data } : { success: false, error: data?.error?.message || `HTTP ${resp.status}` };
  }

  public async getItem(params: { fileId: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['fileId']);
    return this.get(`/files/${params.fileId}?fields=id,name,mimeType,modifiedTime,owners`, this.getAuthHeaders());
  }
}
