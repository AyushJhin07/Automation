import { APIResponse, APICredentials, BaseAPIClient } from './BaseAPIClient';

export interface EgnyteCredentials extends APICredentials {
  domain: string;
  accessToken: string;
}

export interface UploadFileParams {
  path: string;
  fileName: string;
  fileContent: string; // base64 encoded
  lastModified?: string;
  overwrite?: boolean;
}

export interface DownloadFileParams {
  path: string;
}

export interface ListFolderParams {
  path: string;
  offset?: number;
  limit?: number;
  includeDeleted?: boolean;
}

export interface CreateFolderParams {
  path: string;
}

export interface DeleteFileParams {
  path: string;
}

export interface MoveCopyParams {
  from: string;
  to: string;
  overwrite?: boolean;
}

export interface CreateLinkParams {
  path: string;
  type?: 'file' | 'folder';
  accessibility?: 'anyone' | 'password' | 'domain' | 'recipients';
  recipients?: string[];
  password?: string;
  message?: string;
  notify?: boolean;
}

export interface SearchParams {
  query: string;
  scope?: 'name' | 'content';
  path?: string;
  offset?: number;
  limit?: number;
}

/**
 * Egnyte API client implementing file and link management workflows.
 */
export class EgnyteAPIClient extends BaseAPIClient {
  constructor(credentials: EgnyteCredentials) {
    super(EgnyteAPIClient.resolveBaseUrl(credentials), credentials);

    this.registerHandlers({
      test_connection: this.testConnection.bind(this) as any,
      upload_file: this.uploadFile.bind(this) as any,
      download_file: this.downloadFile.bind(this) as any,
      list_folder: this.listFolder.bind(this) as any,
      create_folder: this.createFolder.bind(this) as any,
      delete_file: this.deleteFile.bind(this) as any,
      move_file: this.moveFile.bind(this) as any,
      copy_file: this.copyFile.bind(this) as any,
      create_link: this.createLink.bind(this) as any,
      search: this.search.bind(this) as any,
    });
  }

  private static resolveBaseUrl(credentials: EgnyteCredentials): string {
    const domain = credentials.domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    return `https://${domain}/pubapi/v1`;
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.credentials.accessToken}`
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/user/info');
  }

  public async uploadFile(params: UploadFileParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['path', 'fileName', 'fileContent']);
    const query = this.buildQueryString({ filename: params.fileName, overwrite: params.overwrite });
    const headers: Record<string, string> = {
      'Content-Type': 'application/octet-stream',
    };
    if (params.lastModified) {
      headers['Last-Modified'] = params.lastModified;
    }
    const buffer = Buffer.from(params.fileContent, 'base64');
    return this.makeRequest(
      'POST',
      `/fs-content/${encodeURI(params.path)}${query}`,
      buffer,
      headers
    );
  }

  public async downloadFile(params: DownloadFileParams): Promise<APIResponse<ArrayBuffer>> {
    this.validateRequiredParams(params, ['path']);
    return this.makeRequest<ArrayBuffer>('GET', `/fs-content/${encodeURI(params.path)}`);
  }

  public async listFolder(params: ListFolderParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['path']);
    const query = this.buildQueryString({
      offset: params.offset,
      limit: params.limit,
      showDeleted: params.includeDeleted,
    });
    return this.get(`/fs/${encodeURI(params.path)}${query}`);
  }

  public async createFolder(params: CreateFolderParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['path']);
    return this.post(`/fs/${encodeURI(params.path)}`);
  }

  public async deleteFile(params: DeleteFileParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['path']);
    return this.delete(`/fs/${encodeURI(params.path)}`);
  }

  public async moveFile(params: MoveCopyParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['from', 'to']);
    return this.post('/fs/move', {
      source: params.from,
      destination: params.to,
      overwrite: params.overwrite ?? false,
    });
  }

  public async copyFile(params: MoveCopyParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['from', 'to']);
    return this.post('/fs/copy', {
      source: params.from,
      destination: params.to,
      overwrite: params.overwrite ?? false,
    });
  }

  public async createLink(params: CreateLinkParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['path']);
    const payload: Record<string, any> = {
      path: params.path,
      type: params.type ?? 'file',
      accessibility: params.accessibility ?? 'anyone',
    };
    if (params.recipients?.length) payload.recipients = params.recipients;
    if (params.password) payload.password = params.password;
    if (params.message) payload.message = params.message;
    if (params.notify !== undefined) payload.notify = params.notify;
    return this.post('/links', payload);
  }

  public async search(params: SearchParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['query']);
    const query = this.buildQueryString({
      query: params.query,
      scope: params.scope,
      path: params.path,
      offset: params.offset,
      limit: params.limit,
    });
    return this.get(`/search${query}`);
  }
}
