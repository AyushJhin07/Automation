import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

interface SendGridCredentials extends APICredentials {
  apiKey: string;
}

type Dictionary = Record<string, any>;

type Personalization = {
  to: Array<{ email: string; name?: string }>;
  cc?: Array<{ email: string; name?: string }>;
  bcc?: Array<{ email: string; name?: string }>;
  subject?: string;
  headers?: Dictionary;
  substitutions?: Dictionary;
  dynamic_template_data?: Dictionary;
  custom_args?: Dictionary;
  send_at?: number;
};

export class SendGridAPIClient extends BaseAPIClient {
  constructor(credentials: SendGridCredentials) {
    if (!credentials.apiKey) {
      throw new Error('SendGrid integration requires an API key');
    }
    super('https://api.sendgrid.com/v3', credentials);
  }

  protected getAuthHeaders(): Record<string, string> {
    const apiKey = this.credentials.apiKey;
    if (!apiKey) {
      throw new Error('SendGrid API key missing from credentials');
    }
    return { Authorization: `Bearer ${apiKey}` };
  }

  async testConnection(): Promise<APIResponse> {
    return this.get('/user/account');
  }

  async sendEmail(params: Dictionary): Promise<APIResponse> {
    this.validateRequiredParams(params, ['personalizations', 'from']);

    if (!Array.isArray(params.personalizations) || params.personalizations.length === 0) {
      throw new Error('SendGrid send_email requires at least one personalization entry');
    }

    if (!params.from?.email) {
      throw new Error('SendGrid send_email requires from.email');
    }

    const payload = {
      personalizations: (params.personalizations as Personalization[]).map(personalization =>
        this.removeEmpty({ ...personalization })
      ),
      from: params.from,
      reply_to: params.reply_to,
      reply_to_list: params.reply_to_list,
      subject: params.subject,
      content: params.content,
      attachments: params.attachments,
      template_id: params.template_id,
      headers: params.headers,
      categories: params.categories,
      custom_args: params.custom_args,
      send_at: params.send_at,
      batch_id: params.batch_id,
      asm: params.asm,
      ip_pool_name: params.ip_pool_name,
      mail_settings: params.mail_settings,
      tracking_settings: params.tracking_settings
    };

    return this.post('/mail/send', this.removeEmpty(payload));
  }

  async getEmailStats(params: Dictionary): Promise<APIResponse> {
    this.validateRequiredParams(params, ['start_date']);
    const endpoint = `/stats${this.buildQueryString(this.removeEmpty(params))}`;
    return this.get(endpoint);
  }

  async createContact(params: Dictionary): Promise<APIResponse> {
    this.validateRequiredParams(params, ['contacts']);
    return this.put('/marketing/contacts', this.removeEmpty(params));
  }

  async getLists(params: Dictionary = {}): Promise<APIResponse> {
    const endpoint = `/marketing/lists${this.buildQueryString(this.removeEmpty(params))}`;
    return this.get(endpoint);
  }

  async createList(params: Dictionary): Promise<APIResponse> {
    this.validateRequiredParams(params, ['name']);
    return this.post('/marketing/lists', this.removeEmpty(params));
  }

  async sendTestEmail(params: Dictionary): Promise<APIResponse> {
    this.validateRequiredParams(params, ['template_id', 'emails']);

    const versionId = params.version_id ?? 'draft';
    const endpoint = `/marketing/templates/${params.template_id}/versions/${versionId}/test`;
    const payload = this.removeEmpty({
      emails: params.emails,
      sender_id: params.sender_id
    });

    return this.post(endpoint, payload);
  }

  private removeEmpty<T extends Dictionary>(obj: T): T {
    const copy: Dictionary = {};
    for (const [key, value] of Object.entries(obj ?? {})) {
      if (value === undefined || value === null) {
        continue;
      }
      if (Array.isArray(value)) {
        const filtered = value
          .map(item => (typeof item === 'object' && item !== null ? this.removeEmpty(item as Dictionary) : item))
          .filter(item => {
            if (item === undefined || item === null) {
              return false;
            }
            if (typeof item === 'object' && Object.keys(item as Dictionary).length === 0) {
              return false;
            }
            return true;
          });
        if (filtered.length > 0) {
          copy[key] = filtered;
        }
        continue;
      }
      if (typeof value === 'object') {
        const nested = this.removeEmpty(value as Dictionary);
        if (Object.keys(nested).length > 0) {
          copy[key] = nested;
        }
        continue;
      }
      copy[key] = value;
    }
    return copy as T;
  }
}
