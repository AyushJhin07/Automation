import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

interface MarketoCredentials extends APICredentials {
  instanceUrl?: string;
  munchkinId?: string;
  identityUrl?: string;
  tokenUrl?: string;
  expiresAt?: string | number;
}

interface LeadInput {
  id?: string | number;
  email?: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  title?: string;
  phone?: string;
  website?: string;
  industry?: string;
  country?: string;
  state?: string;
  city?: string;
  address?: string;
  postalCode?: string;
  leadSource?: string;
  leadStatus?: string;
  leadScore?: number;
  partitionId?: number;
  [key: string]: unknown;
}

interface CampaignRequest {
  leads?: Array<{ id: number } | { email: string }>;
  tokens?: Array<{ name: string; value: string }>;
}

export class MarketoAPIClient extends BaseAPIClient {
  private readonly tokenEndpoint?: string;
  private readonly refreshSkewMs = 60_000; // refresh one minute before expiry
  private refreshPromise?: Promise<void>;

  constructor(credentials: MarketoCredentials) {
    const { baseUrl, tokenEndpoint } = MarketoAPIClient.resolveEndpoints(credentials);
    super(baseUrl, credentials);
    this.tokenEndpoint = tokenEndpoint;

    this.registerHandlers({
      test_connection: this.testConnection.bind(this) as any,
      create_lead: this.createLead.bind(this) as any,
      get_lead_by_id: this.getLeadById.bind(this) as any,
      get_leads_by_filter: this.getLeadsByFilter.bind(this) as any,
      update_lead: this.updateLead.bind(this) as any,
      delete_lead: this.deleteLead.bind(this) as any,
      add_to_list: this.addToList.bind(this) as any,
      remove_from_list: this.removeFromList.bind(this) as any,
      create_campaign: this.createCampaign.bind(this) as any,
      get_campaigns: this.getCampaigns.bind(this) as any,
      request_campaign: this.requestCampaign.bind(this) as any,
      create_email: this.createEmail.bind(this) as any,
      get_emails: this.getEmails.bind(this) as any,
      send_sample_email: this.sendSampleEmail.bind(this) as any,
      get_programs: this.getPrograms.bind(this) as any,
      create_program: this.createProgram.bind(this) as any,
    });
  }

  private static resolveEndpoints(credentials: MarketoCredentials): { baseUrl: string; tokenEndpoint?: string } {
    const normalizedInstance = credentials.baseUrl
      ? credentials.baseUrl.replace(/\/?rest\/?v?1?$/i, '')
      : credentials.instanceUrl
        ? credentials.instanceUrl.replace(/\/?rest\/?v?1?$/i, '')
        : credentials.munchkinId
          ? `https://${credentials.munchkinId}.mktorest.com`
          : undefined;

    if (!normalizedInstance) {
      throw new Error('Marketo integration requires either baseUrl, instanceUrl, or munchkinId');
    }

    const baseUrl = `${normalizedInstance.replace(/\/$/, '')}/rest/v1`;
    const identityBase = credentials.identityUrl?.replace(/\/$/, '') ?? `${normalizedInstance.replace(/\/$/, '')}/identity`;
    const tokenEndpoint = credentials.tokenUrl ?? `${identityBase}/oauth/token`;

    return { baseUrl, tokenEndpoint };
  }

  protected getAuthHeaders(): Record<string, string> {
    const token = this.credentials.accessToken;
    if (!token) {
      throw new Error('Marketo access token is required');
    }

    return {
      Authorization: `Bearer ${token}`,
    };
  }

