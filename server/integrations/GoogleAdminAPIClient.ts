import { APIResponse, APICredentials, BaseAPIClient } from './BaseAPIClient';

export interface GoogleAdminCredentials extends APICredentials {
  accessToken: string;
}

export interface GoogleAdminUserName {
  givenName: string;
  familyName: string;
  fullName?: string;
}

export interface CreateGoogleAdminUserParams {
  primaryEmail: string;
  name: GoogleAdminUserName;
  password: string;
  changePasswordAtNextLogin?: boolean;
  orgUnitPath?: string;
  suspended?: boolean;
  recoveryEmail?: string;
  recoveryPhone?: string;
}

export interface UpdateGoogleAdminUserParams {
  userKey: string;
  name?: GoogleAdminUserName;
  suspended?: boolean;
  orgUnitPath?: string;
  password?: string;
  changePasswordAtNextLogin?: boolean;
}

export interface GoogleAdminListUsersParams {
  customer?: string;
  domain?: string;
  maxResults?: number;
  orderBy?: 'email' | 'familyName' | 'givenName';
  sortOrder?: 'ASCENDING' | 'DESCENDING';
  pageToken?: string;
}

export interface GoogleAdminGetUserParams {
  userKey: string;
  projection?: 'basic' | 'custom' | 'full';
  customFieldMask?: string;
  viewType?: 'admin_view' | 'domain_public';
}

export interface GoogleAdminCreateGroupParams {
  email: string;
  name: string;
  description?: string;
}

export interface GoogleAdminAddGroupMemberParams {
  groupKey: string;
  email: string;
  role?: 'OWNER' | 'MANAGER' | 'MEMBER';
}

export interface GoogleAdminRemoveGroupMemberParams {
  groupKey: string;
  memberKey: string;
}

/**
 * Google Admin SDK Directory API client that implements the connector-defined flows.
 */
export class GoogleAdminAPIClient extends BaseAPIClient {
  constructor(credentials: GoogleAdminCredentials) {
    super('https://admin.googleapis.com/admin/directory/v1', credentials);

    this.registerHandlers({
      test_connection: this.testConnection.bind(this) as any,
      create_user: this.createUser.bind(this) as any,
      get_user: this.getUser.bind(this) as any,
      update_user: this.updateUser.bind(this) as any,
      delete_user: this.deleteUser.bind(this) as any,
      list_users: this.listUsers.bind(this) as any,
      create_group: this.createGroup.bind(this) as any,
      add_group_member: this.addGroupMember.bind(this) as any,
      remove_group_member: this.removeGroupMember.bind(this) as any,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.credentials.accessToken}`
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/users?customer=my_customer&maxResults=1');
  }

  public async createUser(params: CreateGoogleAdminUserParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['primaryEmail', 'name', 'password']);
    return this.post('/users', params);
  }

  public async getUser(params: GoogleAdminGetUserParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['userKey']);
    const { userKey, ...queryParams } = params;
    const query = this.buildQueryString(queryParams as Record<string, any>);
    return this.get(`/users/${encodeURIComponent(userKey)}${query}`);
  }

  public async updateUser(params: UpdateGoogleAdminUserParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['userKey']);
    const { userKey, ...body } = params;
    return this.put(`/users/${encodeURIComponent(userKey)}`, body);
  }

  public async deleteUser(params: { userKey: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['userKey']);
    return this.delete(`/users/${encodeURIComponent(params.userKey)}`);
  }

  public async listUsers(params: GoogleAdminListUsersParams = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString(params as Record<string, any>);
    return this.get(`/users${query || '?customer=my_customer'}`);
  }

  public async createGroup(params: GoogleAdminCreateGroupParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['email', 'name']);
    return this.post('/groups', params);
  }

  public async addGroupMember(params: GoogleAdminAddGroupMemberParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['groupKey', 'email']);
    const payload = {
      email: params.email,
      role: params.role ?? 'MEMBER',
    };
    return this.post(`/groups/${encodeURIComponent(params.groupKey)}/members`, payload);
  }

  public async removeGroupMember(params: GoogleAdminRemoveGroupMemberParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['groupKey', 'memberKey']);
    const groupKey = encodeURIComponent(params.groupKey);
    const memberKey = encodeURIComponent(params.memberKey);
    return this.delete(`/groups/${groupKey}/members/${memberKey}`);
  }
}
