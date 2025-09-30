import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

interface TrelloConfig {
  key: string;
  token: string;
}

export class TrelloAPIClient extends BaseAPIClient {
  private config: TrelloConfig;

  constructor(credentials: APICredentials) {
    super('https://api.trello.com/1', credentials);
    this.config = {
      key: credentials.apiKey || credentials.key || '',
      token: credentials.accessToken || credentials.token || ''
    };

    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'list_boards': this.listBoards.bind(this) as any,
      'list_lists': this.listLists.bind(this) as any,
      'create_card': this.createCard.bind(this) as any,
      'add_comment': this.addComment.bind(this) as any,
      'move_card': this.moveCard.bind(this) as any,
    });
  }

  private buildUrl(path: string, params: Record<string, any> = {}): string {
    const search = new URLSearchParams({
      key: this.config.key,
      token: this.config.token,
    });
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) search.append(k, String(v));
    });
    return `${this.baseURL}${path}?${search.toString()}`;
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.request('GET', '/members/me');
  }

  public async listBoards(): Promise<APIResponse<any>> {
    return this.request('GET', '/members/me/boards');
  }

  public async listLists(params: { boardId: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['boardId']);
    return this.request('GET', `/boards/${params.boardId}/lists`);
  }

  public async createCard(params: { listId: string; name: string; desc?: string; due?: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['listId', 'name']);
    return this.request('POST', '/cards', {
      idList: params.listId,
      name: params.name,
      desc: params.desc,
      due: params.due,
    });
  }

  public async addComment(params: { cardId: string; text: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['cardId', 'text']);
    return this.request('POST', `/cards/${params.cardId}/actions/comments`, { text: params.text });
  }

  public async moveCard(params: { cardId: string; listId: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['cardId', 'listId']);
    return this.request('PUT', `/cards/${params.cardId}`, { idList: params.listId });
  }

  async registerWebhook(webhookUrl: string, events: string[], _secret?: string): Promise<APIResponse<{ webhookId: string }>> {
    try {
      const body = {
        callbackURL: webhookUrl,
        idModel: events[0] || 'me'
      };
      const resp = await fetch(this.buildUrl('/webhooks'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await resp.json().catch(() => ({}));
      return resp.ok ? { success: true, data: { webhookId: data.id } } : { success: false, error: data?.message || `HTTP ${resp.status}` };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async unregisterWebhook(webhookId: string): Promise<APIResponse<void>> {
    try {
      const resp = await fetch(this.buildUrl(`/webhooks/${webhookId}`), { method: 'DELETE' });
      return resp.ok ? { success: true } : { success: false, error: `HTTP ${resp.status}` };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async listWebhooks(): Promise<APIResponse<any[]>> {
    return this.request('GET', '/tokens/' + this.config.token + '/webhooks');
  }

  private async request(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, params: Record<string, any> = {}): Promise<APIResponse<any>> {
    const url = this.buildUrl(path, method === 'GET' || method === 'DELETE' ? params : {});
    const options: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (method !== 'GET' && method !== 'DELETE') {
      options.body = JSON.stringify(params);
    }
    const resp = await fetch(url, options);
    const data = await resp.json().catch(() => ({}));
    return resp.ok ? { success: true, data } : { success: false, error: data?.message || `HTTP ${resp.status}` };
  }
}

