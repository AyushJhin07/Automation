import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient.js';

export interface RampCredentials extends APICredentials {
  apiKey: string;
}

type PaginationParams = {
  page_size?: number;
  start?: string;
};

type TransactionFilters = PaginationParams & {
  from_date?: string;
  to_date?: string;
  card_id?: string;
  user_id?: string;
};

type CreateUserParams = {
  first_name: string;
  last_name: string;
  email: string;
  role: 'CARDHOLDER' | 'ADMIN' | 'BOOKKEEPER';
  [key: string]: any;
};

const RETRY_OPTIONS = {
  retries: 2,
  initialDelayMs: 500,
  maxDelayMs: 2000
};

export class RampAPIClient extends BaseAPIClient {
  constructor(credentials: RampCredentials) {
    if (!credentials.apiKey) {
      throw new Error('Ramp integration requires an API key');
    }

    super('https://api.ramp.com/v1', credentials);

    this.registerHandlers({
      test_connection: () => this.testConnection(),
      get_transactions: params => this.getTransactions(params as TransactionFilters),
      get_cards: params => this.getCards(params as PaginationParams),
      get_users: params => this.getUsers(params as PaginationParams),
      create_user: params => this.createUser(params as CreateUserParams)
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.credentials.apiKey}`,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.withRetries(() => this.get('/users/me'), RETRY_OPTIONS);
  }

  private async getTransactions(params: TransactionFilters = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString(this.normalizePagination(params, 25, 100));
    return this.withRetries(() => this.get(`/transactions${query}`), RETRY_OPTIONS);
  }

  private async getCards(params: PaginationParams = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString(this.normalizePagination(params, 25, 100));
    return this.withRetries(() => this.get(`/cards${query}`), RETRY_OPTIONS);
  }

  private async getUsers(params: PaginationParams = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString(this.normalizePagination(params, 25, 100));
    return this.withRetries(() => this.get(`/users${query}`), RETRY_OPTIONS);
  }

  private async createUser(params: CreateUserParams): Promise<APIResponse<any>> {
    const { first_name, last_name, email, role } = params;
    if (!first_name || !last_name || !email || !role) {
      return { success: false, error: 'create_user requires first_name, last_name, email and role' };
    }
    const payload = this.removeUndefined(params);
    return this.withRetries(() => this.post('/users', payload), RETRY_OPTIONS);
  }

  private normalizePagination(
    params: PaginationParams & Record<string, any>,
    defaultSize: number,
    maxSize: number
  ): Record<string, any> {
    const { page_size, start, ...rest } = params;
    const normalized: Record<string, any> = { ...rest };

    if (typeof page_size === 'number') {
      normalized.page_size = Math.min(Math.max(page_size, 1), maxSize);
    } else {
      normalized.page_size = defaultSize;
    }

    if (start) {
      normalized.start = start;
    }

    return this.removeUndefined(normalized);
  }

  private removeUndefined<T extends Record<string, any>>(payload: T): T {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(payload)) {
      if (value === undefined || value === null) {
        continue;
      }
      if (Array.isArray(value)) {
        result[key] = value
          .filter(item => item !== undefined && item !== null)
          .map(item => (typeof item === 'object' ? this.removeUndefined(item as Record<string, any>) : item));
        continue;
      }
      if (typeof value === 'object') {
        result[key] = this.removeUndefined(value as Record<string, any>);
        continue;
      }
      result[key] = value;
    }
    return result as T;
  }
}
