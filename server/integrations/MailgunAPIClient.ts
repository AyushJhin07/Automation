import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

export interface MailgunCredentials extends APICredentials {
  apiKey: string;
}

type Dictionary = Record<string, any>;

function encodeAddress(value: string): string {
  return encodeURIComponent(value);
}

function normalizeBoolean(value: any): string {
  return value ? 'true' : 'false';
}

export class MailgunAPIClient extends BaseAPIClient {
  constructor(credentials: MailgunCredentials) {
    if (!credentials.apiKey) {
      throw new Error('Mailgun integration requires an API key');
    }

    super('https://api.mailgun.net', credentials);
  }

  protected getAuthHeaders(): Record<string, string> {
    const apiKey = this.credentials.apiKey;
    if (!apiKey) {
      throw new Error('Mailgun integration requires an API key');
    }

    const token = Buffer.from(`api:${apiKey}`).toString('base64');
    return {
      Authorization: `Basic ${token}`
    };
  }

  public override updateCredentials(credentials: APICredentials): void {
    super.updateCredentials(credentials);
    if (credentials.apiKey) {
      this.credentials.apiKey = credentials.apiKey;
    }
  }

  async testConnection(): Promise<APIResponse> {
    return this.get('/v3/domains');
  }

  async sendEmail(params: Dictionary): Promise<APIResponse> {
    this.validateRequiredParams(params, ['domain', 'from', 'to']);
    if (params.attachment || params.inline) {
      throw new Error('Mailgun send_email currently does not support attachments in this environment');
    }

    const domain = params.domain;
    const payload = this.buildMessagePayload(params);
    return this.post(`/v3/${encodeURIComponent(domain)}/messages`, payload, {
      'Content-Type': 'application/x-www-form-urlencoded'
    });
  }

  async getDomain(params: Dictionary): Promise<APIResponse> {
    this.validateRequiredParams(params, ['domain']);
    return this.get(`/v3/domains/${encodeURIComponent(params.domain)}`);
  }

  async listDomains(params: Dictionary = {}): Promise<APIResponse> {
    const query = this.buildQueryString({
      limit: params.limit,
      skip: params.skip
    });
    return this.get(`/v3/domains${query}`);
  }

  async verifyDomain(params: Dictionary): Promise<APIResponse> {
    this.validateRequiredParams(params, ['domain']);
    return this.put(`/v3/domains/${encodeURIComponent(params.domain)}/verify`);
  }

  async createMailingList(params: Dictionary): Promise<APIResponse> {
    this.validateRequiredParams(params, ['address']);
    const payload = this.buildFormPayload(params, ['address', 'name', 'description', 'access_level']);
    return this.post('/v3/lists', payload, {
      'Content-Type': 'application/x-www-form-urlencoded'
    });
  }

  async getMailingList(params: Dictionary): Promise<APIResponse> {
    this.validateRequiredParams(params, ['address']);
    return this.get(`/v3/lists/${encodeAddress(params.address)}`);
  }

  async listMailingLists(params: Dictionary = {}): Promise<APIResponse> {
    const query = this.buildQueryString({
      limit: params.limit,
      skip: params.skip
    });
    return this.get(`/v3/lists${query}`);
  }

  async addMember(params: Dictionary): Promise<APIResponse> {
    this.validateRequiredParams(params, ['listAddress', 'address']);
    const { listAddress, upsert, ...rest } = params;
    const payload = this.buildFormPayload(rest, ['address', 'name', 'vars', 'subscribed']);
    const query = this.buildQueryString({ upsert });
    return this.post(`/v3/lists/${encodeAddress(listAddress)}/members${query}`, payload, {
      'Content-Type': 'application/x-www-form-urlencoded'
    });
  }

  async getMember(params: Dictionary): Promise<APIResponse> {
    this.validateRequiredParams(params, ['listAddress', 'memberAddress']);
    return this.get(
      `/v3/lists/${encodeAddress(params.listAddress)}/members/${encodeAddress(params.memberAddress)}`
    );
  }

  async validateEmail(params: Dictionary): Promise<APIResponse> {
    this.validateRequiredParams(params, ['address']);
    const query = this.buildQueryString({
      address: params.address,
      mailbox_verification:
        params.mailbox_verification !== undefined ? normalizeBoolean(params.mailbox_verification) : undefined
    });
    return this.get(`/v4/address/validate${query}`);
  }

  async getStats(params: Dictionary): Promise<APIResponse> {
    this.validateRequiredParams(params, ['domain']);
    const { domain, ...rest } = params;
    const query = this.buildQueryString(rest);
    return this.get(`/v3/${encodeURIComponent(domain)}/stats${query}`);
  }

  async getEvents(params: Dictionary): Promise<APIResponse> {
    this.validateRequiredParams(params, ['domain']);
    const { domain, ...rest } = params;
    const query = this.buildQueryString(rest);
    return this.get(`/v3/${encodeURIComponent(domain)}/events${query}`);
  }

  private buildMessagePayload(params: Dictionary): URLSearchParams {
    const form = new URLSearchParams();
    const multiValueKeys = new Set(['to', 'cc', 'bcc', 'tag']);
    const booleanKeys = new Set([
      'dkim',
      'testmode',
      'tracking',
      'tracking-clicks',
      'tracking-opens',
      'require-tls',
      'skip-verification'
    ]);

    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || key === 'domain') {
        continue;
      }

      if (multiValueKeys.has(key) && Array.isArray(value)) {
        form.append(key, value.join(', '));
        continue;
      }

      if (booleanKeys.has(key) && typeof value === 'boolean') {
        form.append(key, value ? 'yes' : 'no');
        continue;
      }

      if (Array.isArray(value)) {
        for (const item of value) {
          form.append(key, String(item));
        }
        continue;
      }

      if (typeof value === 'object') {
        form.append(key, JSON.stringify(value));
        continue;
      }

      form.append(key, String(value));
    }

    return form;
  }

  private buildFormPayload(params: Dictionary, allowedKeys: string[]): URLSearchParams {
    const form = new URLSearchParams();

    for (const key of allowedKeys) {
      const value = params[key];
      if (value === undefined || value === null) {
        continue;
      }

      if (typeof value === 'object' && !Array.isArray(value)) {
        form.append(key, JSON.stringify(value));
      } else if (Array.isArray(value)) {
        for (const item of value) {
          form.append(key, String(item));
        }
      } else if (typeof value === 'boolean') {
        form.append(key, value ? 'yes' : 'no');
      } else {
        form.append(key, String(value));
      }
    }

    return form;
  }
}
