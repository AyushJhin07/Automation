import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient.js';

export interface BrexCredentials extends APICredentials {
  accessToken: string;
}

type CursorParams = {
  limit?: number;
  cursor?: string;
};

type ListTransactionsParams = CursorParams & {
  card_id?: string[];
  user_id?: string[];
  posted_at_start?: string;
  posted_at_end?: string;
  expand?: string[];
};

type GetTransactionParams = {
  id: string;
  expand?: string[];
};

type ListCardsParams = CursorParams & {
  user_id?: string[];
};

type GetCardParams = { id: string };

type CreateCardParams = Record<string, any>;

type UpdateCardParams = CreateCardParams & { id: string };

type ListUsersParams = CursorParams;

const DEFAULT_RETRY_OPTIONS = {
  retries: 2,
  initialDelayMs: 500,
  maxDelayMs: 2000
};

export class BrexAPIClient extends BaseAPIClient {
  constructor(credentials: BrexCredentials) {
    if (!credentials.accessToken) {
      throw new Error('Brex integration requires an access token');
    }

    super('https://platform.brexapis.com', credentials);

    this.registerHandlers({
      test_connection: () => this.testConnection(),
      list_transactions: params => this.listTransactions(params as ListTransactionsParams),
      get_transaction: params => this.getTransaction(params as GetTransactionParams),
      list_cards: params => this.listCards(params as ListCardsParams),
      get_card: params => this.getCard(params as GetCardParams),
      create_card: params => this.createCard(params as CreateCardParams),
      update_card: params => this.updateCard(params as UpdateCardParams),
      list_users: params => this.listUsers(params as ListUsersParams)
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.credentials.accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.withRetries(() => this.get('/v2/cards' + this.buildQueryString({ limit: 1 })), DEFAULT_RETRY_OPTIONS);
  }

  private async listTransactions(params: ListTransactionsParams = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString(this.normalizeCursorParams(params));
    return this.withRetries(() => this.get(`/v2/transactions${query}`), DEFAULT_RETRY_OPTIONS);
  }

  private async getTransaction(params: GetTransactionParams): Promise<APIResponse<any>> {
    if (!params.id) {
      return { success: false, error: 'get_transaction requires an id' };
    }
    const query = this.buildQueryString({ expand: params.expand });
    return this.withRetries(() => this.get(`/v2/transactions/${encodeURIComponent(params.id)}${query}`), DEFAULT_RETRY_OPTIONS);
  }

  private async listCards(params: ListCardsParams = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString(this.normalizeCursorParams(params));
    return this.withRetries(() => this.get(`/v2/cards${query}`), DEFAULT_RETRY_OPTIONS);
  }

  private async getCard(params: GetCardParams): Promise<APIResponse<any>> {
    if (!params.id) {
      return { success: false, error: 'get_card requires an id' };
    }
    return this.withRetries(() => this.get(`/v2/cards/${encodeURIComponent(params.id)}`), DEFAULT_RETRY_OPTIONS);
  }

  private async createCard(params: CreateCardParams): Promise<APIResponse<any>> {
    const payload = this.removeUndefined(params);
    return this.withRetries(() => this.post('/v2/cards', payload), DEFAULT_RETRY_OPTIONS);
  }

  private async updateCard(params: UpdateCardParams): Promise<APIResponse<any>> {
    if (!params.id) {
      return { success: false, error: 'update_card requires an id' };
    }
    const payload = this.removeUndefined({ ...params, id: undefined });
    return this.withRetries(
      () => this.patch(`/v2/cards/${encodeURIComponent(params.id)}`, payload),
      DEFAULT_RETRY_OPTIONS
    );
  }

  private async listUsers(params: ListUsersParams = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString(this.normalizeCursorParams(params));
    return this.withRetries(() => this.get(`/v2/users${query}`), DEFAULT_RETRY_OPTIONS);
  }

  private normalizeCursorParams(params: CursorParams & Record<string, any>): Record<string, any> {
    const { limit, cursor, ...rest } = params;
    const normalized: Record<string, any> = { ...rest };

    if (Array.isArray(rest.card_id)) {
      normalized.card_id = rest.card_id.join(',');
    }
    if (Array.isArray(rest.user_id)) {
      normalized.user_id = rest.user_id.join(',');
    }
    if (Array.isArray(rest.expand)) {
      normalized.expand = rest.expand.join(',');
    }

    if (typeof limit === 'number') {
      normalized.limit = Math.min(Math.max(limit, 1), 100);
    }
    if (cursor) {
      normalized.cursor = cursor;
    }

    return this.removeUndefined(normalized);
  }

  private removeUndefined<T extends Record<string, any>>(payload: T): T {
    const clone: Record<string, any> = {};
    for (const [key, value] of Object.entries(payload)) {
      if (value === undefined || value === null) {
        continue;
      }
      if (Array.isArray(value)) {
        clone[key] = value
          .filter(item => item !== undefined && item !== null)
          .map(item => (typeof item === 'object' ? this.removeUndefined(item as Record<string, any>) : item));
        continue;
      }
      if (typeof value === 'object') {
        clone[key] = this.removeUndefined(value as Record<string, any>);
        continue;
      }
      clone[key] = value;
    }
    return clone as T;
  }
}
