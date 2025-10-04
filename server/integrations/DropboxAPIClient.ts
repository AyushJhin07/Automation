// DROPBOX API CLIENT (fixed)

import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

export class DropboxAPIClient extends BaseAPIClient {
  constructor(credentials: APICredentials) {
    super('https://api.dropboxapi.com/2', credentials);
    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'list_files': this.listFiles.bind(this) as any,
      'upload_file': this.uploadFile.bind(this) as any,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const token = this.credentials.accessToken || this.credentials.token || '';
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.post('/users/get_current_account', {});
  }

  public async listFiles(params: { path?: string; recursive?: boolean; limit?: number }): Promise<APIResponse<any>> {
    const body = {
      path: params.path ?? '',
      recursive: params.recursive ?? false,
      limit: params.limit ?? 1000,
      include_mounted_folders: true
    };
    return this.post('/files/list_folder', body);
  }

  public async uploadFile(params: { path: string; content: string; mode?: 'add' | 'overwrite' | 'update' }): Promise<APIResponse<any>> {
    const arg = { path: params.path, mode: params.mode ?? 'add', mute: false, strict_conflict: false };
    return this.makeRequest('POST', 'https://content.dropboxapi.com/2/files/upload', params.content, {
      'Content-Type': 'application/octet-stream',
      'Dropbox-API-Arg': JSON.stringify(arg),
    });
  }
}
