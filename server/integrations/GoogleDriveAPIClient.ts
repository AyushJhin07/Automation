import { Buffer } from 'node:buffer';

import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

type ListFilesParams = {
  folderId?: string;
  query?: string;
  maxResults?: number;
  orderBy?: string;
  fields?: string;
  mimeType?: string;
  pageToken?: string;
};

type CreateFileParams = {
  name: string;
  mimeType: string;
  folderId?: string;
  parentId?: string;
  parentFolderId?: string;
  contentBase64?: string;
};

type UploadFileParams = {
  name: string;
  folderId?: string;
  parentId?: string;
  parentFolderId?: string;
  content: string;
  mimeType?: string;
};

type MoveFileParams = {
  fileId: string;
  newParentId: string;
  removeParents?: string;
};

type ShareFileParams = {
  fileId: string;
  emailAddress?: string;
  role?: 'reader' | 'writer' | 'commenter' | 'owner';
  type?: 'user' | 'group' | 'domain' | 'anyone';
  sendNotificationEmail?: boolean;
};

type UpdateFileMetadataParams = {
  fileId: string;
  name?: string;
  description?: string;
};

type UpdatePermissionParams = {
  fileId: string;
  permissionId: string;
  role: 'reader' | 'writer' | 'commenter' | 'owner';
};

type DownloadFileParams = {
  fileId: string;
  format?: string;
};

type CopyFileParams = {
  fileId: string;
  name?: string;
  parentFolderId?: string;
  parentId?: string;
};

type DeletePermissionParams = {
  fileId: string;
  permissionId: string;
};

type GetFileParams = {
  fileId: string;
  fields?: string;
};

type GetFilePermissionsParams = {
  fileId: string;
};

export class GoogleDriveAPIClient extends BaseAPIClient {
  private static readonly GOOGLE_WORKSPACE_PREFIX = 'application/vnd.google-apps.';
  private static readonly BASE_FILE_FIELDS = [
    'id',
    'name',
    'mimeType',
    'parents',
    'webViewLink',
    'webContentLink',
    'iconLink',
    'createdTime',
    'modifiedTime',
    'owners(displayName,emailAddress)',
  ];
  private static readonly PERMISSION_FIELDS =
    'permissions(id,type,role,emailAddress,allowFileDiscovery,domain,displayName)';

  private static readonly EXPORT_FORMATS: Record<string, { mimeType: string; extension?: string }> = {
    pdf: { mimeType: 'application/pdf', extension: 'pdf' },
    docx: {
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      extension: 'docx',
    },
    xlsx: {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      extension: 'xlsx',
    },
    pptx: {
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      extension: 'pptx',
    },
    txt: { mimeType: 'text/plain', extension: 'txt' },
    html: { mimeType: 'text/html', extension: 'html' },
    odt: { mimeType: 'application/vnd.oasis.opendocument.text', extension: 'odt' },
  };

  private static readonly DEFAULT_EXPORTS: Record<string, { mimeType: string; extension?: string }> = {
    'application/vnd.google-apps.document': GoogleDriveAPIClient.EXPORT_FORMATS.docx,
    'application/vnd.google-apps.spreadsheet': GoogleDriveAPIClient.EXPORT_FORMATS.xlsx,
    'application/vnd.google-apps.presentation': GoogleDriveAPIClient.EXPORT_FORMATS.pptx,
  };

