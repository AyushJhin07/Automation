import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

interface KlaviyoCredentials extends APICredentials {
  apiKey?: string;
}

export class KlaviyoAPIClient extends BaseAPIClient {
  constructor(credentials: KlaviyoCredentials) {
    const apiKey = credentials.apiKey || credentials.accessToken;
    if (!apiKey) {
      throw new Error('Klaviyo integration requires an API key');
    }
    super('https://a.klaviyo.com/api', { ...credentials, apiKey });

    this.registerHandlers({
      test_connection: this.testConnection.bind(this) as any,
      create_profile: this.createProfile.bind(this) as any,
      update_profile: this.updateProfile.bind(this) as any,
      get_profile: this.getProfile.bind(this) as any,
      list_profiles: this.listProfiles.bind(this) as any,
      create_event: this.createEvent.bind(this) as any,
      get_lists: this.getLists.bind(this) as any,
      create_list: this.createList.bind(this) as any,
      subscribe_profiles: this.subscribeProfiles.bind(this) as any,
      unsubscribe_profiles: this.unsubscribeProfiles.bind(this) as any,
      get_campaigns: this.getCampaigns.bind(this) as any,
      get_flows: this.getFlows.bind(this) as any,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const key = (this.credentials as KlaviyoCredentials).apiKey;
    if (!key) {
      throw new Error('Klaviyo API key missing from credentials');
    }
    return {
      Authorization: `Klaviyo-API-Key ${key}`,
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/profiles?page_size=1');
  }

  public async createProfile(params: { data: Record<string, any> }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['data']);
    return this.post('/profiles', params);
  }

  public async updateProfile(params: { id: string; data: Record<string, any> }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['id', 'data']);
    return this.patch(`/profiles/${encodeURIComponent(params.id)}`, params.data);
  }

  public async getProfile(params: { id: string; additional_fields?: string[] }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['id']);
    const query = this.buildQueryString({
      additional_fields: params.additional_fields?.join(','),
    });
    return this.get(`/profiles/${encodeURIComponent(params.id)}${query}`);
  }

  public async listProfiles(params: {
    filter?: string;
    page_cursor?: string;
    page_size?: number;
    sort?: string;
    additional_fields?: string[];
  } = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString({
      filter: params.filter,
      page_cursor: params.page_cursor,
      page_size: params.page_size,
      sort: params.sort,
      additional_fields: params.additional_fields?.join(','),
    });
    return this.get(`/profiles${query}`);
  }

  public async createEvent(params: { data: Record<string, any> }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['data']);
    return this.post('/events', params);
  }

  public async getLists(params: { page_cursor?: string; page_size?: number } = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString({
      page_cursor: params.page_cursor,
      page_size: params.page_size,
    });
    return this.get(`/lists${query}`);
  }

  public async createList(params: { data: Record<string, any> }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['data']);
    return this.post('/lists', params);
  }

  public async subscribeProfiles(params: { list_id: string; data: Record<string, any> }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['list_id', 'data']);
    return this.post(`/lists/${encodeURIComponent(params.list_id)}/subscribe`, params.data);
  }

  public async unsubscribeProfiles(params: { list_id: string; data: Record<string, any> }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['list_id', 'data']);
    return this.post(`/lists/${encodeURIComponent(params.list_id)}/unsubscribe`, params.data);
  }

  public async getCampaigns(params: { filter?: string; page_cursor?: string; page_size?: number; sort?: string } = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString({
      filter: params.filter,
      page_cursor: params.page_cursor,
      page_size: params.page_size,
      sort: params.sort,
    });
    return this.get(`/campaigns${query}`);
  }

  public async getFlows(params: { filter?: string; page_cursor?: string; page_size?: number; sort?: string } = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString({
      filter: params.filter,
      page_cursor: params.page_cursor,
      page_size: params.page_size,
      sort: params.sort,
    });
    return this.get(`/flows${query}`);
  }
}
