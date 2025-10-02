import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

export interface IterableAPICredentials extends APICredentials {
  apiKey?: string;
  baseUrl?: string;
}

export class IterableAPIClient extends BaseAPIClient {
  private readonly apiKey: string;

  constructor(credentials: IterableAPICredentials) {
    const apiKey = credentials.apiKey || credentials.token;
    if (!apiKey) {
      throw new Error('Iterable integration requires an API key');
    }

    const base = (credentials.baseUrl || 'https://api.iterable.com/api').replace(/\/$/, '');
    super(base, { ...credentials, apiKey });
    this.apiKey = apiKey;

    this.registerHandlers({
      test_connection: this.testConnection.bind(this),
      get_user: this.getUser.bind(this),
      update_user: this.updateUser.bind(this),
      delete_user: this.deleteUser.bind(this),
      track_event: this.trackEvent.bind(this),
      track_purchase: this.trackPurchase.bind(this),
      send_email: this.sendEmail.bind(this),
      subscribe_user: this.subscribeUser.bind(this),
      unsubscribe_user: this.unsubscribeUser.bind(this),
      get_lists: this.getLists.bind(this),
      create_list: this.createList.bind(this),
      get_campaigns: this.getCampaigns.bind(this),
      get_templates: this.getTemplates.bind(this),
      export_data: this.exportData.bind(this),
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      'Api-Key': this.apiKey,
      'Content-Type': 'application/json',
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/lists', this.getAuthHeaders());
  }

  public async getUser(params: { email?: string; userId?: string }): Promise<APIResponse<any>> {
    if (!params.email && !params.userId) {
      throw new Error('Iterable get_user requires either email or userId');
    }

    if (params.email) {
      return this.post('/users/getByEmail', { email: params.email }, this.getAuthHeaders());
    }

    return this.post('/users/getByUserId', { userId: params.userId }, this.getAuthHeaders());
  }

  public async updateUser(params: {
    email?: string;
    userId?: string;
    dataFields?: Record<string, any>;
    preferUserId?: boolean;
    mergeNestedObjects?: boolean;
  }): Promise<APIResponse<any>> {
    if (!params.email && !params.userId) {
      throw new Error('Iterable update_user requires either email or userId');
    }

    const payload = this.removeEmpty({
      email: params.email,
      userId: params.userId,
      dataFields: params.dataFields,
      preferUserId: params.preferUserId,
      mergeNestedObjects: params.mergeNestedObjects,
    });
    return this.post('/users/update', payload, this.getAuthHeaders());
  }

  public async deleteUser(params: { email?: string; userId?: string }): Promise<APIResponse<any>> {
    if (!params.email && !params.userId) {
      throw new Error('Iterable delete_user requires either email or userId');
    }

    const payload = params.email ? { email: params.email } : { userId: params.userId };
    return this.post('/users/delete', payload, this.getAuthHeaders());
  }

  public async trackEvent(params: {
    eventName: string;
    userId?: string;
    email?: string;
    dataFields?: Record<string, any>;
    id?: string;
    createdAt?: number;
  }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['eventName']);
    const payload = this.removeEmpty({
      eventName: params.eventName,
      userId: params.userId,
      email: params.email,
      dataFields: params.dataFields,
      id: params.id,
      createdAt: params.createdAt,
    });
    return this.post('/events/track', payload, this.getAuthHeaders());
  }

  public async trackPurchase(params: Record<string, any>): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['user', 'items']);
    return this.post('/commerce/trackPurchase', params, this.getAuthHeaders());
  }

  public async sendEmail(params: {
    campaignId: number | string;
    recipientEmail?: string;
    recipientUserId?: string;
    dataFields?: Record<string, any>;
    sendAt?: string;
    allowRepeatMarketingSends?: boolean;
    metadata?: Record<string, any>;
  }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['campaignId']);
    if (!params.recipientEmail && !params.recipientUserId) {
      throw new Error('Iterable send_email requires either recipientEmail or recipientUserId');
    }

    const payload = this.removeEmpty({
      campaignId: params.campaignId,
      recipientEmail: params.recipientEmail,
      recipientUserId: params.recipientUserId,
      dataFields: params.dataFields,
      sendAt: params.sendAt,
      allowRepeatMarketingSends: params.allowRepeatMarketingSends,
      metadata: params.metadata,
    });
    return this.post('/email/target', payload, this.getAuthHeaders());
  }

  public async subscribeUser(params: { listId: number | string; subscribers: any[] }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['listId', 'subscribers']);
    return this.post('/lists/subscribe', params, this.getAuthHeaders());
  }

  public async unsubscribeUser(params: { listId: number | string; subscribers: any[] }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['listId', 'subscribers']);
    return this.post('/lists/unsubscribe', params, this.getAuthHeaders());
  }

  public async getLists(): Promise<APIResponse<any>> {
    return this.get('/lists', this.getAuthHeaders());
  }

  public async createList(params: { name: string; description?: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['name']);
    return this.post('/lists', params, this.getAuthHeaders());
  }

  public async getCampaigns(params: { campaignType?: string } = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString(this.removeEmpty(params));
    return this.get(`/campaigns${query}`, this.getAuthHeaders());
  }

  public async getTemplates(): Promise<APIResponse<any>> {
    return this.get('/templates', this.getAuthHeaders());
  }

  public async exportData(params: {
    dataTypeName: string;
    range?: string;
    startDateTime?: string;
    endDateTime?: string;
    format?: 'csv' | 'json';
    delimiter?: string;
    onlyFields?: string[];
    omitFields?: string[];
  }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['dataTypeName']);
    const payload = this.removeEmpty({
      dataTypeName: params.dataTypeName,
      range: params.range,
      startDateTime: params.startDateTime,
      endDateTime: params.endDateTime,
      format: params.format,
      delimiter: params.delimiter,
      onlyFields: params.onlyFields,
      omitFields: params.omitFields,
    });
    return this.post('/export/data', payload, this.getAuthHeaders());
  }

  private removeEmpty<T extends Record<string, any>>(payload: T): T {
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(payload || {})) {
      if (value !== undefined && value !== null && value !== '') {
        cleaned[key] = value;
      }
    }
    return cleaned as T;
  }
}