  constructor(credentials: APICredentials) {
    super('https://www.googleapis.com/drive/v3', credentials);
    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'list_files': this.listFiles.bind(this) as any,
      'list_folders': this.listFolders.bind(this) as any,
      'create_folder': this.createFolder.bind(this) as any,
      'create_file': this.createFile.bind(this) as any,
      'upload_file': this.uploadFile.bind(this) as any,
      'copy_file': this.copyFile.bind(this) as any,
      'delete_file': this.deleteFile.bind(this) as any,
      'delete_permission': this.deletePermission.bind(this) as any,
      'download_file': this.downloadFile.bind(this) as any,
      'get_file': this.getFile.bind(this) as any,
      'get_file_permissions': this.getFilePermissions.bind(this) as any,
      'move_file': this.moveFile.bind(this) as any,
      'share_file': this.shareFile.bind(this) as any,
      'update_file_metadata': this.updateFileMetadata.bind(this) as any,
      'update_permission': this.updatePermission.bind(this) as any,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const token = this.credentials.accessToken || this.credentials.token || '';
    return {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    const query = this.buildDriveQuery({ fields: 'user,storageQuota' }, { supportsAllDrives: false });
    return this.get(`/about${query}`, this.getAuthHeaders());
  }

  public async listFiles(params: ListFilesParams = {}): Promise<APIResponse<{ files: any[]; nextPageToken?: string | null }>> {
    const queryParts: string[] = ['trashed = false'];

    if (params.folderId) {
      queryParts.push(`'${this.escapeQueryValue(params.folderId)}' in parents`);
    }

    if (params.mimeType) {
      queryParts.push(`mimeType = '${this.escapeQueryValue(params.mimeType)}'`);
    }

    if (params.query) {
      const trimmed = params.query.trim();
      if (trimmed) {
        queryParts.push(`(${trimmed})`);
      }
    }

    const searchParams = new URLSearchParams();
    searchParams.set('pageSize', String(Math.max(1, Math.min(params.maxResults ?? 100, 1000))));
    searchParams.set('fields', this.buildListFields(this.parseFieldList(params.fields)));
    searchParams.set('supportsAllDrives', 'true');
    searchParams.set('includeItemsFromAllDrives', 'true');

    if (params.orderBy) {
      searchParams.set('orderBy', params.orderBy);
    }

    if (params.pageToken) {
      searchParams.set('pageToken', params.pageToken);
    }

    const query = queryParts.filter(Boolean).join(' and ');
    if (query) {
      searchParams.set('q', query);
    }

    const response = await this.get(`/files?${searchParams.toString()}`, this.getAuthHeaders());
    if (!response.success || !response.data) {
      return response as APIResponse<{ files: any[]; nextPageToken?: string | null }>;
    }

    const files = Array.isArray(response.data.files) ? response.data.files : [];
    return {
      success: true,
      data: {
        files,
        nextPageToken: response.data.nextPageToken ?? null,
      },
      statusCode: response.statusCode,
      headers: response.headers,
    };
  }

  private async listFolders(params: ListFilesParams = {}): Promise<APIResponse<{ files: any[]; nextPageToken?: string | null }>> {
    const { mimeType, ...rest } = params;
    return this.listFiles({ ...rest, mimeType: 'application/vnd.google-apps.folder' });
  }

  public async createFolder(params: { name: string; parentId?: string; parentFolderId?: string }): Promise<APIResponse<{ file: any }>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['name']);
    const parentId = params.parentFolderId ?? params.parentId;
    const body: Record<string, any> = {
      name: params.name,
      mimeType: 'application/vnd.google-apps.folder',
    };

    if (parentId) {
      body.parents = [parentId];
    }

    const query = this.buildDriveQuery({ fields: this.buildFileFields() });
    const response = await this.post(`/files${query}`, body, this.getAuthHeaders());
    if (!response.success) {
      return response as APIResponse<{ file: any }>;
    }

