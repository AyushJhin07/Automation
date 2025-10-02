import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

interface GoogleAdminCredentials extends APICredentials {
  accessToken?: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  tokenUrl?: string;
  expiresAt?: string | number;
  customerId?: string;
}

interface CreateUserParams {
  primaryEmail: string;
  name: { givenName: string; familyName: string } & Record<string, any>;
  password: string;
  changePasswordAtNextLogin?: boolean;
  orgUnitPath?: string;
  suspended?: boolean;
  recoveryEmail?: string;
  recoveryPhone?: string;
  [key: string]: any;
}

interface UpdateUserParams {
  userKey: string;
  payload: Record<string, any>;
}

interface GetUserParams {
  userKey: string;
  projection?: string;
  customFieldMask?: string;
  viewType?: string;
}

interface ListUsersParams {
  customer?: string;
  domain?: string;
  query?: string;
  maxResults?: number;
  orderBy?: string;
  sortOrder?: string;
  pageToken?: string;
  projection?: string;
  viewType?: string;
}

interface DeleteUserParams {
  userKey: string;
}

interface CreateGroupParams {
  email: string;
  name?: string;
  description?: string;
  [key: string]: any;
}

interface GroupMemberParams {
  groupKey: string;
  memberKey: string;
  role?: string;
  type?: string;
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

export class GoogleAdminAPIClient extends BaseAPIClient {
  private readonly tokenEndpoint: string;
  private refreshPromise?: Promise<void>;
  private readonly refreshSkewMs = 60_000;

  constructor(credentials: GoogleAdminCredentials) {
    super('https://admin.googleapis.com/admin/directory/v1', credentials);
    this.tokenEndpoint = credentials.tokenUrl ?? 'https://oauth2.googleapis.com/token';

    this.registerAliasHandlers({
      test_connection: 'testConnection',
      create_user: 'createUser',
      get_user: 'getUser',
      update_user: 'updateUser',
      delete_user: 'deleteUser',
      list_users: 'listUsers',
      create_group: 'createGroup',
      add_group_member: 'addGroupMember',
      remove_group_member: 'removeGroupMember',
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const token = this.credentials.accessToken;
    if (!token) {
      throw new Error('Google Admin integration requires an access token');
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
      throw new Error('Google Admin refresh requires refreshToken, clientId, and clientSecret');
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
          throw new Error(`Google Admin token refresh failed: ${response.status} ${response.statusText}`);
        }

        const payload = await response.json();
        this.credentials.accessToken = payload.access_token;
        if (payload.refresh_token) {
          this.credentials.refreshToken = payload.refresh_token;
        }
        if (payload.expires_in) {
          this.credentials.expiresAt = Date.now() + Number(payload.expires_in) * 1000;
        }

        if (typeof this.credentials.onTokenRefreshed === 'function') {
          await this.credentials.onTokenRefreshed({
            accessToken: this.credentials.accessToken!,
            refreshToken: this.credentials.refreshToken,
            expiresAt: parseExpiryTimestamp(this.credentials.expiresAt),
          });
        }

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
    headers: Record<string, string> = {}
  ): Promise<APIResponse<T>> {
    await this.ensureAccessToken();
    return super.makeRequest(method, endpoint, data, headers);
  }

  public async testConnection(): Promise<APIResponse<any>> {
    const query = this.buildQueryString({ customer: this.credentials.customerId ?? 'my_customer', maxResults: 1 });
    return this.get(`/users${query}`);
  }

  public async createUser(params: CreateUserParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['primaryEmail', 'name', 'password']);
    const payload = {
      ...params,
      changePasswordAtNextLogin: params.changePasswordAtNextLogin ?? true,
      orgUnitPath: params.orgUnitPath ?? '/',
    };
    return this.post('/users', payload);
  }

  public async getUser(params: GetUserParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['userKey']);
    const query = this.buildQueryString({
      projection: params.projection,
      customFieldMask: params.customFieldMask,
      viewType: params.viewType,
    });
    return this.get(`/users/${encodeURIComponent(params.userKey)}${query}`);
  }

  public async updateUser(params: UpdateUserParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['userKey', 'payload']);
    return this.put(`/users/${encodeURIComponent(params.userKey)}`, params.payload);
  }

  public async deleteUser(params: DeleteUserParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['userKey']);
    return this.delete(`/users/${encodeURIComponent(params.userKey)}`);
  }

  public async listUsers(params: ListUsersParams = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString({
      customer: params.customer ?? this.credentials.customerId ?? 'my_customer',
      domain: params.domain,
      query: params.query,
      maxResults: params.maxResults,
      orderBy: params.orderBy,
      sortOrder: params.sortOrder,
      pageToken: params.pageToken,
      projection: params.projection,
      viewType: params.viewType,
    });
    return this.get(`/users${query}`);
  }

  public async createGroup(params: CreateGroupParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['email']);
    return this.post('/groups', params);
  }

  public async addGroupMember(params: GroupMemberParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['groupKey', 'memberKey']);
    const payload = {
      email: params.memberKey,
      role: params.role ?? 'MEMBER',
      type: params.type ?? 'USER',
    };
    return this.post(`/groups/${encodeURIComponent(params.groupKey)}/members`, payload);
  }

  public async removeGroupMember(params: GroupMemberParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['groupKey', 'memberKey']);
    return this.delete(`/groups/${encodeURIComponent(params.groupKey)}/members/${encodeURIComponent(params.memberKey)}`);
  }
}
