import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

export interface Dynamics365Credentials extends APICredentials {
  /**
   * Fully qualified organization URL, e.g. https://contoso.crm.dynamics.com
   */
  organizationUrl?: string;
  /**
   * Alternative aliases supported by existing credential payloads.
   */
  instanceUrl?: string;
  environmentUrl?: string;
  resourceUrl?: string;
  baseUrl?: string;
}

export interface CreateAccountInput {
  name: string;
  accountnumber?: string;
  telephone1?: string;
  emailaddress1?: string;
  websiteurl?: string;
  address1_line1?: string;
  address1_city?: string;
  address1_stateorprovince?: string;
  address1_postalcode?: string;
  address1_country?: string;
  industrycode?: number;
  revenue?: number;
  numberofemployees?: number;
  description?: string;
}

export interface UpdateAccountInput extends Partial<CreateAccountInput> {
  accountid: string;
}

export interface ListAccountsInput {
  $select?: string;
  $filter?: string;
  $orderby?: string;
  $top?: number;
  $skip?: number;
  $expand?: string;
}

export interface GetAccountInput {
  accountid: string;
  $select?: string;
  $expand?: string;
}

export interface CreateContactInput {
  firstname?: string;
  lastname: string;
  emailaddress1?: string;
  telephone1?: string;
  mobilephone?: string;
  jobtitle?: string;
  'parentcustomerid_account@odata.bind'?: string;
  address1_line1?: string;
  address1_city?: string;
  address1_stateorprovince?: string;
  address1_postalcode?: string;
  address1_country?: string;
  description?: string;
}

export interface CreateLeadInput {
  firstname?: string;
  lastname: string;
  subject: string;
  emailaddress1?: string;
  telephone1?: string;
  mobilephone?: string;
  companyname?: string;
  jobtitle?: string;
  industrycode?: number;
  revenue?: number;
  numberofemployees?: number;
  leadqualitycode?: number;
  leadsourcecode?: number;
  description?: string;
}

export interface CreateOpportunityInput {
  name: string;
  estimatedvalue?: number;
  estimatedclosedate?: string;
  closeprobability?: number;
  'parentaccountid@odata.bind'?: string;
  'parentcontactid@odata.bind'?: string;
  salesstage?: number;
  stepname?: string;
  description?: string;
}

export interface AccountCreatedTriggerInput {
  industrycode?: number;
  since?: string;
}

export interface LeadTriggerInput {
  since?: string;
}

export interface OpportunityWonTriggerInput {
  since?: string;
}

export class Dynamics365APIClient extends BaseAPIClient {
  private readonly organizationUrl: string;

  constructor(credentials: Dynamics365Credentials) {
    const organizationUrl = Dynamics365APIClient.resolveOrganizationUrl(credentials);
    const baseUrl = `${organizationUrl.replace(/\/$/, '')}/api/data/v9.2`;
    super(baseUrl, credentials);
    this.organizationUrl = organizationUrl.replace(/\/$/, '');

    this.registerAliasHandlers({
      test_connection: 'testConnection',
      create_account: 'createAccount',
      get_account: 'getAccount',
      update_account: 'updateAccount',
      list_accounts: 'listAccounts',
      create_contact: 'createContact',
      create_lead: 'createLead',
      create_opportunity: 'createOpportunity',
      account_created: 'pollAccountCreated',
      lead_created: 'pollLeadCreated',
      opportunity_won: 'pollOpportunityWon'
    });
  }

  private static resolveOrganizationUrl(credentials: Dynamics365Credentials): string {
    const candidate =
      credentials.organizationUrl ||
      credentials.instanceUrl ||
      credentials.environmentUrl ||
      credentials.resourceUrl ||
      credentials.baseUrl;

    if (!candidate) {
      throw new Error('Dynamics 365 integration requires an organizationUrl/instanceUrl credential');
    }
    return candidate;
  }

  protected getAuthHeaders(): Record<string, string> {
    const token = this.credentials.accessToken;
    if (!token) {
      throw new Error('Dynamics 365 integration requires an access token');
    }

    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
      Accept: 'application/json',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0'
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    const response = await this.get<{ UserId: string; BusinessUnitId: string }>(
      '/WhoAmI?$select=UserId,BusinessUnitId'
    );

    if (!response.success) {
      return response;
    }

    return {
      success: true,
      data: {
        status: 'connected',
        userId: response.data?.UserId,
        businessUnitId: response.data?.BusinessUnitId,
        organizationUrl: this.organizationUrl
      }
    };
  }

  public async createAccount(params: CreateAccountInput): Promise<APIResponse<any>> {
    const payload = this.sanitizeBody(params);
    return this.post('/accounts', payload, { Prefer: 'return=representation' });
  }

