import { BaseAPIClient, APICredentials, APIResponse } from './BaseAPIClient';

export interface HubspotCredentials extends APICredentials {
  accessToken: string;
}

interface ContactParams {
  properties: Record<string, any>;
}

interface UpdateContactParams extends ContactParams {
  contactId: string;
}

interface DealParams {
  properties: Record<string, any>;
}

interface UpdateDealParams extends DealParams {
  dealId: string;
}

interface SearchContactsParams {
  filterGroups?: any[];
  limit?: number;
  after?: string;
}

/**
 * HubSpot CRM v3 client for core objects (contacts & deals) used in the manifest.
 */
export class HubspotAPIClient extends BaseAPIClient {
  constructor(credentials: HubspotCredentials) {
    if (!credentials?.accessToken) {
      throw new Error('HubSpot integration requires an OAuth access token');
    }

    super('https://api.hubapi.com', credentials);
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.credentials.accessToken}`
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/crm/v3/owners?limit=1');
  }

  public async createContact(params: ContactParams): Promise<APIResponse<any>> {
    return this.post('/crm/v3/objects/contacts', { properties: params.properties });
  }

  public async updateContact(params: UpdateContactParams): Promise<APIResponse<any>> {
    return this.patch(`/crm/v3/objects/contacts/${encodeURIComponent(params.contactId)}`, {
      properties: params.properties
    });
  }

  public async searchContacts(params: SearchContactsParams): Promise<APIResponse<any>> {
    return this.post('/crm/v3/objects/contacts/search', this.clean({
      filterGroups: params.filterGroups,
      limit: params.limit,
      after: params.after
    }));
  }

  public async createDeal(params: DealParams): Promise<APIResponse<any>> {
    return this.post('/crm/v3/objects/deals', { properties: params.properties });
  }

  public async updateDeal(params: UpdateDealParams): Promise<APIResponse<any>> {
    return this.patch(`/crm/v3/objects/deals/${encodeURIComponent(params.dealId)}`, {
      properties: params.properties
    });
  }

  public async contactCreated(params: { limit?: number; after?: string }): Promise<APIResponse<any>> {
    return this.get(`/crm/v3/objects/contacts?${this.toQuery(params)}`);
  }

  public async dealStageChanged(params: { limit?: number; after?: string }): Promise<APIResponse<any>> {
    return this.get(`/crm/v3/objects/deals?${this.toQuery(params)}`);
  }

  private toQuery(params: Record<string, any> = {}): string {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        searchParams.set(key, String(value));
      }
    });
    if (!searchParams.has('limit')) {
      searchParams.set('limit', '100');
    }
    return searchParams.toString();
  }

  private clean<T extends Record<string, any>>(value: T): T {
    return Object.fromEntries(
      Object.entries(value).filter(([, v]) => v !== undefined && v !== null)
    ) as T;
  }
}
