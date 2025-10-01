import { BaseAPIClient, APICredentials, APIResponse } from './BaseAPIClient';
import { getErrorMessage } from '../types/common';

export interface TrelloCredentials extends APICredentials {
  apiKey: string;
  apiToken: string;
}

interface ListBoardsParams {
  fields?: string;
}

interface ListListsParams {
  boardId: string;
  cards?: string;
  fields?: string;
}

interface CreateCardParams {
  idList: string;
  name: string;
  desc?: string;
  due?: string;
  idMembers?: string[];
}

interface UpdateCardParams {
  cardId: string;
  name?: string;
  desc?: string;
  due?: string;
  closed?: boolean;
  idList?: string;
}

interface AddCommentParams {
  cardId: string;
  text: string;
}

/**
 * Trello client that signs requests with key/token via query parameters.
 */
export class TrelloAPIClient extends BaseAPIClient {
  constructor(credentials: TrelloCredentials) {
    if (!credentials?.apiKey || !credentials?.apiToken) {
      throw new Error('Trello integration requires apiKey and apiToken');
    }

    super('https://api.trello.com/1', credentials);
  }

  protected getAuthHeaders(): Record<string, string> {
    return { 'Content-Type': 'application/json' };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.request('GET', '/members/me');
  }

  public async listBoards(params: ListBoardsParams = {}): Promise<APIResponse<any>> {
    return this.request('GET', '/members/me/boards', params);
  }

  public async listLists(params: ListListsParams): Promise<APIResponse<any>> {
    return this.request('GET', `/boards/${encodeURIComponent(params.boardId)}/lists`, {
      cards: params.cards,
      fields: params.fields
    });
  }

  public async createCard(params: CreateCardParams): Promise<APIResponse<any>> {
    return this.request('POST', '/cards', {
      ...params,
      idMembers: params.idMembers ? params.idMembers.join(',') : undefined
    });
  }

  public async updateCard(params: UpdateCardParams): Promise<APIResponse<any>> {
    const { cardId, ...body } = params;
    return this.request('PUT', `/cards/${encodeURIComponent(cardId)}`, body);
  }

  public async addComment(params: AddCommentParams): Promise<APIResponse<any>> {
    return this.request('POST', `/cards/${encodeURIComponent(params.cardId)}/actions/comments`, {
      text: params.text
    });
  }

  public async cardCreated(params: { boardId: string; since?: string; before?: string; limit?: number }): Promise<APIResponse<any>> {
    const query = new URLSearchParams();
    if (params.since) query.set('since', params.since);
    if (params.before) query.set('before', params.before);
    if (params.limit) query.set('limit', String(params.limit));
    return this.request('GET', `/boards/${encodeURIComponent(params.boardId)}/cards`, Object.fromEntries(query.entries()));
  }

  private async request(method: 'GET' | 'POST' | 'PUT' | 'DELETE', endpoint: string, params: Record<string, any> = {}): Promise<APIResponse<any>> {
    const url = new URL(`${this.baseURL}${endpoint}`);
    url.searchParams.set('key', this.credentials.apiKey);
    url.searchParams.set('token', this.credentials.apiToken);

    const bodyEntries: Record<string, any> = {};

    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null) {
        return;
      }
      if (method === 'GET') {
        url.searchParams.set(key, Array.isArray(value) ? value.join(',') : String(value));
      } else {
        bodyEntries[key] = Array.isArray(value) ? value.join(',') : value;
      }
    });

    const requestInit: RequestInit = {
      method,
      headers: {
        ...this.getAuthHeaders(),
        'User-Agent': 'ScriptSpark-Automation/1.0'
      }
    };

    if (method !== 'GET') {
      requestInit.body = JSON.stringify(bodyEntries);
    }

    try {
      const response = await fetch(url.toString(), requestInit);
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
}
