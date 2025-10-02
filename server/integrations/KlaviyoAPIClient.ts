import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

export interface KlaviyoAPICredentials extends APICredentials {
  apiKey?: string;
  baseUrl?: string;
}

export class KlaviyoAPIClient extends BaseAPIClient {
  private readonly apiKey: string;

  constructor(credentials: KlaviyoAPICredentials) {
    const apiKey = credentials.apiKey || credentials.token || credentials.privateApiKey;
    if (!apiKey) {
      throw new Error('Klaviyo integration requires an API key');
    }

    const base = (credentials.baseUrl || 'https://a.klaviyo.com/api').replace(/\/$/, '');
    super(base, { ...credentials, apiKey });
    this.apiKey = apiKey;

    this.registerHandlers({
      test_connection: this.testConnection.bind(this),
      create_profile: this.createProfile.bind(this),
      update_profile: this.updateProfile.bind(this),
      get_profile: this.getProfile.bind(this),
      list_profiles: this.listProfiles.bind(this),
      create_event: this.createEvent.bind(this),
      get_lists: this.getLists.bind(this),
      create_list: this.createList.bind(this),
      subscribe_profiles: this.subscribeProfiles.bind(this),
      unsubscribe_profiles: this.unsubscribeProfiles.bind(this),
      get_campaigns: this.getCampaigns.bind(this),
      get_flows: this.getFlows.bind(this),
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      'Klaviyo-API-Key': this.apiKey,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/accounts/', this.getAuthHeaders());
  }

  public async createProfile(params: Record<string, any>): Promise<APIResponse<any>> {
    return this.post('/profiles/', params, this.getAuthHeaders());
  }

  public async updateProfile(params: { id: string; data?: Record<string, any> }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['id']);
    const payload = params.data ?? this.removeEmpty({ data: { id: params.id } });
    return this.patch(`/profiles/${encodeURIComponent(params.id)}/`, payload, this.getAuthHeaders());
  }

  public async getProfile(params: { id: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['id']);
    return this.get(`/profiles/${encodeURIComponent(params.id)}/`, this.getAuthHeaders());
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
      'page[cursor]': params.page_cursor,
      'page[size]': params.page_size,
      sort: params.sort,
      'additional-fields[profiles]': params.additional_fields?.join(','),
    });
    return this.get(`/profiles/${query}`, this.getAuthHeaders());
  }

  public async createEvent(params: Record<string, any>): Promise<APIResponse<any>> {
    return this.post('/events/', params, this.getAuthHeaders());
  }

  public async getLists(): Promise<APIResponse<any>> {
    return this.get('/lists/', this.getAuthHeaders());
  }

  public async createList(params: Record<string, any>): Promise<APIResponse<any>> {
    return this.post('/lists/', params, this.getAuthHeaders());
  }

  public async subscribeProfiles(params: { list_id: string; data: any[] }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['list_id', 'data']);
    return this.post(
      `/lists/${encodeURIComponent(params.list_id)}/relationships/profiles/`,
      { data: params.data },
      this.getAuthHeaders()
    );
  }

  public async unsubscribeProfiles(params: { list_id: string; data: any[] }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['list_id', 'data']);
    return this.makeRequest(
      'DELETE',
      `/lists/${encodeURIComponent(params.list_id)}/relationships/profiles/`,
      { data: params.data },
      this.getAuthHeaders()
    );
  }

  public async getCampaigns(): Promise<APIResponse<any>> {
    return this.get('/campaigns/', this.getAuthHeaders());
  }

  public async getFlows(): Promise<APIResponse<any>> {
    return this.get('/flows/', this.getAuthHeaders());
  }

  private removeEmpty<T extends Record<string, any>>(payload: T): T {
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(payload || {})) {
      if (value !== undefined && value !== null) {
        cleaned[key] = value;
      }
    }
    return cleaned as T;
  }
}
