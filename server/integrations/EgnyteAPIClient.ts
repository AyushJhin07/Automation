import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

interface EgnyteCredentials extends APICredentials {
  accessToken?: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  tokenUrl?: string;
  expiresAt?: string | number;
  domain?: string;
  baseUrl?: string;
}

interface UploadFileParams {
  path: string;
  content: string;
  overwrite?: boolean;
}

interface PathParams {
  path: string;
}

interface MoveCopyParams {
  source: string;
  destination: string;
}

interface CreateLinkParams {
  path: string;
  type?: 'file' | 'folder';
  accessibility?: 'anyone' | 'password' | 'domain' | 'recipients';
  send_email?: boolean;
  notify?: boolean;
  recipients?: string[];
  message?: string;
  [key: string]: any;
}

interface SearchParams {
  query: string;
  offset?: number;
  count?: number;
  types?: string;
}

function resolveBaseUrl(credentials: EgnyteCredentials): string {
  if (credentials.baseUrl) {
    return credentials.baseUrl.replace(/\/$/, '');
  }
  const domain = credentials.domain?.replace(/^https?:\/\//, '').replace(/\/$/, '');
  if (!domain) {
    throw new Error('Egnyte integration requires either baseUrl or domain');
  }
  const host = domain.includes('.') ? domain : `${domain}.egnyte.com`;
  return `https://${host}/pubapi/v1`;
}

function normalizePath(path: string): string {
  if (!path.startsWith('/')) {
    return `/${path}`;
  }
  return path;
}

function parseExpiryTimestamp(raw?: string | number): number | undefined {
  if (typeof raw === 'number') {
    return raw;
  }
  if (typeof raw === 'string' && raw) {
    const parsed = Date.parse(raw);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

export class EgnyteAPIClient extends BaseAPIClient {
  private readonly tokenEndpoint: string;
  private refreshPromise?: Promise<void>;
  private readonly refreshSkewMs = 60_000;

  constructor(credentials: EgnyteCredentials) {
    super(resolveBaseUrl(credentials), credentials);
    this.tokenEndpoint = credentials.tokenUrl ?? this.buildTokenEndpoint(credentials);

    this.registerAliasHandlers({
      test_connection: 'testConnection',
      upload_file: 'uploadFile',
      download_file: 'downloadFile',
      list_folder: 'listFolder',
      create_folder: 'createFolder',
      delete_file: 'deleteFile',
      move_file: 'moveFile',
      copy_file: 'copyFile',
      create_link: 'createLink',
      search: 'search',
    });
  }

  private buildTokenEndpoint(credentials: EgnyteCredentials): string {
    if (credentials.tokenUrl) {
      return credentials.tokenUrl;
    }
    const domain = credentials.domain?.replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (!domain) {
      throw new Error('Egnyte OAuth refresh requires domain to derive token endpoint');
    }
    return `https://${domain}/puboauth/token`;
  }

  protected getAuthHeaders(): Record<string, string> {
    const token = this.credentials.accessToken;
    if (!token) {
      throw new Error('Egnyte integration requires an access token');
    }
    return { Authorization: `Bearer ${token}` };
  }

  private async ensureAccessToken(): Promise<void> {
    const expiresAt = parseExpiryTimestamp(this.credentials.expiresAt);
    const now = Date.now();
    if (this.credentials.accessToken && (!expiresAt || expiresAt - now > this.refreshSkewMs)) {
      return;
    }

    if (!this.credentials.refreshToken || !this.credentials.clientId || !this.credentials.clientSecret) {
      throw new Error('Egnyte refresh requires refreshToken, clientId, and clientSecret');
    }

    if (!this.refreshPromise) {
      this.refreshPromise = (async () => {
        const body = new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: this.credentials.refreshToken as string,
          client_id: this.credentials.clientId as string,
          client_secret: this.credentials.clientSecret as string,
        });

        const response = await fetch(this.tokenEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
          },
          body,
        });

        if (!response.ok) {
          this.refreshPromise = undefined;
          throw new Error(`Egnyte token refresh failed: ${response.status} ${response.statusText}`);
        }

        const payload = await response.json();
        const expiresAt = payload.expires_in ? Date.now() + Number(payload.expires_in) * 1000 : undefined;
        await this.applyTokenRefresh({
          accessToken: payload.access_token,
          refreshToken: payload.refresh_token,
          expiresAt,
          tokenType: payload.token_type,
          scope: payload.scope,
        });

        this.refreshPromise = undefined;
      })().catch(error => {
        this.refreshPromise = undefined;
        throw error;
      });
    }

    await this.refreshPromise;
  }

  protected override async makeRequest<T = any>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    endpoint: string,
    data?: any,
    headers: Record<string, string> = {},
    options?: any
  ): Promise<APIResponse<T>> {
    await this.ensureAccessToken();
    return super.makeRequest(method, endpoint, data, headers, options);
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/user');
  }

  public async uploadFile(params: UploadFileParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['path', 'content']);
    const path = encodeURI(normalizePath(params.path));
    const buffer = Buffer.from(params.content, 'base64');

    return this.makeRequest(params.overwrite ? 'PUT' : 'POST', `/fs-content${path}`, buffer, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': buffer.byteLength.toString(),
    });
  }

  public async downloadFile(params: PathParams): Promise<APIResponse<{ content: string; contentType: string }>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['path']);
    const path = encodeURI(normalizePath(params.path));
    const response = await this.get<ArrayBuffer>(`/fs-content${path}`, undefined, {
      responseType: 'arrayBuffer',
    });

    if (!response.success || !response.data) {
      return response as APIResponse<{ content: string; contentType: string }>;
    }

    const buffer = Buffer.from(new Uint8Array(response.data));
    const content = buffer.toString('base64');
    const contentType = response.headers?.['content-type'] || 'application/octet-stream';

    return {
      success: true,
      data: { content, contentType },
      headers: response.headers,
      statusCode: response.statusCode,
    };
  }

  public async listFolder(params: PathParams & { offset?: number; count?: number } = { path: '/' }): Promise<APIResponse<any>> {
    const path = encodeURI(normalizePath(params.path ?? '/'));
    const query = this.buildQueryString({ offset: params.offset, count: params.count, list_content: true });
    return this.get(`/fs${path}${query}`);
  }

  public async createFolder(params: PathParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['path']);
    const path = encodeURI(normalizePath(params.path));
    return this.post(`/fs${path}`, { action: 'add_folder' });
  }

  public async deleteFile(params: PathParams & { permanently?: boolean }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['path']);
    const path = encodeURI(normalizePath(params.path));
    const query = this.buildQueryString({ permanently: params.permanently });
    return this.delete(`/fs${path}${query}`);
  }

  public async moveFile(params: MoveCopyParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['source', 'destination']);
    return this.post('/fs/move', {
      source: normalizePath(params.source),
      destination: normalizePath(params.destination),
    });
  }

  public async copyFile(params: MoveCopyParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['source', 'destination']);
    return this.post('/fs/copy', {
      source: normalizePath(params.source),
      destination: normalizePath(params.destination),
    });
  }

  public async createLink(params: CreateLinkParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['path']);
    const payload = {
      path: normalizePath(params.path),
      type: params.type ?? 'file',
      accessibility: params.accessibility ?? 'recipients',
      send_email: params.send_email ?? false,
      notify: params.notify ?? false,
      recipients: params.recipients,
      message: params.message,
      ...params,
    };
    return this.post('/links', payload);
  }

  public async search(params: SearchParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['query']);
    const query = this.buildQueryString({
      query: params.query,
      offset: params.offset,
      count: params.count,
      types: params.types,
    });
    return this.get(`/search${query}`);
  }
}
