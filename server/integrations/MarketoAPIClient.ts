import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

export interface MarketoAPICredentials extends APICredentials {
  munchkinId?: string;
  baseUrl?: string;
  identityBaseUrl?: string;
  clientId?: string;
  clientSecret?: string;
  expiresAt?: number | string;
}

interface LeadPayload {
  email?: string;
  id?: number | string;
  partitionId?: number;
  [key: string]: any;
}

export class MarketoAPIClient extends BaseAPIClient {
  private readonly identityBaseUrl: string;
  private tokenExpiresAt?: number;

  constructor(credentials: MarketoAPICredentials) {
    const base = MarketoAPIClient.resolveBaseUrl(credentials);
    super(base, credentials);

    this.identityBaseUrl = MarketoAPIClient.resolveIdentityBaseUrl(credentials, base);
    this.tokenExpiresAt = credentials.expiresAt ? new Date(credentials.expiresAt).getTime() : undefined;

    this.registerHandlers({
      test_connection: this.testConnection.bind(this),
      create_lead: this.createLead.bind(this),
      get_lead_by_id: this.getLeadById.bind(this),
      get_leads_by_filter: this.getLeadsByFilter.bind(this),
      update_lead: this.updateLead.bind(this),
      delete_lead: this.deleteLead.bind(this),
      add_to_list: this.addToList.bind(this),
      remove_from_list: this.removeFromList.bind(this),
      create_campaign: this.createCampaign.bind(this),
      get_campaigns: this.getCampaigns.bind(this),
      request_campaign: this.requestCampaign.bind(this),
      create_email: this.createEmail.bind(this),
      get_emails: this.getEmails.bind(this),
      send_sample_email: this.sendSampleEmail.bind(this),
      get_programs: this.getPrograms.bind(this),
      create_program: this.createProgram.bind(this),
    });
  }

  private static resolveBaseUrl(credentials: MarketoAPICredentials): string {
    const explicit = credentials.baseUrl?.replace(/\/$/, '');
    if (explicit) {
      return explicit;
    }

    const munchkinId = credentials.munchkinId;
    if (!munchkinId) {
      throw new Error('Marketo integration requires either baseUrl or munchkinId');
    }
    return `https://${munchkinId}.mktorest.com`;
  }

  private static resolveIdentityBaseUrl(credentials: MarketoAPICredentials, base: string): string {
    const explicit = credentials.identityBaseUrl?.replace(/\/$/, '');
    if (explicit) {
      return explicit;
    }
    return `${base.replace(/\/$/, '')}/identity`;
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
      throw new Error('Marketo access token is missing. Ensure OAuth flow completed successfully.');
    }
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
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
    const clientId = this.credentials.clientId;
    const clientSecret = this.credentials.clientSecret;

