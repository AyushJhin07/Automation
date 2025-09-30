import { Buffer } from 'buffer';
import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

export class ConfluenceAPIClient extends BaseAPIClient {
  constructor(credentials: APICredentials) {
    const baseUrl = credentials.baseUrl || credentials.instanceUrl;
    if (!baseUrl) {
      throw new Error('Confluence integration requires baseUrl');
    }
    super(baseUrl.replace(/\/$/, '') + '/wiki/rest/api', credentials);
    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'create_page': this.createPage.bind(this) as any,
      'get_page': this.getPage.bind(this) as any,
      'update_page': this.updatePage.bind(this) as any,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    if (this.credentials.accessToken) {
      return {
        Authorization: `Bearer ${this.credentials.accessToken}`,
        'Content-Type': 'application/json'
      };
    }
    if (this.credentials.username && this.credentials.apiToken) {
      const basic = Buffer.from(`${this.credentials.username}:${this.credentials.apiToken}`).toString('base64');
      return {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/json'
      };
    }
    throw new Error('Confluence integration requires accessToken or username/apiToken');
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/space', this.getAuthHeaders());
  }

  public async createPage(params: { spaceKey: string; title: string; body: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['spaceKey', 'title', 'body']);
    return this.post('/content', {
      type: 'page',
      title: params.title,
      space: { key: params.spaceKey },
      body: {
        storage: {
          value: params.body,
          representation: 'storage'
        }
      }
    }, this.getAuthHeaders());
  }

  public async getPage(params: { pageId: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['pageId']);
    return this.get(`/content/${params.pageId}?expand=body.storage`, this.getAuthHeaders());
  }

  public async updatePage(params: { pageId: string; version: number; title?: string; body?: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['pageId', 'version']);
    const body: any = {
      version: { number: params.version },
    };
    if (params.title) body.title = params.title;
    if (params.body) {
      body.body = {
        storage: {
          value: params.body,
          representation: 'storage'
        }
      };
    }
    return this.put(`/content/${params.pageId}`, body, this.getAuthHeaders());
  }
}
