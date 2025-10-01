import { BaseAPIClient, APICredentials, APIResponse } from './BaseAPIClient';
import { createHash } from 'crypto';

export interface MailchimpCredentials extends APICredentials {
  apiKey: string;
  dataCenter?: string;
}

interface ListIdentifier {
  listId: string;
}

interface MemberIdentifier extends ListIdentifier {
  email: string;
}

interface CampaignIdentifier {
  campaignId: string;
}

/**
 * Mailchimp marketing API client supporting list, member, and campaign management.
 */
export class MailchimpAPIClient extends BaseAPIClient {
  private readonly authHeader: string;

  constructor(credentials: MailchimpCredentials) {
    const dataCenter = credentials.dataCenter ?? extractDataCenter(credentials.apiKey);
    if (!credentials.apiKey || !dataCenter) {
      throw new Error('Mailchimp integration requires an API key with a data center suffix (e.g. key-us1)');
    }

    const baseURL = `https://${dataCenter}.api.mailchimp.com/3.0`;
    super(baseURL, credentials);
    this.authHeader = `Basic ${Buffer.from(`anystring:${credentials.apiKey}`).toString('base64')}`;
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      Authorization: this.authHeader
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/');
  }

  public async getLists(params: { count?: number; offset?: number } = {}): Promise<APIResponse<any>> {
    return this.get(`/lists${this.toQuery(params)}`);
  }

  public async getList(params: ListIdentifier): Promise<APIResponse<any>> {
    return this.get(`/lists/${params.listId}`);
  }

  public async createList(params: Record<string, any>): Promise<APIResponse<any>> {
    return this.post('/lists', params);
  }

  public async addMember(params: MemberIdentifier & { status?: string; merge_fields?: Record<string, any>; tags?: string[] }): Promise<APIResponse<any>> {
    const payload = {
      email_address: params.email,
      status: params.status ?? 'subscribed',
      merge_fields: params.merge_fields,
      tags: params.tags
    };
    return this.post(`/lists/${params.listId}/members`, payload);
  }

  public async getMember(params: MemberIdentifier): Promise<APIResponse<any>> {
    return this.get(`/lists/${params.listId}/members/${memberHash(params.email)}`);
  }

  public async updateMember(params: MemberIdentifier & { status?: string; merge_fields?: Record<string, any>; tags?: string[] }): Promise<APIResponse<any>> {
    const payload = this.clean({
      status: params.status,
      merge_fields: params.merge_fields,
      tags: params.tags
    });
    return this.patch(`/lists/${params.listId}/members/${memberHash(params.email)}`, payload);
  }

  public async deleteMember(params: MemberIdentifier): Promise<APIResponse<any>> {
    return this.delete(`/lists/${params.listId}/members/${memberHash(params.email)}`);
  }

  public async getMembers(params: ListIdentifier & { count?: number; offset?: number; status?: string }): Promise<APIResponse<any>> {
    return this.get(`/lists/${params.listId}/members${this.toQuery({ count: params.count, offset: params.offset, status: params.status })}`);
  }

  public async createCampaign(params: Record<string, any>): Promise<APIResponse<any>> {
    return this.post('/campaigns', params);
  }

  public async getCampaigns(params: { count?: number; offset?: number; status?: string } = {}): Promise<APIResponse<any>> {
    return this.get(`/campaigns${this.toQuery(params)}`);
  }

  public async sendCampaign(params: CampaignIdentifier): Promise<APIResponse<any>> {
    return this.post(`/campaigns/${params.campaignId}/actions/send`, {});
  }

  public async getCampaignContent(params: CampaignIdentifier): Promise<APIResponse<any>> {
    return this.get(`/campaigns/${params.campaignId}/content`);
  }

  public async setCampaignContent(params: CampaignIdentifier & { template?: Record<string, any>; html?: string; plain_text?: string }): Promise<APIResponse<any>> {
    const payload = this.clean({
      template: params.template,
      html: params.html,
      plain_text: params.plain_text
    });
    return this.put(`/campaigns/${params.campaignId}/content`, payload);
  }

  public async subscriberAdded(params: ListIdentifier & { count?: number; offset?: number }): Promise<APIResponse<any>> {
    return this.getMembers({ ...params, status: 'subscribed' });
  }

  public async subscriberUpdated(params: ListIdentifier & { count?: number; offset?: number }): Promise<APIResponse<any>> {
    return this.getMembers({ ...params });
  }

  public async subscriberUnsubscribed(params: ListIdentifier & { count?: number; offset?: number }): Promise<APIResponse<any>> {
    return this.getMembers({ ...params, status: 'unsubscribed' });
  }

  public async campaignSent(params: { count?: number; offset?: number }): Promise<APIResponse<any>> {
    return this.getCampaigns({ ...params, status: 'sent' });
  }

  private async put(endpoint: string, data: any): Promise<APIResponse<any>> {
    return this.makeRequest('PUT', endpoint, data);
  }

  private clean<T extends Record<string, any>>(value: T): T {
    return Object.fromEntries(
      Object.entries(value).filter(([, v]) => v !== undefined && v !== null)
    ) as T;
  }

  private toQuery(params: Record<string, any>): string {
    const usp = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        usp.set(key, String(value));
      }
    });
    const qs = usp.toString();
    return qs ? `?${qs}` : '';
  }
}

function extractDataCenter(apiKey: string | undefined): string | undefined {
  if (!apiKey) return undefined;
  const parts = apiKey.split('-');
  return parts.length === 2 ? parts[1] : undefined;
}

function memberHash(email: string): string {
  return createHashValue(email.trim().toLowerCase());
}

function createHashValue(value: string): string {
  return createHash('md5').update(value).digest('hex');
}
