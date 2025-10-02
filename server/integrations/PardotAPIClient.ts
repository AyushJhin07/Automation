import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

export interface PardotAPICredentials extends APICredentials {
  businessUnitId: string;
  baseUrl?: string;
  loginUrl?: string;
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  expiresAt?: number | string;
}

export class PardotAPIClient extends BaseAPIClient {
  private readonly businessUnitId: string;
  private readonly tokenUrl: string;
  private tokenExpiresAt?: number;

  constructor(credentials: PardotAPICredentials) {
    const base = (credentials.baseUrl || 'https://pi.pardot.com').replace(/\/$/, '');
    super(base, credentials);

    if (!credentials.businessUnitId) {
      throw new Error('Pardot integration requires a businessUnitId');
    }

    this.businessUnitId = credentials.businessUnitId;
    this.tokenUrl = (credentials.loginUrl || 'https://login.salesforce.com')
      .replace(/\/$/, '')
      .concat('/services/oauth2/token');
    this.tokenExpiresAt = credentials.expiresAt ? new Date(credentials.expiresAt).getTime() : undefined;

    this.registerHandlers({
      test_connection: this.testConnection.bind(this),
      get_prospects: this.getProspects.bind(this),
      create_prospect: this.createProspect.bind(this),
      update_prospect: this.updateProspect.bind(this),
      get_campaigns: this.getCampaigns.bind(this),
      get_lists: this.getLists.bind(this),
      add_prospect_to_list: this.addProspectToList.bind(this),
    });
  }

  protected override async makeRequest<T = any>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    endpoint: string,
    data?: any,
    headers: Record<string, string> = {}
  ): Promise<APIResponse<T>> {
    await this.ensureAccessToken();
    let response = await super.makeRequest<T>(method, endpoint, data, headers);
    if (!response.success && response.statusCode === 401) {
      await this.ensureAccessToken(true);
      response = await super.makeRequest<T>(method, endpoint, data, headers);
    }
    return response;
  }

  protected getAuthHeaders(): Record<string, string> {
    const token = this.credentials.accessToken;
    if (!token) {
      throw new Error('Pardot access token missing. Complete OAuth authorization before calling the API.');
    }
    return {
      Authorization: `Bearer ${token}`,
      'Pardot-Business-Unit-Id': this.businessUnitId,
    };
  }

  private async ensureAccessToken(force = false): Promise<void> {
    const token = this.credentials.accessToken;
    const shouldRefresh =
      force ||
      !token ||
      (this.tokenExpiresAt !== undefined && Date.now() >= this.tokenExpiresAt - 60_000);

    if (!shouldRefresh) {
      return;
    }

    await this.refreshAccessToken();
  }

  private async refreshAccessToken(): Promise<void> {
    const refreshToken = this.credentials.refreshToken;
    const clientId = this.credentials.clientId;
    const clientSecret = this.credentials.clientSecret;

    if (!refreshToken || !clientId || !clientSecret) {
      if (!this.credentials.accessToken) {
        throw new Error('Pardot credentials missing refreshToken/clientId/clientSecret for OAuth refresh.');
      }
      return;
    }

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    });

    const response = await fetch(this.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!response.ok) {
      throw new Error(`Failed to refresh Pardot access token (HTTP ${response.status})`);
    }

    const payload = await response.json();
    const accessToken = payload?.access_token;
    if (!accessToken) {
      throw new Error('Pardot token response missing access_token');
    }

    this.credentials.accessToken = accessToken;
    if (payload?.refresh_token) {
      this.credentials.refreshToken = payload.refresh_token;
    }
    const expiresIn = Number(payload?.expires_in);
    this.tokenExpiresAt = Number.isFinite(expiresIn) ? Date.now() + expiresIn * 1000 : undefined;
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/api/prospect/version/4/do/query?limit=1');
  }

  public async getProspects(params: {
    limit?: number;
    offset?: number;
    created_after?: string;
    created_before?: string;
    updated_after?: string;
    updated_before?: string;
    sort_by?: string;
    sort_order?: string;
  } = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString(params as Record<string, any>);
    return this.get(`/api/prospect/version/4/do/query${query}`);
  }

  public async createProspect(params: Record<string, any>): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['email']);
    const { email, ...rest } = params;
    const payload = this.toFormBody(rest);
    return this.post(
      `/api/prospect/version/4/do/create/email/${encodeURIComponent(email)}`,
      payload,
      {
        'Content-Type': 'application/x-www-form-urlencoded',
      }
    );
  }

  public async updateProspect(params: Record<string, any>): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['id']);
    const { id, ...rest } = params;
    const payload = this.toFormBody(rest);
    return this.post(
      `/api/prospect/version/4/do/update/id/${encodeURIComponent(String(id))}`,
      payload,
      {
        'Content-Type': 'application/x-www-form-urlencoded',
      }
    );
  }

  public async getCampaigns(): Promise<APIResponse<any>> {
    return this.get('/api/campaign/version/4/do/query');
  }

  public async getLists(): Promise<APIResponse<any>> {
    return this.get('/api/list/version/4/do/query');
  }

  public async addProspectToList(params: { list_id: string; prospect_id: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['list_id', 'prospect_id']);
    return this.post(
      `/api/listMembership/version/4/do/create/list_id/${encodeURIComponent(params.list_id)}/prospect_id/${encodeURIComponent(params.prospect_id)}`,
      undefined
    );
  }

  private toFormBody(payload: Record<string, any>): URLSearchParams {
    const body = new URLSearchParams();
    Object.entries(payload || {}).forEach(([key, value]) => {
      if (value === undefined || value === null) {
        return;
      }
      body.append(key, Array.isArray(value) ? value.join(',') : String(value));
    });
    return body;
  }
}
