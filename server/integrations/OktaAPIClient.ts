import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

interface OktaCredentials extends APICredentials {
  apiKey?: string;
  token?: string;
  domain?: string;
  baseUrl?: string;
}

interface CreateUserParams {
  profile: Record<string, any>;
  credentials?: Record<string, any>;
  groupIds?: string[];
  activate?: boolean;
  provider?: boolean;
  nextLogin?: string;
}

interface UpdateUserParams {
  userId: string;
  profile?: Record<string, any>;
  credentials?: Record<string, any>;
  nextLogin?: string;
}

interface GetUserParams {
  userId: string;
}

interface ListUsersParams {
  q?: string;
  limit?: number;
  filter?: string;
  search?: string;
  after?: string;
}

interface GroupMembershipParams {
  userId: string;
  groupId: string;
}

interface ResetPasswordParams {
  userId: string;
  sendEmail?: boolean;
}

interface ExpirePasswordParams {
  userId: string;
  tempPassword?: boolean;
}

interface SuspendParams {
  userId: string;
}

interface ActivateParams {
  userId: string;
  sendEmail?: boolean;
}

interface CreateGroupParams {
  profile: Record<string, any>;
}

interface ListGroupsParams {
  q?: string;
  limit?: number;
  filter?: string;
  search?: string;
  after?: string;
}

function sanitizeBaseUrl(credentials: OktaCredentials): string {
  const explicit = credentials.baseUrl?.replace(/\/$/, '');
  if (explicit) {
    return explicit;
  }
  const domain = credentials.domain?.replace(/^https?:\/\//, '').replace(/\/$/, '');
  if (!domain) {
    throw new Error('Okta integration requires either baseUrl or domain in credentials');
  }
  const host = domain.includes('.') ? domain : `${domain}.okta.com`;
  return `https://${host}/api/v1`;
}

function encodeId(id: string): string {
  return encodeURIComponent(id);
}

function pruneEmpty<T extends Record<string, any>>(value: T): T {
  const output: Record<string, any> = {};
  for (const [key, val] of Object.entries(value)) {
    if (val === undefined || val === null) {
      continue;
    }
    output[key] = val;
  }
  return output as T;
}

export class OktaAPIClient extends BaseAPIClient {
  constructor(credentials: OktaCredentials) {
    super(sanitizeBaseUrl(credentials), credentials);

    this.registerAliasHandlers({
      test_connection: 'testConnection',
      create_user: 'createUser',
      get_user: 'getUser',
      update_user: 'updateUser',
      deactivate_user: 'deactivateUser',
      activate_user: 'activateUser',
      suspend_user: 'suspendUser',
      unsuspend_user: 'unsuspendUser',
      list_users: 'listUsers',
      add_user_to_group: 'addUserToGroup',
      remove_user_from_group: 'removeUserFromGroup',
      create_group: 'createGroup',
      list_groups: 'listGroups',
      reset_password: 'resetPassword',
      expire_password: 'expirePassword',
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const token = this.credentials.apiKey || this.credentials.token;
    if (!token) {
      throw new Error('Okta integration requires an API token');
    }
    return {
      Authorization: `SSWS ${token}`,
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/users/me');
  }

  public async createUser(params: CreateUserParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['profile']);
    const query = this.buildQueryString({
      activate: params.activate ?? true,
      provider: params.provider,
      nextLogin: params.nextLogin,
    });
    const payload = pruneEmpty({
      profile: params.profile,
      credentials: params.credentials,
      groupIds: params.groupIds,
    });
    return this.post(`/users${query}`, payload);
  }

  public async getUser(params: GetUserParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['userId']);
    return this.get(`/users/${encodeId(params.userId)}`);
  }

  public async listUsers(params: ListUsersParams = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString({
      q: params.q,
      limit: params.limit,
      filter: params.filter,
      search: params.search,
      after: params.after,
    });
    return this.get(`/users${query}`);
  }

  public async updateUser(params: UpdateUserParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['userId']);
    const query = this.buildQueryString({ nextLogin: params.nextLogin });
    const payload = pruneEmpty({
      profile: params.profile,
      credentials: params.credentials,
    });
    return this.post(`/users/${encodeId(params.userId)}${query}`, payload);
  }

  public async deactivateUser(params: { userId: string; sendEmail?: boolean }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['userId']);
    const query = this.buildQueryString({ sendEmail: params.sendEmail });
    return this.post(`/users/${encodeId(params.userId)}/lifecycle/deactivate${query}`);
  }

  public async activateUser(params: ActivateParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['userId']);
    const query = this.buildQueryString({ sendEmail: params.sendEmail });
    return this.post(`/users/${encodeId(params.userId)}/lifecycle/activate${query}`);
  }

  public async suspendUser(params: SuspendParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['userId']);
    return this.post(`/users/${encodeId(params.userId)}/lifecycle/suspend`);
  }

  public async unsuspendUser(params: SuspendParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['userId']);
    return this.post(`/users/${encodeId(params.userId)}/lifecycle/unsuspend`);
  }

  public async addUserToGroup(params: GroupMembershipParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['userId', 'groupId']);
    return this.put(`/groups/${encodeId(params.groupId)}/users/${encodeId(params.userId)}`);
  }

  public async removeUserFromGroup(params: GroupMembershipParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['userId', 'groupId']);
    return this.delete(`/groups/${encodeId(params.groupId)}/users/${encodeId(params.userId)}`);
  }

  public async createGroup(params: CreateGroupParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['profile']);
    return this.post('/groups', { profile: params.profile });
  }

  public async listGroups(params: ListGroupsParams = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString({
      q: params.q,
      limit: params.limit,
      filter: params.filter,
      search: params.search,
      after: params.after,
    });
    return this.get(`/groups${query}`);
  }

  public async resetPassword(params: ResetPasswordParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['userId']);
    const query = this.buildQueryString({ sendEmail: params.sendEmail ?? true });
    return this.post(`/users/${encodeId(params.userId)}/lifecycle/reset_password${query}`);
  }

  public async expirePassword(params: ExpirePasswordParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['userId']);
    const query = this.buildQueryString({ tempPassword: params.tempPassword });
    return this.post(`/users/${encodeId(params.userId)}/lifecycle/expire_password${query}`);
  }
}
