import { APIResponse, APICredentials, BaseAPIClient } from './BaseAPIClient';

export interface OktaCredentials extends APICredentials {
  /** Okta domain without protocol (e.g. example.okta.com) or a full base URL */
  domain?: string;
  baseUrl?: string;
  apiToken?: string;
  apiKey?: string;
}

export interface OktaUserProfile {
  firstName: string;
  lastName: string;
  email: string;
  login: string;
  [key: string]: any;
}

export interface OktaUserCredentials {
  password?: { value: string };
  recovery_question?: { question: string; answer: string };
  provider?: { type: string; name?: string };
}

export interface CreateOktaUserParams {
  profile: OktaUserProfile;
  credentials?: OktaUserCredentials;
  groupIds?: string[];
  activate?: boolean;
  provider?: boolean;
  nextLogin?: 'changePassword';
}

export interface UpdateOktaUserParams {
  userId: string;
  profile?: Partial<OktaUserProfile>;
  credentials?: OktaUserCredentials;
}

export interface OktaLifecycleParams {
  userId: string;
  sendEmail?: boolean;
}

export interface OktaPasswordLifecycleParams {
  userId: string;
  sendEmail?: boolean;
  tempPassword?: boolean;
}

export interface OktaListUsersParams {
  q?: string;
  limit?: number;
  filter?: string;
  search?: string;
}

export interface OktaGroupProfile {
  name: string;
  description?: string;
}

export interface CreateOktaGroupParams {
  profile: OktaGroupProfile;
}

export interface OktaListGroupsParams {
  q?: string;
  limit?: number;
}

/**
 * Real Okta API client that covers the user management flows exposed in the connector definition.
 */
export class OktaAPIClient extends BaseAPIClient {
  private readonly domain: string;

  constructor(credentials: OktaCredentials) {
    const baseUrl = OktaAPIClient.resolveBaseUrl(credentials);
    super(baseUrl, credentials);
    this.domain = baseUrl.replace('https://', '').replace(/\/api\/v1$/, '');

    this.registerHandlers({
      test_connection: this.testConnection.bind(this) as any,
      create_user: this.createUser.bind(this) as any,
      get_user: this.getUser.bind(this) as any,
      update_user: this.updateUser.bind(this) as any,
      deactivate_user: this.deactivateUser.bind(this) as any,
      activate_user: this.activateUser.bind(this) as any,
      suspend_user: this.suspendUser.bind(this) as any,
      unsuspend_user: this.unsuspendUser.bind(this) as any,
      list_users: this.listUsers.bind(this) as any,
      add_user_to_group: this.addUserToGroup.bind(this) as any,
      remove_user_from_group: this.removeUserFromGroup.bind(this) as any,
      create_group: this.createGroup.bind(this) as any,
      list_groups: this.listGroups.bind(this) as any,
      reset_password: this.resetPassword.bind(this) as any,
      expire_password: this.expirePassword.bind(this) as any,
    });
  }

  private static resolveBaseUrl(credentials: OktaCredentials): string {
    if (credentials.baseUrl) {
      return credentials.baseUrl.replace(/\/$/, '');
    }

    const rawDomain = credentials.domain || credentials.orgUrl || credentials.oktaDomain;
    if (!rawDomain) {
      throw new Error('Okta credentials must include a domain or baseUrl');
    }

    const trimmed = rawDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    return `https://${trimmed}/api/v1`;
  }

  private get token(): string {
    const raw = this.credentials.apiToken || this.credentials.apiKey || this.credentials.token;
    if (!raw) {
      throw new Error('Okta credentials must include an apiToken or apiKey');
    }
    return raw.startsWith('SSWS ') ? raw.slice(5) : raw;
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      Authorization: `SSWS ${this.token}`
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/users?limit=1');
  }

  public async createUser(params: CreateOktaUserParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['profile']);
    const query = this.buildQueryString({
      activate: params.activate ?? true,
      provider: params.provider,
      nextLogin: params.nextLogin,
    });
    const payload: Record<string, unknown> = {
      profile: params.profile,
    };
    if (params.credentials) {
      payload.credentials = params.credentials;
    }
    if (params.groupIds?.length) {
      payload.groupIds = params.groupIds;
    }
    return this.post(`/users${query}`, payload);
  }

  public async getUser(params: { userId: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['userId']);
    const id = encodeURIComponent(params.userId);
    return this.get(`/users/${id}`);
  }

  public async updateUser(params: UpdateOktaUserParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['userId']);
    const id = encodeURIComponent(params.userId);
    const payload: Record<string, unknown> = {};
    if (params.profile) {
      payload.profile = params.profile;
    }
    if (params.credentials) {
      payload.credentials = params.credentials;
    }
    return this.post(`/users/${id}`, payload);
  }

  public async deactivateUser(params: OktaLifecycleParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['userId']);
    const query = this.buildQueryString({ sendEmail: params.sendEmail });
    const id = encodeURIComponent(params.userId);
    return this.post(`/users/${id}/lifecycle/deactivate${query}`, {});
  }

  public async activateUser(params: OktaLifecycleParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['userId']);
    const query = this.buildQueryString({ sendEmail: params.sendEmail ?? true });
    const id = encodeURIComponent(params.userId);
    return this.post(`/users/${id}/lifecycle/activate${query}`, {});
  }

  public async suspendUser(params: OktaLifecycleParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['userId']);
    const id = encodeURIComponent(params.userId);
    return this.post(`/users/${id}/lifecycle/suspend`, {});
  }

  public async unsuspendUser(params: OktaLifecycleParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['userId']);
    const id = encodeURIComponent(params.userId);
    return this.post(`/users/${id}/lifecycle/unsuspend`, {});
  }

  public async listUsers(params: OktaListUsersParams = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString(params as Record<string, any>);
    return this.get(`/users${query}`);
  }

  public async addUserToGroup(params: { userId: string; groupId: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['userId', 'groupId']);
    const userId = encodeURIComponent(params.userId);
    const groupId = encodeURIComponent(params.groupId);
    return this.put(`/groups/${groupId}/users/${userId}`);
  }

  public async removeUserFromGroup(params: { userId: string; groupId: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['userId', 'groupId']);
    const userId = encodeURIComponent(params.userId);
    const groupId = encodeURIComponent(params.groupId);
    return this.delete(`/groups/${groupId}/users/${userId}`);
  }

  public async createGroup(params: CreateOktaGroupParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['profile']);
    return this.post('/groups', params);
  }

  public async listGroups(params: OktaListGroupsParams = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString(params as Record<string, any>);
    return this.get(`/groups${query}`);
  }

  public async resetPassword(params: OktaPasswordLifecycleParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['userId']);
    const id = encodeURIComponent(params.userId);
    const query = this.buildQueryString({ sendEmail: params.sendEmail });
    return this.post(`/users/${id}/lifecycle/reset_password${query}`, {});
  }

  public async expirePassword(params: OktaPasswordLifecycleParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['userId']);
    const id = encodeURIComponent(params.userId);
    const query = this.buildQueryString({ tempPassword: params.tempPassword });
    return this.post(`/users/${id}/lifecycle/expire_password${query}`, {});
  }
}
