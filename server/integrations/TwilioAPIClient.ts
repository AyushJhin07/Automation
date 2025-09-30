import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

export interface TwilioCredentials extends APICredentials {
  accountSid: string;
  authToken: string;
}

type Dictionary = Record<string, any>;

function toTwilioParamName(key: string): string {
  return key
    .split('_')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function appendFormValue(form: URLSearchParams, key: string, value: any): void {
  if (value === undefined || value === null) {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      appendFormValue(form, key, item);
    }
    return;
  }

  if (value instanceof Date) {
    form.append(key, value.toISOString());
    return;
  }

  if (typeof value === 'object') {
    form.append(key, JSON.stringify(value));
    return;
  }

  form.append(key, String(value));
}

export class TwilioAPIClient extends BaseAPIClient {
  private accountSid: string;
  private authToken: string;

  constructor(credentials: TwilioCredentials) {
    if (!credentials.accountSid || !credentials.authToken) {
      throw new Error('Twilio integration requires accountSid and authToken credentials');
    }

    super('https://api.twilio.com/2010-04-01', credentials);
    this.accountSid = credentials.accountSid;
    this.authToken = credentials.authToken;
  }

  protected getAuthHeaders(): Record<string, string> {
    const token = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');
    return { Authorization: `Basic ${token}` };
  }

  public override updateCredentials(credentials: APICredentials): void {
    super.updateCredentials(credentials);
    if (credentials.accountSid) {
      this.accountSid = credentials.accountSid;
    }
    if (credentials.authToken) {
      this.authToken = credentials.authToken;
    }
  }

  private buildAccountPath(accountSid: string | undefined, resourcePath: string): string {
    const sid = accountSid ?? this.accountSid;
    return `/Accounts/${sid}${resourcePath}`;
  }

  private buildFormPayload(params: Dictionary): URLSearchParams {
    const form = new URLSearchParams();
    for (const [key, value] of Object.entries(params ?? {})) {
      if (key === 'account_sid') {
        continue;
      }

      appendFormValue(form, toTwilioParamName(key), value);
    }
    return form;
  }

  private buildQueryStringFromParams(params: Dictionary): string {
    const query: Record<string, any> = {};
    for (const [key, value] of Object.entries(params ?? {})) {
      if (key === 'account_sid' || value === undefined || value === null) {
        continue;
      }
      if (Array.isArray(value)) {
        query[toTwilioParamName(key)] = value.join(',');
      } else if (value instanceof Date) {
        query[toTwilioParamName(key)] = value.toISOString();
      } else {
        query[toTwilioParamName(key)] = value;
      }
    }
    return this.buildQueryString(query);
  }

  async testConnection(): Promise<APIResponse> {
    return this.get(this.buildAccountPath(undefined, '.json'));
  }

  async sendSms(params: Dictionary): Promise<APIResponse> {
    this.validateRequiredParams(params, ['to', 'body']);
    if (!params.from && !params.messaging_service_sid) {
      throw new Error('Twilio send_sms requires either a from number or messaging_service_sid');
    }

    const accountSid = params.account_sid ?? this.accountSid;
    const payload = this.buildFormPayload(params);
    return this.post(
      this.buildAccountPath(accountSid, '/Messages.json'),
      payload,
      { 'Content-Type': 'application/x-www-form-urlencoded' }
    );
  }

  async sendMms(params: Dictionary): Promise<APIResponse> {
    return this.sendSms(params);
  }

  async makeCall(params: Dictionary): Promise<APIResponse> {
    this.validateRequiredParams(params, ['to', 'from']);

    if (!params.url && !params.twiml && !params.application_sid) {
      throw new Error('Twilio make_call requires url, twiml, or application_sid to be provided');
    }

    const accountSid = params.account_sid ?? this.accountSid;
    const payload = this.buildFormPayload(params);
    return this.post(
      this.buildAccountPath(accountSid, '/Calls.json'),
      payload,
      { 'Content-Type': 'application/x-www-form-urlencoded' }
    );
  }

  async getMessage(params: Dictionary): Promise<APIResponse> {
    this.validateRequiredParams(params, ['sid']);
    const accountSid = params.account_sid ?? this.accountSid;
    return this.get(this.buildAccountPath(accountSid, `/Messages/${params.sid}.json`));
  }

  async listMessages(params: Dictionary = {}): Promise<APIResponse> {
    const accountSid = params.account_sid ?? this.accountSid;
    const endpoint = `${this.buildAccountPath(accountSid, '/Messages.json')}${this.buildQueryStringFromParams(params)}`;
    return this.get(endpoint);
  }

  async getCall(params: Dictionary): Promise<APIResponse> {
    this.validateRequiredParams(params, ['sid']);
    const accountSid = params.account_sid ?? this.accountSid;
    return this.get(this.buildAccountPath(accountSid, `/Calls/${params.sid}.json`));
  }

  async listCalls(params: Dictionary = {}): Promise<APIResponse> {
    const accountSid = params.account_sid ?? this.accountSid;
    const endpoint = `${this.buildAccountPath(accountSid, '/Calls.json')}${this.buildQueryStringFromParams(params)}`;
    return this.get(endpoint);
  }

  async updateCall(params: Dictionary): Promise<APIResponse> {
    this.validateRequiredParams(params, ['sid']);
    const accountSid = params.account_sid ?? this.accountSid;
    const payload = this.buildFormPayload(params);
    return this.post(
      this.buildAccountPath(accountSid, `/Calls/${params.sid}.json`),
      payload,
      { 'Content-Type': 'application/x-www-form-urlencoded' }
    );
  }

  async buyPhoneNumber(params: Dictionary): Promise<APIResponse> {
    this.validateRequiredParams(params, ['phone_number']);
    const accountSid = params.account_sid ?? this.accountSid;
    const payload = this.buildFormPayload(params);
    return this.post(
      this.buildAccountPath(accountSid, '/IncomingPhoneNumbers.json'),
      payload,
      { 'Content-Type': 'application/x-www-form-urlencoded' }
    );
  }

  async listPhoneNumbers(params: Dictionary = {}): Promise<APIResponse> {
    const accountSid = params.account_sid ?? this.accountSid;
    const endpoint = `${this.buildAccountPath(accountSid, '/IncomingPhoneNumbers.json')}${this.buildQueryStringFromParams(params)}`;
    return this.get(endpoint);
  }
}
