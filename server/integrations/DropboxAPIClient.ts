import { BaseAPIClient, APICredentials, APIResponse } from './BaseAPIClient';

export interface DropboxCredentials extends APICredentials {
  accessToken: string;
}

interface ListFolderParams {
  path?: string;
  recursive?: boolean;
  limit?: number;
  includeDeleted?: boolean;
}

interface MoveCopyParams {
  from_path: string;
  to_path: string;
  autorename?: boolean;
}

interface DeleteParams {
  path: string;
}

interface GetMetadataParams extends DeleteParams {
  include_media_info?: boolean;
  include_deleted?: boolean;
  include_has_explicit_shared_members?: boolean;
}

interface SearchParams {
  query: string;
  options?: Record<string, any>;
}

interface SharedLinkParams {
  path: string;
  settings?: Record<string, any>;
}

interface PollFolderParams {
  path?: string;
  recursive?: boolean;
  limit?: number;
  includeDeleted?: boolean;
}

/**
 * Production-ready Dropbox API client that wraps the official v2 HTTP endpoints used by our
 * declarative connector manifest. All methods return the unified APIResponse shape so the
 * IntegrationManager can dispatch actions and polling triggers without any additional glue code.
 */
export class DropboxAPIClient extends BaseAPIClient {
  constructor(credentials: DropboxCredentials) {
    if (!credentials?.accessToken) {
      throw new Error('Dropbox integration requires an access token');
    }

    super('https://api.dropboxapi.com/2', credentials);
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.credentials.accessToken}`,
      'Content-Type': 'application/json'
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.post('/users/get_current_account', {});
  }

  public async listFolder(params: ListFolderParams): Promise<APIResponse<any>> {
    return this.post('/files/list_folder', this.cleanObject({
      path: params.path ?? '',
      recursive: params.recursive ?? false,
      limit: params.limit,
      include_deleted: params.includeDeleted ?? false
    }));
  }

  public async createFolder(params: { path: string; autorename?: boolean }): Promise<APIResponse<any>> {
    return this.post('/files/create_folder_v2', this.cleanObject({
      path: params.path,
      autorename: params.autorename ?? false
    }));
  }

  public async delete(params: DeleteParams): Promise<APIResponse<any>> {
    return this.post('/files/delete_v2', this.cleanObject(params));
  }

  public async move(params: MoveCopyParams): Promise<APIResponse<any>> {
    return this.post('/files/move_v2', this.cleanObject({
      from_path: params.from_path,
      to_path: params.to_path,
      autorename: params.autorename ?? false
    }));
  }

  public async copy(params: MoveCopyParams): Promise<APIResponse<any>> {
    return this.post('/files/copy_v2', this.cleanObject({
      from_path: params.from_path,
      to_path: params.to_path,
      autorename: params.autorename ?? false
    }));
  }

  public async getMetadata(params: GetMetadataParams): Promise<APIResponse<any>> {
    return this.post('/files/get_metadata', this.cleanObject(params));
  }

  public async search(params: SearchParams): Promise<APIResponse<any>> {
    return this.post('/files/search_v2', this.cleanObject({
      query: params.query,
      options: params.options
    }));
  }

  public async createSharedLink(params: SharedLinkParams): Promise<APIResponse<any>> {
    return this.post('/sharing/create_shared_link_with_settings', this.cleanObject(params));
  }

  public async fileUploaded(params: PollFolderParams): Promise<APIResponse<any>> {
    const response = await this.listFolder(params);
    if (!response.success) {
      return response;
    }

    const entries = Array.isArray(response.data?.entries) ? response.data.entries : [];
    const uploaded = entries.filter((item: any) => item['.tag'] !== 'deleted');
    return { success: true, data: uploaded };
  }

  public async fileDeleted(params: PollFolderParams): Promise<APIResponse<any>> {
    const response = await this.listFolder({ ...params, includeDeleted: true });
    if (!response.success) {
      return response;
    }

    const entries = Array.isArray(response.data?.entries) ? response.data.entries : [];
    const deleted = entries.filter((item: any) => item['.tag'] === 'deleted');
    return { success: true, data: deleted };
  }

  private cleanObject<T extends Record<string, any>>(input: T): T {
    return Object.fromEntries(
      Object.entries(input).filter(([, value]) => value !== undefined && value !== null)
    ) as T;
  }
}
