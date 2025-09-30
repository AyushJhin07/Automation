import { Buffer } from 'buffer';
import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

export class MailgunAPIClient extends BaseAPIClient {
  private domain: string;
  private apiKey: string;

  constructor(credentials: APICredentials) {
    const apiKey = credentials.apiKey || credentials.token;
    const domain = credentials.domain;
    if (!apiKey || !domain) {
      throw new Error('Mailgun integration requires apiKey and domain');
    }
    super('https://api.mailgun.net/v3', credentials);
    this.apiKey = apiKey;
    this.domain = domain;

    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'send_email': this.sendEmail.bind(this) as any,
      'list_logs': this.listLogs.bind(this) as any,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const basic = Buffer.from(`api:${this.apiKey}`).toString('base64');
    return {
      Authorization: `Basic ${basic}`,
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/domains', this.getAuthHeaders());
  }

  public async sendEmail(params: { from: string; to: string | string[]; subject: string; text?: string; html?: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['from', 'to', 'subject']);
    const form = new URLSearchParams();
    form.set('from', params.from);
    (Array.isArray(params.to) ? params.to : [params.to]).forEach(value => form.append('to', value));
    form.set('subject', params.subject);
    if (params.text) form.set('text', params.text);
    if (params.html) form.set('html', params.html);

    const resp = await fetch(`${this.baseURL}/${this.domain}/messages`, {
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

  public async listLogs(params: { limit?: number } = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString({ limit: params.limit ?? 50 });
    return this.get(`/${this.domain}/events${query}`, this.getAuthHeaders());
  }
}

