import { BaseAPIClient, APICredentials, APIResponse } from './BaseAPIClient';

export interface GoogleDriveCredentials extends APICredentials {
  accessToken: string;
}

interface ListFilesParams {
  q?: string;
  pageSize?: number;
  pageToken?: string;
  orderBy?: string;
  fields?: string;
  spaces?: string;
}

interface FileIdParams {
  fileId: string;
  fields?: string;
}

interface CreateFolderParams {
  name: string;
  parents?: string[];
}

interface CopyFileParams {
  fileId: string;
  name?: string;
  parents?: string[];
}

/**
 * Google Drive REST client for the v3 API.
 */
export class GoogleDriveAPIClient extends BaseAPIClient {
  constructor(credentials: GoogleDriveCredentials) {
    if (!credentials?.accessToken) {
      throw new Error('Google Drive integration requires an OAuth access token');
    }

    super('https://www.googleapis.com/drive/v3', credentials);
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.credentials.accessToken}`
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/about?fields=user');
  }

  public async listFiles(params: ListFilesParams): Promise<APIResponse<any>> {
    const searchParams = new URLSearchParams();
    if (params.q) searchParams.set('q', params.q);
    if (params.pageSize) searchParams.set('pageSize', String(params.pageSize));
    if (params.pageToken) searchParams.set('pageToken', params.pageToken);
    if (params.orderBy) searchParams.set('orderBy', params.orderBy);
    if (params.fields) searchParams.set('fields', params.fields);
    if (params.spaces) searchParams.set('spaces', params.spaces);
    const qs = searchParams.toString();
    return this.get(`/files${qs ? `?${qs}` : ''}`);
  }

  public async getFile(params: FileIdParams): Promise<APIResponse<any>> {
    const searchParams = new URLSearchParams();
    if (params.fields) searchParams.set('fields', params.fields);
    const qs = searchParams.toString();
    return this.get(`/files/${encodeURIComponent(params.fileId)}${qs ? `?${qs}` : ''}`);
  }

  public async createFolder(params: CreateFolderParams): Promise<APIResponse<any>> {
    const payload = this.clean({
      name: params.name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: params.parents
    });
    return this.post('/files', payload);
  }

  public async copyFile(params: CopyFileParams): Promise<APIResponse<any>> {
    const payload = this.clean({
      name: params.name,
      parents: params.parents
    });
    return this.post(`/files/${encodeURIComponent(params.fileId)}/copy`, payload);
  }

  public async deleteFile(params: { fileId: string }): Promise<APIResponse<any>> {
    return this.delete(`/files/${encodeURIComponent(params.fileId)}`);
  }

  public async fileCreated(params: ListFilesParams): Promise<APIResponse<any>> {
    return this.listFiles(params);
  }

  private clean<T extends Record<string, any>>(value: T): T {
    return Object.fromEntries(
      Object.entries(value).filter(([, v]) => v !== undefined && v !== null)
    ) as T;
  }
}