  private parseExpiry(): number | undefined {
    const raw = (this.credentials as MarketoCredentials).expiresAt;
    if (!raw) return undefined;
    if (typeof raw === 'number') {
      return raw;
    }
    const parsed = Date.parse(raw);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  private async ensureAccessToken(): Promise<void> {
    const expiresAt = this.parseExpiry();
    const now = Date.now();
    if (!this.credentials.accessToken) {
      if (this.credentials.refreshToken) {
        await this.refreshAccessToken();
      } else {
        throw new Error('Marketo credentials missing access token');
      }
      return;
    }

    if (!expiresAt || expiresAt - now > this.refreshSkewMs) {
      return;
    }

    await this.refreshAccessToken();
  }

  private async refreshAccessToken(): Promise<void> {
    if (!this.credentials.refreshToken || !this.credentials.clientId || !this.credentials.clientSecret || !this.tokenEndpoint) {
      throw new Error('Marketo refresh requires refreshToken, clientId, clientSecret, and token endpoint');
    }

    if (!this.refreshPromise) {
      this.refreshPromise = (async () => {
        const body = new URLSearchParams({
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
          body,
        });

        if (!response.ok) {
          this.refreshPromise = undefined;
          throw new Error(`Marketo token refresh failed: ${response.status} ${response.statusText}`);
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
    headers: Record<string, string> = {}
  ): Promise<APIResponse<T>> {
    await this.ensureAccessToken();
    return super.makeRequest<T>(method, endpoint, data, headers);
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/leads.json?batchSize=1');
  }

  public async createLead(params: LeadInput & { action?: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['email']);
    const { action = 'createOrUpdate', ...lead } = params;

    return this.post('/leads.json', {
      action,
      lookupField: 'email',
      input: [this.buildLeadPayload(lead)],
    });
  }

  public async getLeadById(params: { id: string | number; fields?: string[] | string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['id']);
    const query = this.buildQueryString({ fields: this.serializeFields(params.fields) });
    return this.get(`/leads/${encodeURIComponent(String(params.id))}.json${query}`);
  }

  public async getLeadsByFilter(params: {
    filterType: string;
    filterValues: string | string[];
    fields?: string[] | string;
    batchSize?: number;
    nextPageToken?: string;
  }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['filterType', 'filterValues']);
    const query = this.buildQueryString({
      filterType: params.filterType,
      filterValues: Array.isArray(params.filterValues) ? params.filterValues.join(',') : params.filterValues,
      fields: this.serializeFields(params.fields),
      batchSize: params.batchSize,
      nextPageToken: params.nextPageToken,
    });
    return this.get(`/leads.json${query}`);
  }

  public async updateLead(params: LeadInput & { id: string | number }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['id']);
    const { id, ...lead } = params;
    return this.post('/leads.json', {
      action: 'updateOnly',
      lookupField: 'id',
      input: [this.buildLeadPayload({ ...lead, id })],
    });
  }

  public async deleteLead(params: { id: string | number }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['id']);
    return this.delete(`/leads/${encodeURIComponent(String(params.id))}.json`);
  }

  public async addToList(params: { listId: string | number; leadIds: Array<number | string> }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['listId', 'leadIds']);
    return this.post(`/lists/${encodeURIComponent(String(params.listId))}/leads.json`, {
      action: 'addToList',
      input: params.leadIds.map(id => ({ id })),
    });
  }

  public async removeFromList(params: { listId: string | number; leadIds: Array<number | string> }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['listId', 'leadIds']);
    return this.post(`/lists/${encodeURIComponent(String(params.listId))}/leads/remove.json`, {
      input: params.leadIds.map(id => ({ id })),
    });
  }

  public async createCampaign(params: {
    name: string;
    description?: string;
    programId?: number;
    type?: string;
    isActive?: boolean;
  }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['name']);
    return this.post('/campaigns.json', params);
  }

  public async getCampaigns(params: {
    programId?: number;
    isActive?: boolean;
    batchSize?: number;
    nextPageToken?: string;
  } = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString({
      programId: params.programId,
      isActive: params.isActive,
      batchSize: params.batchSize,
      nextPageToken: params.nextPageToken,
    });
    return this.get(`/campaigns.json${query}`);
  }

  public async requestCampaign(params: { campaignId: number; leads: CampaignRequest['leads']; tokens?: CampaignRequest['tokens'] }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['campaignId']);
    return this.post(`/campaigns/${encodeURIComponent(String(params.campaignId))}/trigger.json`, {
      input: params.leads ?? [],
      tokens: params.tokens ?? [],
    });
  }

  public async createEmail(params: Record<string, any>): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['name']);
    return this.post('/emails.json', params);
  }

  public async getEmails(params: {
    status?: string;
    folderId?: number;
    batchSize?: number;
    offset?: number;
  } = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString({
      status: params.status,
      folder: params.folderId,
      batchSize: params.batchSize,
      offset: params.offset,
    });
    return this.get(`/emails.json${query}`);
  }

  public async sendSampleEmail(params: { emailId: number; emailAddress?: string; textOnly?: boolean; leadId?: number }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['emailId']);
    return this.post(`/emails/${encodeURIComponent(String(params.emailId))}/sendSample.json`, {
      emailAddress: params.emailAddress,
      textOnly: params.textOnly,
      leadId: params.leadId,
    });
  }

  public async getPrograms(params: { status?: string; maxReturn?: number; offset?: number } = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString({
      status: params.status,
      maxReturn: params.maxReturn,
      offset: params.offset,
    });
    return this.get(`/programs.json${query}`);
  }

  public async createProgram(params: {
    name: string;
    description?: string;
    type?: string;
    channel?: string;
    folderId?: number;
    costs?: Array<{ startDate: string; cost: number; note?: string }>;
  }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['name']);
    return this.post('/programs.json', params);
  }

  private serializeFields(fields?: string[] | string): string | undefined {
    if (!fields) return undefined;
    return Array.isArray(fields) ? fields.join(',') : fields;
  }

  private buildLeadPayload(data: LeadInput): LeadInput {
    const payload: LeadInput = {};
    const allowedKeys: (keyof LeadInput)[] = [
      'id',
      'email',
      'firstName',
      'lastName',
      'company',
      'title',
      'phone',
      'website',
      'industry',
      'country',
      'state',
      'city',
      'address',
      'postalCode',
      'leadSource',
      'leadStatus',
      'leadScore',
      'partitionId',
    ];

    for (const key of allowedKeys) {
      if (data[key] !== undefined) {
        payload[key] = data[key];
      }
    }

    const extras = Object.entries(data).filter(([key]) => !allowedKeys.includes(key as keyof LeadInput));
    for (const [key, value] of extras) {
      if (value !== undefined) {
        payload[key] = value;
      }
    }

    return payload;
  }
}
