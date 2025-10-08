import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

export class GoogleDocsAPIClient extends BaseAPIClient {
  constructor(credentials: APICredentials) {
    super('https://docs.googleapis.com/v1', credentials);
    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'create_document': this.createDocument.bind(this) as any,
      'get_document': this.getDocument.bind(this) as any,
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
    const resp = await fetch('https://docs.googleapis.com/$discovery/rest?version=v1');
    return resp.ok ? { success: true, data: await resp.json().catch(() => ({})) } : { success: false, error: `HTTP ${resp.status}` };
  }

  public async createDocument(params: { title: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['title']);
    return this.post('/documents', { title: params.title }, this.getAuthHeaders());
  }

  public async getDocument(params: { documentId: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['documentId']);
    return this.get(`/documents/${params.documentId}`, this.getAuthHeaders());
  }

  public async pollDocumentCreated(params: { folderId?: string; since?: string } = {}): Promise<any[]> {
    try {
      const queryParts = [
        `mimeType = '${this.escapeDriveQueryValue('application/vnd.google-apps.document')}'`,
        'trashed = false',
      ];

      if (params.folderId) {
        queryParts.push(`'${this.escapeDriveQueryValue(params.folderId)}' in parents`);
      }

      if (params.since) {
        queryParts.push(`createdTime > '${this.escapeDriveQueryValue(params.since)}'`);
      }

      return await this.fetchDriveFiles({
        queryParts,
        orderBy: 'createdTime desc',
      });
    } catch (error) {
      console.error('[GoogleDocsAPIClient] pollDocumentCreated failed:', error);
      return [];
    }
  }

  public async pollDocumentUpdated(params: { documentId?: string; since?: string } = {}): Promise<any[]> {
    try {
      if (params.documentId) {
        const document = await this.fetchDriveFile(params.documentId);
        if (!document) {
          return [];
        }

        if (params.since && document.modifiedTime) {
          const modifiedAt = new Date(document.modifiedTime).getTime();
          const since = new Date(params.since).getTime();
          if (!(Number.isFinite(modifiedAt) && modifiedAt > since)) {
            return [];
          }
        }

        return [document];
      }

      const queryParts = [
        `mimeType = '${this.escapeDriveQueryValue('application/vnd.google-apps.document')}'`,
        'trashed = false',
      ];

      if (params.since) {
        queryParts.push(`modifiedTime > '${this.escapeDriveQueryValue(params.since)}'`);
      }

      return await this.fetchDriveFiles({
        queryParts,
        orderBy: 'modifiedTime desc',
      });
    } catch (error) {
      console.error('[GoogleDocsAPIClient] pollDocumentUpdated failed:', error);
      return [];
    }
  }

  private async fetchDriveFiles(options: {
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
        ?? 'files(id,name,mimeType,createdTime,modifiedTime,owners,lastModifyingUser,webViewLink)'
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

  private async fetchDriveFile(fileId: string): Promise<any | null> {
    const params = new URLSearchParams({
      fields: 'id,name,mimeType,createdTime,modifiedTime,owners,lastModifyingUser,webViewLink',
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

  private escapeDriveQueryValue(value: string): string {
    return value.replace(/'/g, "\\'");
  }
}
