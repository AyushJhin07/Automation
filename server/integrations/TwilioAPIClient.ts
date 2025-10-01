import { BaseAPIClient, APICredentials, APIResponse } from './BaseAPIClient';
import { getErrorMessage } from '../types/common';

export interface TwilioCredentials extends APICredentials {
  accountSid: string;
  authToken: string;
}

interface SendMessageParams {
  to: string;
  from?: string;
  body: string;
  media_url?: string;
  messaging_service_sid?: string;
  status_callback?: string;
  status_callback_method?: 'GET' | 'POST';
  application_sid?: string;
  max_price?: string;
  provide_feedback?: boolean;
  attempt?: number;
  validity_period?: number;
  force_delivery?: boolean;
  content_retention?: 'retain' | 'discard';
  address_retention?: 'retain' | 'discard';
  smart_encoded?: boolean;
  persistent_action?: string[];
  shorten_urls?: boolean;
  schedule_type?: string;
  send_at?: string;
  send_as_mms?: boolean;
  content_variables?: Record<string, any>;
}

interface CallParams {
  to: string;
  from: string;
  url: string;
  method?: 'GET' | 'POST';
  status_callback?: string;
}

interface ListQuery {
  pageSize?: number;
  pageToken?: string;
  dateSent?: string;
  from?: string;
  to?: string;
  status?: string;
  direction?: string;
}

/**
 * Twilio REST client built directly on top of the HTTP API.
 */
export class TwilioAPIClient extends BaseAPIClient {
  constructor(credentials: TwilioCredentials) {
    if (!credentials?.accountSid || !credentials?.authToken) {
      throw new Error('Twilio integration requires accountSid and authToken');
    }

    super('https://api.twilio.com/2010-04-01', credentials);
  }