    if (!clientId || !clientSecret) {
      if (!this.credentials.accessToken) {
        throw new Error('Marketo credentials missing clientId/clientSecret for token refresh.');
      }
      return;
    }

    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    });

    const url = `${this.identityBaseUrl}/oauth/token?${params.toString()}`;
    const response = await fetch(url, { method: 'GET' });
    if (!response.ok) {
      throw new Error(`Failed to refresh Marketo access token (HTTP ${response.status})`);
    }

    const payload = await response.json();
    const accessToken = payload?.access_token;
    if (!accessToken) {
      throw new Error('Marketo token response did not include access_token');
    }

    this.credentials.accessToken = accessToken;
    const expiresIn = Number(payload?.expires_in);
    this.tokenExpiresAt = Number.isFinite(expiresIn) ? Date.now() + expiresIn * 1000 : undefined;
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/rest/v1/leads.json?batchSize=1');
  }

  public async createLead(params: LeadPayload & { action?: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['email']);
    const { action = 'createOrUpdate', partitionId, ...rest } = params;
    const payload = {
      action,
      lookupField: 'email',
      input: [this.cleanLeadPayload({ ...rest, email: params.email, partitionId })],
    };
    return this.post('/rest/v1/leads.json', payload);
  }

  public async getLeadById(params: { id: number | string; fields?: string[] }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['id']);
    const query = this.buildQueryString({ fields: params.fields?.join(',') });
    return this.get(`/rest/v1/lead/${params.id}.json${query}`);
  }

  public async getLeadsByFilter(params: {
    filterType: string;
    filterValues: string[];
    fields?: string[];
    batchSize?: number;
    nextPageToken?: string;
  }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['filterType', 'filterValues']);
    const query = this.buildQueryString({
      filterType: params.filterType,
      filterValues: params.filterValues.join(','),
      fields: params.fields?.join(','),
      batchSize: params.batchSize,
      nextPageToken: params.nextPageToken,
    });
    return this.get(`/rest/v1/leads.json${query}`);
  }

  public async updateLead(params: LeadPayload): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['id']);
    const payload = {
      action: 'updateOnly',
      lookupField: 'id',
      input: [this.cleanLeadPayload(params)],
    };
    return this.post('/rest/v1/leads.json', payload);
  }

  public async deleteLead(params: { id: number | string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['id']);
    const payload = { input: [{ id: params.id }] };
    return this.post('/rest/v1/leads/delete.json', payload);
  }

  public async addToList(params: { listId: number | string; leadIds: Array<number | string> }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['listId', 'leadIds']);
    const payload = { input: params.leadIds.map(id => ({ id })) };
    return this.post(`/rest/v1/lists/${params.listId}/leads.json`, payload);
  }

  public async removeFromList(params: { listId: number | string; leadIds: Array<number | string> }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['listId', 'leadIds']);
    const searchParams = new URLSearchParams();
    params.leadIds.forEach(id => searchParams.append('id', String(id)));
    return this.delete(`/rest/v1/lists/${params.listId}/leads.json?${searchParams.toString()}`);
  }

  public async createCampaign(params: {
    name: string;
    description?: string;
    programId: number | string;
    type?: 'batch' | 'trigger';
    isActive?: boolean;
  }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['name', 'programId']);
    return this.post('/rest/v1/campaigns.json', this.removeEmpty(params));
  }

  public async getCampaigns(params: {
    programId?: number | string;
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
    return this.get(`/rest/v1/campaigns.json${query}`);
  }

  public async requestCampaign(params: {
    campaignId: number | string;
    leads: Array<{ id: number | string }>;
    tokens?: Array<{ name: string; value: string }>;
  }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['campaignId', 'leads']);
    const payload = {
      input: params.leads,
      tokens: params.tokens,
    };
    return this.post(`/rest/v1/campaigns/${params.campaignId}/trigger.json`, this.removeEmpty(payload));
  }

  public async createEmail(params: Record<string, any>): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['name', 'folderId']);
    return this.post('/rest/asset/v1/emails.json', this.removeEmpty(params));
  }

  public async getEmails(params: {
    status?: 'draft' | 'approved' | 'unapproved';
    folderId?: number | string;
    batchSize?: number;
    offset?: number;
  } = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString({
      status: params.status,
      folder: params.folderId,
      batchSize: params.batchSize,
      offset: params.offset,
    });
    return this.get(`/rest/asset/v1/emails.json${query}`);
  }

  public async sendSampleEmail(params: {
    emailId: number | string;
    emailAddress: string;
    textOnly?: boolean;
    leadId?: number | string;
  }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['emailId', 'emailAddress']);
    const payload = this.removeEmpty({
      emailAddress: params.emailAddress,
      textOnly: params.textOnly,
      leadId: params.leadId,
    });
    return this.post(`/rest/v1/emails/${params.emailId}/sendSample.json`, payload);
  }

  public async getPrograms(params: {
    status?: string;
    maxReturn?: number;
    offset?: number;
  } = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString({
      status: params.status,
      maxReturn: params.maxReturn,
      offset: params.offset,
    });
    return this.get(`/rest/asset/v1/programs.json${query}`);
  }

  public async createProgram(params: {
    name: string;
    description?: string;
    type: string;
    channel: string;
    folderId: number | string;
    costs?: Array<Record<string, any>>;
  }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['name', 'type', 'channel', 'folderId']);
    return this.post('/rest/asset/v1/programs.json', this.removeEmpty(params));
  }

  private cleanLeadPayload(payload: LeadPayload): Record<string, any> {
    const normalized = { ...payload };
    if (normalized.partitionId === undefined) {
      delete normalized.partitionId;
    }
    return this.removeEmpty(normalized);
  }

  private removeEmpty<T extends Record<string, any>>(payload: T): T {
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(payload)) {
      if (value !== undefined && value !== null) {
        cleaned[key] = value;
      }
    }
    return cleaned as T;
  }
}
