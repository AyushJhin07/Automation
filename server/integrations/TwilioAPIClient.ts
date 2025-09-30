import { Buffer } from 'buffer';
import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

export class TwilioAPIClient extends BaseAPIClient {
  private accountSid: string;
  private authToken: string;

  constructor(credentials: APICredentials) {
    const accountSid = credentials.accountSid || credentials.clientId;
    const authToken = credentials.authToken || credentials.clientSecret;
    if (!accountSid || !authToken) {
      throw new Error('Twilio integration requires accountSid and authToken');
    }
    super(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}`, credentials);
    this.accountSid = accountSid;
    this.authToken = authToken;

    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'send_message': this.sendMessage.bind(this) as any,
      'send_sms': this.sendMessage.bind(this) as any,
      'list_messages': this.listMessages.bind(this) as any,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const basic = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');
    return {
      Authorization: `Basic ${basic}`,
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('.json', this.getAuthHeaders());
  }

  public async sendMessage(params: { to: string; from: string; body: string; mediaUrl?: string[] }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['to', 'from', 'body']);
    const form = new URLSearchParams({
      To: params.to,
      From: params.from,
      Body: params.body,
    });
    params.mediaUrl?.forEach(url => form.append('MediaUrl', url));

    const resp = await fetch(`${this.baseURL}/Messages.json`, {
      method: 'POST',
      headers: {
        ...this.getAuthHeaders(),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: form.toString()
    });
    const data = await resp.json().catch(() => ({}));
    return resp.ok ? { success: true, data } : { success: false, error: data?.message || `HTTP ${resp.status}` };
  }

  public async listMessages(params: { to?: string; from?: string; pageSize?: number } = {}): Promise<APIResponse<any>> {
    const query = new URLSearchParams();
    if (params.to) query.set('To', params.to);
    if (params.from) query.set('From', params.from);
    if (params.pageSize) query.set('PageSize', String(params.pageSize));
    const resp = await fetch(`${this.baseURL}/Messages.json?${query.toString()}`, {
      headers: this.getAuthHeaders()
    });
    const data = await resp.json().catch(() => ({}));
    return resp.ok ? { success: true, data } : { success: false, error: data?.message || `HTTP ${resp.status}` };
  }
}