  public async updateAccount(params: UpdateAccountInput): Promise<APIResponse<any>> {
    const { accountid, ...updates } = params;
    const payload = this.sanitizeBody(updates);
    if (Object.keys(payload).length === 0) {
      return { success: true, data: { accountid, updated: false } };
    }

    const response = await this.patch(
      `/accounts(${this.ensureGuid(accountid)})`,
      payload,
      { 'If-Match': '*' }
    );

    if (!response.success) {
      return response;
    }

    return this.getAccount({ accountid });
  }

  public async getAccount(params: GetAccountInput): Promise<APIResponse<any>> {
    const { accountid, ...query } = params;
    const path = `/accounts(${this.ensureGuid(accountid)})${this.buildQueryString(query)}`;
    return this.get(path, { Prefer: 'odata.include-annotations="*"' });
  }

  public async listAccounts(params: ListAccountsInput = {}): Promise<APIResponse<any>> {
    const defaults: ListAccountsInput = {
      $orderby: params.$orderby || 'createdon desc',
      $top: params.$top ?? 50
    };

    return this.listCollection('accounts', { ...defaults, ...params });
  }

  public async createContact(params: CreateContactInput): Promise<APIResponse<any>> {
    const payload = this.sanitizeBody(params);
    return this.post('/contacts', payload, { Prefer: 'return=representation' });
  }

  public async createLead(params: CreateLeadInput): Promise<APIResponse<any>> {
    const payload = this.sanitizeBody(params);
    return this.post('/leads', payload, { Prefer: 'return=representation' });
  }

  public async createOpportunity(params: CreateOpportunityInput): Promise<APIResponse<any>> {
    const payload = this.sanitizeBody({
      ...params,
      estimatedclosedate: this.normalizeDate(params.estimatedclosedate)
    });
    return this.post('/opportunities', payload, { Prefer: 'return=representation' });
  }

  public async pollAccountCreated(
    params: AccountCreatedTriggerInput = {}
  ): Promise<APIResponse<any>> {
    const filters: string[] = [];
    if (typeof params.industrycode === 'number') {
      filters.push(`industrycode eq ${params.industrycode}`);
    }
    const sinceFilter = this.sinceFilter('createdon', params.since);
    if (sinceFilter) {
      filters.push(sinceFilter);
    }

    return this.listCollection('accounts', {
      $select: 'accountid,name,createdon,industrycode',
      $orderby: 'createdon desc',
      $filter: this.joinFilters(filters),
      $top: 50
    });
  }

  public async pollLeadCreated(params: LeadTriggerInput = {}): Promise<APIResponse<any>> {
    const filters: string[] = [];
    const sinceFilter = this.sinceFilter('createdon', params.since);
    if (sinceFilter) {
      filters.push(sinceFilter);
    }

    return this.listCollection('leads', {
      $select: 'leadid,subject,fullname,createdon,statuscode',
      $orderby: 'createdon desc',
      $filter: this.joinFilters(filters),
      $top: 50
    });
  }

  public async pollOpportunityWon(
    params: OpportunityWonTriggerInput = {}
  ): Promise<APIResponse<any>> {
    const filters: string[] = ['statecode eq 1'];
    const sinceFilter = this.sinceFilter('actualclosedate', params.since);
    if (sinceFilter) {
      filters.push(sinceFilter);
    }

    return this.listCollection('opportunities', {
      $select: 'opportunityid,name,actualvalue,actualclosedate,statecode,statuscode',
      $orderby: 'actualclosedate desc',
      $filter: this.joinFilters(filters),
      $top: 50
    });
  }

  private sanitizeBody<T extends Record<string, any>>(body: T): T {
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(body)) {
      if (value === undefined || value === null) {
        continue;
      }
      cleaned[key] = value;
    }
    return cleaned as T;
  }

  private ensureGuid(id: string): string {
    if (!id) {
      throw new Error('Dynamics 365 record id is required');
    }
    const trimmed = id.trim();
    if (/^\{?[0-9a-fA-F-]{36}\}?$/.test(trimmed)) {
      return trimmed.replace(/^[{]/, '').replace(/[}]$/, '');
    }
    return trimmed;
  }

  private buildQueryString(params: Record<string, unknown>): string {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === '') {
        continue;
      }
      search.append(key, String(value));
    }
    const query = search.toString();
    return query ? `?${query}` : '';
  }

  private joinFilters(filters: string[]): string | undefined {
    const joined = filters.filter(Boolean).join(' and ');
    return joined.length ? joined : undefined;
  }

  private normalizeDate(input?: string): string | undefined {
    if (!input) return undefined;
    const date = new Date(input);
    if (Number.isNaN(date.getTime())) {
      return input;
    }
    return date.toISOString();
  }

  private sinceFilter(field: string, since?: string): string | undefined {
    const value = this.normalizeDate(since);
    if (!value) return undefined;
    return `${field} ge ${value}`;
  }

  private async listCollection(
    entity: string,
    query: Record<string, unknown>
  ): Promise<APIResponse<any>> {
    const path = `/${entity}${this.buildQueryString(query)}`;
    return this.get(path, { Prefer: 'odata.include-annotations="*"' });
  }
}
