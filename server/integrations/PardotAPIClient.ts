import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

interface PardotCredentials extends APICredentials {
  businessUnitId?: string;
  tokenUrl?: string;
  expiresAt?: string | number;
}

interface ProspectPayload {
  email?: string;
  first_name?: string;
  last_name?: string;
  company?: string;
  website?: string;
  job_title?: string;
  department?: string;
  country?: string;
  address_one?: string;
  address_two?: string;
  city?: string;
  state?: string;
  territory?: string;
  zip?: string;
  phone?: string;
  fax?: string;
  source?: string;
  annual_revenue?: number;
  employees?: number;
  industry?: string;
  years_in_business?: number;
  comments?: string;
  notes?: string;
  score?: number;
  is_do_not_email?: boolean;
  is_do_not_call?: boolean;
  [key: string]: unknown;
}

export class PardotAPIClient extends BaseAPIClient {
  private readonly tokenEndpoint?: string;
  private readonly refreshSkewMs = 60_000;
  private refreshPromise?: Promise<void>;

  constructor(credentials: PardotCredentials) {
    super('https://pi.pardot.com/api', credentials);
    this.tokenEndpoint = credentials.tokenUrl ?? 'https://login.salesforce.com/services/oauth2/token';

    this.registerHandlers({
      test_connection: this.testConnection.bind(this) as any,
      get_prospects: this.getProspects.bind(this) as any,
      create_prospect: this.createProspect.bind(this) as any,
      update_prospect: this.updateProspect.bind(this) as any,
      get_campaigns: this.getCampaigns.bind(this) as any,
      get_lists: this.getLists.bind(this) as any,
      add_prospect_to_list: this.addProspectToList.bind(this) as any,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const token = this.credentials.accessToken;
    if (!token) {
      throw new Error('Pardot access token is required');
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Pardot-Business-Unit-Id': (this.credentials as PardotCredentials).businessUnitId || '',
    };

    if (!headers['Pardot-Business-Unit-Id']) {
      delete headers['Pardot-Business-Unit-Id'];
    }

    return headers;
  }

  private parseExpiry(): number | undefined {
    const raw = (this.credentials as PardotCredentials).expiresAt;
    if (!raw) return undefined;
    if (typeof raw === 'number') return raw;
    const parsed = Date.parse(raw);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  private async ensureAccessToken(): Promise<void> {
    const expiresAt = this.parseExpiry();
    if (!this.credentials.accessToken) {
      if (this.credentials.refreshToken) {
        await this.refreshAccessToken();
      } else {
        throw new Error('Pardot credentials missing access token');
      }
      return;
    }

    if (!expiresAt || expiresAt - Date.now() > this.refreshSkewMs) {
      return;
    }

    await this.refreshAccessToken();
  }

  private async refreshAccessToken(): Promise<void> {
    if (!this.credentials.refreshToken || !this.credentials.clientId || !this.credentials.clientSecret || !this.tokenEndpoint) {
      throw new Error('Pardot refresh requires refreshToken, clientId, clientSecret, and token endpoint');
    }

    if (!this.refreshPromise) {
      this.refreshPromise = (async () => {
        const params = new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: this.credentials.refreshToken as string,
          client_id: this.credentials.clientId as string,
          client_secret: this.credentials.clientSecret as string,
        });

        const response = await fetch(this.tokenEndpoint!, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
          },
          body: params,
        });

        if (!response.ok) {
          this.refreshPromise = undefined;
          throw new Error(`Pardot token refresh failed: ${response.status} ${response.statusText}`);
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
    return super.makeRequest<T>(method, endpoint, data, headers, options);
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/prospect/version/4/do/query?limit=1');
  }

  public async getProspects(params: {
    limit?: number;
    offset?: number;
    created_after?: string;
    created_before?: string;
    updated_after?: string;
    updated_before?: string;
    sort_by?: string;
    sort_order?: 'ascending' | 'descending';
  } = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString({
      ...params,
      format: 'json',
      version: 4,
    });
    return this.get(`/prospect/version/4/do/query${query}`);
  }

  public async createProspect(params: ProspectPayload & { email: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['email']);
    const body = this.buildProspectPayload(params);
    return this.post(`/prospect/version/4/do/create/email/${encodeURIComponent(params.email)}`, body);
  }

  public async updateProspect(params: ProspectPayload & { id: string | number }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['id']);
    const body = this.buildProspectPayload(params);
    return this.post(`/prospect/version/4/do/update/id/${encodeURIComponent(String(params.id))}`, body);
  }

  public async getCampaigns(params: { limit?: number; offset?: number } = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString({ ...params, format: 'json', version: 4 });
    return this.get(`/campaign/version/4/do/query${query}`);
  }

  public async getLists(params: { limit?: number; offset?: number } = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString({ ...params, format: 'json', version: 4 });
    return this.get(`/list/version/4/do/query${query}`);
  }

  public async addProspectToList(params: { list_id: number | string; prospect_id: number | string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['list_id', 'prospect_id']);
    const path = `/listMembership/version/4/do/create/list_id/${encodeURIComponent(String(params.list_id))}/prospect_id/${encodeURIComponent(String(params.prospect_id))}`;
    return this.post(path, { format: 'json' });
  }

  private buildProspectPayload(data: ProspectPayload): ProspectPayload {
    const allowed: (keyof ProspectPayload)[] = [
      'email',
      'first_name',
      'last_name',
      'company',
      'website',
      'job_title',
      'department',
      'country',
      'address_one',
      'address_two',
      'city',
      'state',
      'territory',
      'zip',
      'phone',
      'fax',
      'source',
      'annual_revenue',
      'employees',
      'industry',
      'years_in_business',
      'comments',
      'notes',
      'score',
      'is_do_not_email',
      'is_do_not_call',
    ];

    const payload: ProspectPayload = {};
    for (const key of allowed) {
      if (data[key] !== undefined) {
        payload[key] = data[key];
      }
    }

    return payload;
  }
}
