import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

export class MondayAPIClient extends BaseAPIClient {
  constructor(credentials: APICredentials) {
    const token = credentials.accessToken || credentials.apiKey;
    if (!token) {
      throw new Error('Monday.com integration requires access token');
    }
    super('https://api.monday.com/v2', credentials);
    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'create_item': this.createItem.bind(this) as any,
      'update_item': this.updateItem.bind(this) as any,
      'list_boards': this.listBoards.bind(this) as any,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const token = this.credentials.accessToken || this.credentials.apiKey || '';
    return {
      Authorization: token,
      'Content-Type': 'application/json'
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.graphQL(`{ me { id name } }`);
  }

  public async listBoards(): Promise<APIResponse<any>> {
    return this.graphQL(`{ boards (limit: 25) { id name } }`);
  }

  public async createItem(params: { boardId: string; groupId?: string; itemName: string; columnValues?: Record<string, any> }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['boardId', 'itemName']);
    const columnValues = params.columnValues ? JSON.stringify(params.columnValues) : undefined;
    const mutation = `mutation ($boardId: ID!, $itemName: String!, $groupId: String, $columnValues: JSON) {
      create_item(board_id: $boardId, item_name: $itemName, group_id: $groupId, column_values: $columnValues) { 
        id
        name
      }
    }`;
    return this.graphQL(mutation, {
      boardId: params.boardId,
      itemName: params.itemName,
      groupId: params.groupId,
      columnValues
    });
  }

  public async updateItem(params: { itemId: string; columnValues: Record<string, any> }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['itemId', 'columnValues']);
    const mutation = `mutation ($itemId: ID!, $columnValues: JSON!) {
      change_multiple_column_values(item_id: $itemId, column_values: $columnValues) { id name }
    }`;
    return this.graphQL(mutation, {
      itemId: params.itemId,
      columnValues: JSON.stringify(params.columnValues)
    });
  }

  private async graphQL(query: string, variables?: Record<string, any>): Promise<APIResponse<any>> {
    const resp = await fetch(this.baseURL, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ query, variables })
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || data.errors) {
      return {
        success: false,
        error: data.errors?.[0]?.message || `HTTP ${resp.status}`
      };
    }
    return { success: true, data: data.data };
  }
}

