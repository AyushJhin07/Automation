import { createHash } from 'crypto';
import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

export class MailchimpAPIClient extends BaseAPIClient {
  private apiKey?: string;
  private dc?: string;

  constructor(credentials: APICredentials) {
    const apiKey = credentials.apiKey || credentials.key;
    const dc = credentials.dataCenter || (apiKey ? apiKey.split('-')[1] : undefined);
    if (!credentials.accessToken && (!apiKey || !dc)) {
      throw new Error('Mailchimp integration requires either accessToken or apiKey with data center');
    }
    const baseUrl = `https://${(credentials.dataCenter || dc || '').toLowerCase()}.api.mailchimp.com/3.0`;
    super(baseUrl, credentials);
    this.apiKey = apiKey;
    this.dc = dc;

    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'create_member': this.createMember.bind(this) as any,
      'add_member': this.createMember.bind(this) as any,
      'add_subscriber': this.createMember.bind(this) as any,
      'update_member': this.updateMember.bind(this) as any,
      'update_subscriber': this.updateMember.bind(this) as any,
      'add_member_tag': this.addMemberTag.bind(this) as any,
      'add_subscriber_tag': this.addMemberTag.bind(this) as any,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    if (this.credentials.accessToken) {
      return {
        Authorization: `Bearer ${this.credentials.accessToken}`,
        'Content-Type': 'application/json'
      };
    }
    const token = this.apiKey ?? '';
    const basic = Buffer.from(`anystring:${token}`).toString('base64');
    return {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/json'
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/', this.getAuthHeaders());
  }

  public async createMember(params: { listId: string; emailAddress: string; status?: 'subscribed' | 'unsubscribed' | 'pending' | 'cleaned'; mergeFields?: Record<string, any>; tags?: string[] }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['listId', 'emailAddress']);
    return this.post(`/lists/${params.listId}/members`, {
      email_address: params.emailAddress,
      status: params.status ?? 'subscribed',
      merge_fields: params.mergeFields,
      tags: params.tags,
    }, this.getAuthHeaders());
  }

  public async updateMember(params: { listId: string; emailAddress: string; updates: Record<string, any> }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['listId', 'emailAddress', 'updates']);
    const hash = this.hashEmail(params.emailAddress);
    return this.patch(`/lists/${params.listId}/members/${hash}`, params.updates, this.getAuthHeaders());
  }

  public async addMemberTag(params: { listId: string; emailAddress: string; tags: string[] }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['listId', 'emailAddress', 'tags']);
    const hash = this.hashEmail(params.emailAddress);
    return this.post(`/lists/${params.listId}/members/${hash}/tags`, {
      tags: params.tags.map(name => ({ name, status: 'active' }))
    }, this.getAuthHeaders());
  }

  private hashEmail(email: string): string {
    return createHash('md5').update(email.trim().toLowerCase()).digest('hex');
  }
}