  protected getAuthHeaders(): Record<string, string> {
    const token = Buffer.from(`${this.credentials.accountSid}:${this.credentials.authToken}`).toString('base64');
    return {
      Authorization: `Basic ${token}`
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get(`/Accounts/${this.credentials.accountSid}.json`);
  }

  public async sendSms(params: SendMessageParams): Promise<APIResponse<any>> {
    return this.sendMessage(params);
  }

  public async sendMms(params: SendMessageParams & { media_url: string }): Promise<APIResponse<any>> {
    return this.sendMessage({ ...params, send_as_mms: true });
  }

  public async makeCall(params: CallParams): Promise<APIResponse<any>> {
    return this.formRequest('POST', `/Accounts/${this.credentials.accountSid}/Calls.json`, {
      To: params.to,
      From: params.from,
      Url: params.url,
      Method: params.method,
      StatusCallback: params.status_callback
    });
  }

  public async getMessage(params: { message_sid: string }): Promise<APIResponse<any>> {
    return this.get(`/Accounts/${this.credentials.accountSid}/Messages/${params.message_sid}.json`);
  }

  public async listMessages(params: ListQuery = {}): Promise<APIResponse<any>> {
    const query = this.cleanQuery({
      PageSize: params.pageSize,
      PageToken: params.pageToken,
      DateSent: params.dateSent,
      From: params.from,
      To: params.to,
      Status: params.status,
      Direction: params.direction
    });
    return this.get(`/Accounts/${this.credentials.accountSid}/Messages.json${this.toQuery(query)}`);
  }

  public async getCall(params: { call_sid: string }): Promise<APIResponse<any>> {
    return this.get(`/Accounts/${this.credentials.accountSid}/Calls/${params.call_sid}.json`);
  }

  public async listCalls(params: ListQuery = {}): Promise<APIResponse<any>> {
    const query = this.cleanQuery({
      PageSize: params.pageSize,
      PageToken: params.pageToken,
      From: params.from,
      To: params.to,
      Status: params.status,
      Direction: params.direction
    });
    return this.get(`/Accounts/${this.credentials.accountSid}/Calls.json${this.toQuery(query)}`);
  }

  public async updateCall(params: { call_sid: string; url?: string; status?: string }): Promise<APIResponse<any>> {
    return this.formRequest('POST', `/Accounts/${this.credentials.accountSid}/Calls/${params.call_sid}.json`, {
      Url: params.url,
      Status: params.status
    });
  }

  public async buyPhoneNumber(params: { phone_number?: string; area_code?: string; friendly_name?: string }): Promise<APIResponse<any>> {
    return this.formRequest('POST', `/Accounts/${this.credentials.accountSid}/IncomingPhoneNumbers.json`, {
      PhoneNumber: params.phone_number,
      AreaCode: params.area_code,
      FriendlyName: params.friendly_name
    });
  }

  public async listPhoneNumbers(params: { phone_number?: string; friendly_name?: string } = {}): Promise<APIResponse<any>> {
    const query = this.cleanQuery({
      PhoneNumber: params.phone_number,
      FriendlyName: params.friendly_name
    });
    return this.get(`/Accounts/${this.credentials.accountSid}/IncomingPhoneNumbers.json${this.toQuery(query)}`);
  }

  public async incomingSms(params: { from?: string; to?: string; status?: string } = {}): Promise<APIResponse<any>> {
    const response = await this.listMessages({ from: params.from, to: params.to, status: params.status ?? 'received', direction: 'inbound' });
    if (!response.success) return response;
    const data = Array.isArray(response.data?.messages) ? response.data.messages : response.data;
    return { success: true, data };
  }

  public async incomingCall(params: { from?: string; to?: string } = {}): Promise<APIResponse<any>> {
    const response = await this.listCalls({ from: params.from, to: params.to, direction: 'inbound' });
    if (!response.success) return response;
    const data = Array.isArray(response.data?.calls) ? response.data.calls : response.data;
    return { success: true, data };
  }

  public async messageStatusChanged(params: { message_status?: string; from?: string; to?: string } = {}): Promise<APIResponse<any>> {
    const response = await this.listMessages({ from: params.from, to: params.to, status: params.message_status });
    if (!response.success) return response;
    const data = Array.isArray(response.data?.messages) ? response.data.messages : response.data;
    return { success: true, data };
  }

  private async sendMessage(params: SendMessageParams): Promise<APIResponse<any>> {
    const payload: Record<string, any> = {
      To: params.to,
      Body: params.body,
      MessagingServiceSid: params.messaging_service_sid,
      StatusCallback: params.status_callback,
      StatusCallbackMethod: params.status_callback_method,
      ApplicationSid: params.application_sid,
      MaxPrice: params.max_price,
      ProvideFeedback: params.provide_feedback,
      Attempt: params.attempt,
      ValidityPeriod: params.validity_period,
      ForceDelivery: params.force_delivery,
      ContentRetention: params.content_retention,
      AddressRetention: params.address_retention,
      SmartEncoded: params.smart_encoded,
      ShortenUrls: params.shorten_urls,
      ScheduleType: params.schedule_type,
      SendAt: params.send_at,
      SendAsMms: params.send_as_mms,
      ContentVariables: params.content_variables ? JSON.stringify(params.content_variables) : undefined
    };

    if (params.from) {
      payload.From = params.from;
    }

    if (params.media_url) {
      payload.MediaUrl = params.media_url;
    }

    if (params.persistent_action?.length) {
      payload.PersistentAction = params.persistent_action;
    }

    return this.formRequest('POST', `/Accounts/${this.credentials.accountSid}/Messages.json`, payload);
  }

  private async formRequest(method: 'POST' | 'GET' | 'DELETE', endpoint: string, data: Record<string, any>): Promise<APIResponse<any>> {
    const url = `${this.baseURL}${endpoint}`;
    const body = new URLSearchParams();
    Object.entries(data).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      if (Array.isArray(value)) {
        value.forEach(item => body.append(key, String(item)));
        return;
      }
      body.set(key, String(value));
    });

    const init: RequestInit = {
      method,
      headers: {
        ...this.getAuthHeaders(),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: method === 'GET' ? undefined : body
    };

    if (method === 'GET') {
      const qs = body.toString();
      const finalUrl = qs ? `${url}?${qs}` : url;
      return this.rawRequest(method, finalUrl);
    }

    return this.rawRequest(method, url, body);
  }

  private async rawRequest(method: string, url: string, body?: URLSearchParams): Promise<APIResponse<any>> {
    try {
      const response = await fetch(url, {
        method,
        headers: {
          ...this.getAuthHeaders(),
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: method === 'GET' ? undefined : body
      });

      const text = await response.text();
      let data: any;
      try {
        data = text ? JSON.parse(text) : undefined;
      } catch {
        data = text;
      }

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
          statusCode: response.status,
          data
        };
      }

      return {
        success: true,
        data,
        statusCode: response.status,
        headers: Object.fromEntries(response.headers.entries())
      };
    } catch (error) {
      return { success: false, error: getErrorMessage(error) };
    }
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

  private cleanQuery(params: Record<string, any>): Record<string, any> {
    return Object.fromEntries(
      Object.entries(params).filter(([, value]) => value !== undefined && value !== null)
    );
  }
}
