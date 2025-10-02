import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

interface IterableCredentials extends APICredentials {
  apiKey?: string;
}

export class IterableAPIClient extends BaseAPIClient {
  constructor(credentials: IterableCredentials) {
    const apiKey = credentials.apiKey || credentials.accessToken;
    if (!apiKey) {
      throw new Error('Iterable integration requires an API key');
    }
    super('https://api.iterable.com/api', { ...credentials, apiKey });

    this.registerHandlers({
      test_connection: this.testConnection.bind(this) as any,
      get_user: this.getUser.bind(this) as any,
      update_user: this.updateUser.bind(this) as any,
      delete_user: this.deleteUser.bind(this) as any,
      track_event: this.trackEvent.bind(this) as any,
      track_purchase: this.trackPurchase.bind(this) as any,
      send_email: this.sendEmail.bind(this) as any,
      subscribe_user: this.subscribeUser.bind(this) as any,
      unsubscribe_user: this.unsubscribeUser.bind(this) as any,
      get_lists: this.getLists.bind(this) as any,
      create_list: this.createList.bind(this) as any,
      get_campaigns: this.getCampaigns.bind(this) as any,
      get_templates: this.getTemplates.bind(this) as any,
      export_data: this.exportData.bind(this) as any,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const key = (this.credentials as IterableCredentials).apiKey;
    if (!key) {
      throw new Error('Iterable API key missing from credentials');
    }
    return {
      'Api-Key': key,
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/lists');
  }

  public async getUser(params: { email?: string; userId?: string }): Promise<APIResponse<any>> {
    if (params.email) {
      return this.post('/users/getByEmail', { email: params.email });
    }
    if (params.userId) {
      return this.post('/users/getByUserId', { userId: params.userId });
    }
    throw new Error('Iterable get_user requires email or userId');
  }

  public async updateUser(params: {
    email?: string;
    userId?: string;
    dataFields?: Record<string, any>;
    preferUserId?: boolean;
    mergeNestedObjects?: boolean;
  }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['dataFields']);
    return this.post('/users/update', params);
  }

  public async deleteUser(params: { email?: string; userId?: string }): Promise<APIResponse<any>> {
    if (!params.email && !params.userId) {
      throw new Error('Iterable delete_user requires email or userId');
    }
    return this.post('/users/delete', params);
  }

  public async trackEvent(params: {
    email?: string;
    userId?: string;
    eventName: string;
    dataFields?: Record<string, any>;
    campaignId?: number;
    templateId?: number;
    createdAt?: number;
    id?: string;
  }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['eventName']);
    return this.post('/events/track', params);
  }

  public async trackPurchase(params: {
    user: Record<string, any>;
    items: Array<Record<string, any>>;
    campaignId?: number;
    templateId?: number;
    total?: number;
    createdAt?: number;
    dataFields?: Record<string, any>;
  }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['user', 'items']);
    return this.post('/commerce/trackPurchase', params);
  }

  public async sendEmail(params: {
    campaignId: number;
    recipientEmail?: string;
    recipientUserId?: string;
    dataFields?: Record<string, any>;
    sendAt?: string;
    allowRepeatMarketingSends?: boolean;
    metadata?: Record<string, any>;
  }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['campaignId']);
    return this.post('/email/target', params);
  }

  public async subscribeUser(params: { listId: number; subscribers: Array<Record<string, any>> }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['listId', 'subscribers']);
    return this.post('/lists/subscribe', params);
  }

  public async unsubscribeUser(params: {
    listId: number;
    subscribers: Array<Record<string, any>>;
    campaignId?: number;
    channelUnsubscribe?: boolean;
  }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['listId', 'subscribers']);
    return this.post('/lists/unsubscribe', params);
  }

  public async getLists(): Promise<APIResponse<any>> {
    return this.get('/lists');
  }

  public async createList(params: { name: string; description?: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['name']);
    return this.post('/lists', params);
  }

  public async getCampaigns(params: { campaignType?: string } = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString({ campaignType: params.campaignType });
    return this.get(`/campaigns${query}`);
  }

  public async getTemplates(params: { templateType?: string; messageMedium?: string } = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString({
      templateType: params.templateType,
      messageMedium: params.messageMedium,
    });
    return this.get(`/templates${query}`);
  }

  public async exportData(params: {
    dataTypeName: string;
    range?: string;
    startDateTime?: string;
    endDateTime?: string;
    format?: string;
    delimiter?: string;
    onlyFields?: string[];
    omitFields?: string[];
  }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['dataTypeName']);
    return this.post('/export/data', params);
  }
}