    return {
      success: true,
      data: { file: response.data },
      statusCode: response.statusCode,
      headers: response.headers,
    };
  }

  public async createFile(params: CreateFileParams): Promise<APIResponse<{ file: any }>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['name', 'mimeType']);
    const parentId = params.folderId ?? params.parentId ?? params.parentFolderId;

    if (params.contentBase64 && this.isGoogleWorkspaceMime(params.mimeType)) {
      throw new Error('contentBase64 is not supported for Google Workspace file types.');
    }

    const metadata: Record<string, any> = {
      name: params.name,
      mimeType: params.mimeType,
    };

    if (parentId) {
      metadata.parents = [parentId];
    }

    if (params.contentBase64) {
      const buffer = this.decodeBase64(params.contentBase64, 'contentBase64');
      return this.uploadMultipart(metadata, buffer, params.mimeType);
    }

    const query = this.buildDriveQuery({ fields: this.buildFileFields(['description', 'size', 'md5Checksum']) });
    const response = await this.post(`/files${query}`, metadata, this.getAuthHeaders());
    if (!response.success) {
      return response as APIResponse<{ file: any }>;
    }

    return {
      success: true,
      data: { file: response.data },
      statusCode: response.statusCode,
      headers: response.headers,
    };
  }

  public async uploadFile(params: UploadFileParams): Promise<APIResponse<{ file: any }>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['name', 'content']);
    const parentId = params.folderId ?? params.parentId ?? params.parentFolderId;
    const mimeType = params.mimeType && params.mimeType.trim().length > 0
      ? params.mimeType
      : 'application/octet-stream';

    if (this.isGoogleWorkspaceMime(mimeType)) {
      throw new Error('Google Workspace MIME types require create_file without binary content.');
    }

    const metadata: Record<string, any> = {
      name: params.name,
      mimeType,
    };

    if (parentId) {
      metadata.parents = [parentId];
    }

    const buffer = this.decodeBase64(params.content, 'content');
    return this.uploadMultipart(metadata, buffer, mimeType);
  }

  public async copyFile(params: CopyFileParams): Promise<APIResponse<{ file: any }>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['fileId']);
    const payload: Record<string, any> = {};
    if (params.name) {
      payload.name = params.name;
    }
    const parentId = params.parentFolderId ?? params.parentId;
    if (parentId) {
      payload.parents = [parentId];
    }

    const query = this.buildDriveQuery({ fields: this.buildFileFields(['description', 'size', 'md5Checksum']) });
    const response = await this.post(`/files/${encodeURIComponent(params.fileId)}/copy${query}`, payload, this.getAuthHeaders());
    if (!response.success) {
      return response as APIResponse<{ file: any }>;
    }

    return {
      success: true,
      data: { file: response.data },
      statusCode: response.statusCode,
      headers: response.headers,
    };
  }

  public async deleteFile(params: { fileId: string }): Promise<APIResponse<{ fileId: string }>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['fileId']);
    const query = this.buildDriveQuery({}, { includeItemsFromAllDrives: false });
    const response = await this.delete(`/files/${encodeURIComponent(params.fileId)}${query}`, this.getAuthHeaders());
    if (!response.success) {
      return response as APIResponse<{ fileId: string }>;
    }

    return {
      success: true,
      data: { fileId: params.fileId },
      statusCode: response.statusCode,
      headers: response.headers,
    };
  }

  public async deletePermission(params: DeletePermissionParams): Promise<APIResponse<{ fileId: string; permissionId: string }>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['fileId', 'permissionId']);
    const query = this.buildDriveQuery({}, { includeItemsFromAllDrives: false });
    const response = await this.delete(
      `/files/${encodeURIComponent(params.fileId)}/permissions/${encodeURIComponent(params.permissionId)}${query}`,
      this.getAuthHeaders(),
    );

    if (!response.success) {
      return response as APIResponse<{ fileId: string; permissionId: string }>;
    }

    return {
      success: true,
      data: { fileId: params.fileId, permissionId: params.permissionId },
      statusCode: response.statusCode,
      headers: response.headers,
    };
  }

  public async downloadFile(params: DownloadFileParams): Promise<APIResponse<{ fileId: string; name: string; mimeType: string; size: number; content: string }>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['fileId']);

    const metadata = await this.fetchFile(
      params.fileId,
      this.buildFileFields(['description', 'size', 'md5Checksum', 'lastModifyingUser(displayName,emailAddress)'])
    );

    if (!metadata) {
      return { success: false, error: 'File not found', statusCode: 404 };
    }

    const exportFormat = this.resolveExportFormat(params.format, metadata.mimeType);
    if (params.format && !this.isGoogleWorkspaceMime(metadata.mimeType)) {
      return { success: false, error: `Format export is only supported for Google Workspace files`, statusCode: 400 };
    }

    const endpoint = this.isGoogleWorkspaceMime(metadata.mimeType)
      ? `/files/${encodeURIComponent(params.fileId)}/export${this.buildDriveQuery({ mimeType: exportFormat.mimeType }, { supportsAllDrives: true })}`
      : `/files/${encodeURIComponent(params.fileId)}${this.buildDriveQuery({ alt: 'media' }, { supportsAllDrives: true })}`;

    const response = await this.get<ArrayBuffer>(endpoint, { ...this.getAuthHeaders(), Accept: '*/*' }, { responseType: 'arrayBuffer' });
    if (!response.success || !response.data) {
      return response as APIResponse<{ fileId: string; name: string; mimeType: string; size: number; content: string }>;
    }

    const buffer = Buffer.from(new Uint8Array(response.data));
    const content = buffer.toString('base64');
    const name = metadata.name || params.fileId;

    return {
      success: true,
      data: {
        fileId: params.fileId,
        name,
        mimeType: exportFormat.mimeType || metadata.mimeType,
        size: buffer.length,
        content,
      },
      statusCode: response.statusCode,
      headers: response.headers,
    };
  }

  public async getFile(params: GetFileParams): Promise<APIResponse<{ file: any }>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['fileId']);
    const fields = params.fields
      ? params.fields
      : this.buildFileFields(['description', 'size', 'md5Checksum', 'permissions', 'lastModifyingUser(displayName,emailAddress)']);

    const file = await this.fetchFile(params.fileId, fields);
    if (!file) {
      return { success: false, error: 'File not found', statusCode: 404 };
    }

    return {
      success: true,
      data: { file },
    };
  }

  public async getFilePermissions(params: GetFilePermissionsParams): Promise<APIResponse<{ fileId: string; permissions: any[] }>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['fileId']);
    const query = this.buildDriveQuery({ fields: GoogleDriveAPIClient.PERMISSION_FIELDS }, { supportsAllDrives: true });
    const response = await this.get(`/files/${encodeURIComponent(params.fileId)}/permissions${query}`, this.getAuthHeaders());
    if (!response.success || !response.data) {
      return response as APIResponse<{ fileId: string; permissions: any[] }>;
    }

    const permissions = Array.isArray(response.data.permissions) ? response.data.permissions : [];
    return {
      success: true,
      data: { fileId: params.fileId, permissions },
      statusCode: response.statusCode,
      headers: response.headers,
    };
  }

  public async moveFile(params: MoveFileParams): Promise<APIResponse<{ file: any }>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['fileId', 'newParentId']);
    const query = this.buildDriveQuery(
      {
        addParents: params.newParentId,
        removeParents: params.removeParents,
        fields: this.buildFileFields(['description', 'size', 'md5Checksum']),
      },
      { supportsAllDrives: true }
    );

    const response = await this.patch(`/files/${encodeURIComponent(params.fileId)}${query}`, {}, this.getAuthHeaders());
    if (!response.success) {
      return response as APIResponse<{ file: any }>;
    }

    return {
      success: true,
      data: { file: response.data },
      statusCode: response.statusCode,
      headers: response.headers,
    };
  }

  public async shareFile(params: ShareFileParams): Promise<APIResponse<{ fileId: string; permission: any }>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['fileId']);

    const body: Record<string, any> = {
      role: params.role ?? 'reader',
      type: params.type ?? (params.emailAddress ? 'user' : 'anyone'),
    };

    if (params.emailAddress) {
      body.emailAddress = params.emailAddress;
    }

    const query = this.buildDriveQuery(
      {
        sendNotificationEmail: params.sendNotificationEmail ?? true,
        fields: 'id,type,role,emailAddress,allowFileDiscovery,domain,displayName',
      },
      { supportsAllDrives: true }
    );

    const response = await this.post(`/files/${encodeURIComponent(params.fileId)}/permissions${query}`, body, this.getAuthHeaders());
    if (!response.success) {
      return response as APIResponse<{ fileId: string; permission: any }>;
    }

    return {
      success: true,
      data: { fileId: params.fileId, permission: response.data },
      statusCode: response.statusCode,
      headers: response.headers,
    };
  }

  public async updateFileMetadata(params: UpdateFileMetadataParams): Promise<APIResponse<{ file: any }>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['fileId']);

    const payload: Record<string, any> = {};
    if (params.name) {
      payload.name = params.name;
    }
    if (params.description) {
      payload.description = params.description;
    }

    if (Object.keys(payload).length === 0) {
      throw new Error('At least one metadata field (name or description) must be provided.');
    }

    const query = this.buildDriveQuery({ fields: this.buildFileFields(['description', 'size', 'md5Checksum']) });
    const response = await this.patch(`/files/${encodeURIComponent(params.fileId)}${query}`, payload, this.getAuthHeaders());
    if (!response.success) {
      return response as APIResponse<{ file: any }>;
    }

    return {
      success: true,
      data: { file: response.data },
      statusCode: response.statusCode,
      headers: response.headers,
    };
  }

  public async updatePermission(params: UpdatePermissionParams): Promise<APIResponse<{ fileId: string; permission: any }>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['fileId', 'permissionId', 'role']);

    const query = this.buildDriveQuery(
      {
        transferOwnership: params.role === 'owner' ? 'true' : undefined,
        fields: 'id,type,role,emailAddress,allowFileDiscovery,domain,displayName',
      },
      { supportsAllDrives: true }
    );

    const response = await this.patch(
      `/files/${encodeURIComponent(params.fileId)}/permissions/${encodeURIComponent(params.permissionId)}${query}`,
      { role: params.role },
      this.getAuthHeaders(),
    );

    if (!response.success) {
      return response as APIResponse<{ fileId: string; permission: any }>;
    }

    return {
      success: true,
      data: { fileId: params.fileId, permission: response.data },
      statusCode: response.statusCode,
      headers: response.headers,
    };
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
        fields: this.buildListFields(['createdTime']),
      });
    } catch (error) {
      console.error('[GoogleDriveAPIClient] pollFileCreated failed:', error);
      return [];
    }
  }

  public async pollFileUpdated(params: { folderId?: string; fileId?: string; since?: string } = {}): Promise<any[]> {
    try {
      if (params.fileId) {
        const file = await this.fetchFile(
          params.fileId,
          this.buildFileFields(['createdTime', 'modifiedTime', 'lastModifyingUser(displayName,emailAddress)', 'permissions'])
        );
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
        fields: this.buildListFields(['modifiedTime', 'lastModifyingUser(displayName,emailAddress)']),
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
        fields: this.buildListFields(['createdTime', 'modifiedTime', 'permissions(emailAddress,role,type,allowFileDiscovery)']),
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
    params.set('fields', options.fields ?? this.buildListFields());
    params.set('supportsAllDrives', 'true');
    params.set('includeItemsFromAllDrives', 'true');

    if (options.orderBy) {
      params.set('orderBy', options.orderBy);
    }

    const query = options.queryParts.filter(part => typeof part === 'string' && part.trim().length > 0);
    if (query.length > 0) {
      params.set('q', query.join(' and '));
    }

    const response = await this.get(`/files?${params.toString()}`, this.getAuthHeaders());
    if (!response.success || !response.data) {
      throw new Error(response.error ?? 'Failed to fetch files');
    }

    return Array.isArray(response.data.files) ? response.data.files : [];
  }

  private async fetchFile(fileId: string, fields?: string): Promise<any | null> {
    const query = this.buildDriveQuery(
      {
        fields: fields ?? this.buildFileFields(['createdTime', 'modifiedTime', 'permissions', 'lastModifyingUser(displayName,emailAddress)']),
      },
      { supportsAllDrives: true }
    );

    const response = await this.get(`/files/${encodeURIComponent(fileId)}${query}`, this.getAuthHeaders());
    if (!response.success) {
      if (response.statusCode === 404) {
        return null;
      }
      throw new Error(response.error ?? 'Failed to fetch file');
    }

    return response.data;
  }

  private buildDriveQuery(
    params: Record<string, string | number | boolean | undefined>,
    options: { includeItemsFromAllDrives?: boolean; supportsAllDrives?: boolean } = {}
  ): string {
    const query: Record<string, string | number | boolean | undefined> = { ...params };
    if (options.supportsAllDrives !== false) {
      query.supportsAllDrives = true;
    }
    if (options.includeItemsFromAllDrives) {
      query.includeItemsFromAllDrives = true;
    }
    return this.buildQueryString(query);
  }

  private buildFileFields(additional: string[] = []): string {
    const fields = new Set([...GoogleDriveAPIClient.BASE_FILE_FIELDS, ...additional.filter(Boolean)]);
    return Array.from(fields).join(',');
  }

  private buildListFields(additional: string[] = []): string {
    const fileFields = this.buildFileFields(['modifiedTime', ...additional]);
    return `nextPageToken,files(${fileFields})`;
  }

  private parseFieldList(fields?: string): string[] {
    if (!fields) {
      return [];
    }
    return fields
      .split(',')
      .map(part => part.trim())
      .filter(Boolean);
  }

  private decodeBase64(value: string, field: string): Buffer {
    const normalized = value?.trim() ?? '';
    if (!normalized) {
      throw new Error(`${field} must be a non-empty base64 string.`);
    }

    try {
      const buffer = Buffer.from(normalized, 'base64');
      if (buffer.length === 0 && normalized !== '') {
        throw new Error('Invalid base64 payload.');
      }
      const reencoded = buffer.toString('base64').replace(/=+$/, '');
      const cleaned = normalized.replace(/\s+/g, '').replace(/=+$/, '');
      if (reencoded !== cleaned) {
        throw new Error('Invalid base64 payload.');
      }
      return buffer;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid base64 payload.';
      throw new Error(`${field} is not valid base64: ${message}`);
    }
  }

  private isGoogleWorkspaceMime(mimeType?: string | null): boolean {
    if (!mimeType) {
      return false;
    }
    return mimeType.startsWith(GoogleDriveAPIClient.GOOGLE_WORKSPACE_PREFIX);
  }

  private resolveExportFormat(format?: string, originalMimeType?: string | null): { mimeType: string; extension?: string } {
    if (format) {
      const key = format.trim().toLowerCase();
      const mapping = GoogleDriveAPIClient.EXPORT_FORMATS[key];
      if (!mapping) {
        throw new Error(`Unsupported export format: ${format}`);
      }
      return mapping;
    }

    if (originalMimeType && GoogleDriveAPIClient.DEFAULT_EXPORTS[originalMimeType]) {
      return GoogleDriveAPIClient.DEFAULT_EXPORTS[originalMimeType];
    }

    return { mimeType: originalMimeType || 'application/octet-stream' };
  }

  private async uploadMultipart(metadata: Record<string, any>, fileContent: Buffer, mimeType: string): Promise<APIResponse<{ file: any }>> {
    const boundary = `drive_upload_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const lineBreak = '\r\n';
    const preamble = Buffer.from(
      `--${boundary}${lineBreak}Content-Type: application/json; charset=UTF-8${lineBreak}${lineBreak}${JSON.stringify(metadata)}${lineBreak}`,
      'utf8'
    );
    const contentHeader = Buffer.from(
      `--${boundary}${lineBreak}Content-Type: ${mimeType}${lineBreak}${lineBreak}`,
      'utf8'
    );
    const closing = Buffer.from(`${lineBreak}--${boundary}--${lineBreak}`, 'utf8');
    const body = Buffer.concat([preamble, contentHeader, fileContent, closing]);

    const endpoint = `https://www.googleapis.com/upload/drive/v3/files${this.buildDriveQuery({ uploadType: 'multipart', fields: this.buildFileFields(['description', 'size', 'md5Checksum']) })}`;

    const response = await this.post(endpoint, body, {
      ...this.getAuthHeaders(),
      'Content-Type': `multipart/related; boundary=${boundary}`,
    });

    if (!response.success) {
      return response as APIResponse<{ file: any }>;
    }

    return {
      success: true,
      data: { file: response.data },
      statusCode: response.statusCode,
      headers: response.headers,
    };
  }

  private escapeQueryValue(value: string): string {
    return value.replace(/'/g, "\\'");
  }
}
