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

  public async pollFileCreated(params: { folderId?: string; mimeType?: string; since?: string } = {}): Promise<any[]> {
    try {
      const queryParts = ['trashed = false'];
      if (params.mimeType) {
        queryParts.push(`mimeType = '${this.escapeQueryValue(params.mimeType)}'`);
      }
      if (params.folderId) {
        queryParts.push(`'${this.escapeQueryValue(params.folderId)}' in parents`);
      }
      if (params.since) {
        queryParts.push(`createdTime > '${this.escapeQueryValue(params.since)}'`);
      }

      return await this.fetchFiles({
        queryParts,
        orderBy: 'createdTime desc',
      });
    } catch (error) {
      console.error('[GoogleDriveAPIClient] pollFileCreated failed:', error);
      return [];
    }
  }

  public async pollFileUpdated(params: { folderId?: string; fileId?: string; since?: string } = {}): Promise<any[]> {
    try {
      if (params.fileId) {
        const file = await this.fetchFile(params.fileId);
        if (!file) {
          return [];
        }

        if (params.since && file.modifiedTime) {
          const modifiedAt = new Date(file.modifiedTime).getTime();
          const since = new Date(params.since).getTime();
          if (!(Number.isFinite(modifiedAt) && modifiedAt > since)) {
            return [];
          }
        }

        return [file];
      }

      const queryParts = ['trashed = false'];
      if (params.folderId) {
        queryParts.push(`'${this.escapeQueryValue(params.folderId)}' in parents`);
      }
      if (params.since) {
        queryParts.push(`modifiedTime > '${this.escapeQueryValue(params.since)}'`);
      }

      return await this.fetchFiles({
        queryParts,
        orderBy: 'modifiedTime desc',
      });
    } catch (error) {
      console.error('[GoogleDriveAPIClient] pollFileUpdated failed:', error);
      return [];
    }
  }

  public async pollFileShared(params: { folderId?: string; since?: string } = {}): Promise<any[]> {
    try {
      const queryParts = ['sharedWithMe', 'trashed = false'];
      if (params.folderId) {
        queryParts.push(`'${this.escapeQueryValue(params.folderId)}' in parents`);
      }
      if (params.since) {
        queryParts.push(`modifiedTime > '${this.escapeQueryValue(params.since)}'`);
      }

      return await this.fetchFiles({
        queryParts,
        orderBy: 'modifiedTime desc',
        fields: 'files(id,name,mimeType,modifiedTime,createdTime,owners,permissions,webViewLink,shared)',
      });
    } catch (error) {
      console.error('[GoogleDriveAPIClient] pollFileShared failed:', error);
      return [];
    }
  }

  private async fetchFiles(options: {
    queryParts: string[];
    orderBy?: string;
    pageSize?: number;
    fields?: string;
  }): Promise<any[]> {
    const params = new URLSearchParams();
    params.set('pageSize', String(options.pageSize ?? 50));
    params.set(
      'fields',
      options.fields
        ?? 'files(id,name,mimeType,createdTime,modifiedTime,owners,webViewLink,shared)'
    );

    if (options.orderBy) {
      params.set('orderBy', options.orderBy);
    }

    const query = options.queryParts.filter(part => typeof part === 'string' && part.trim().length > 0);
    if (query.length > 0) {
      params.set('q', query.join(' and '));
    }

    const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error?.message ?? `HTTP ${response.status}`);
    }

    return Array.isArray(data.files) ? data.files : [];
  }

  private async fetchFile(fileId: string): Promise<any | null> {
    const params = new URLSearchParams({
      fields: 'id,name,mimeType,createdTime,modifiedTime,owners,permissions,webViewLink,shared',
    });

    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?${params.toString()}`, {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });

    if (response.status === 404) {
      return null;
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error?.message ?? `HTTP ${response.status}`);
    }

    return data;
  }

  private escapeQueryValue(value: string): string {
    return value.replace(/'/g, "\\'");
  }
}
