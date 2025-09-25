import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

interface NotionCreatePageParams {
  parent: { database_id?: string; page_id?: string };
  properties: Record<string, any>;
  children?: any[];
}

interface NotionUpdatePageParams {
  pageId: string;
  properties?: Record<string, any>;
  archived?: boolean;
}

interface NotionGetPageParams {
  pageId: string;
}

interface NotionCreateDatabaseEntryParams {
  databaseId: string;
  properties: Record<string, any>;
  children?: any[];
}

interface NotionQueryDatabaseParams {
  databaseId: string;
  filter?: Record<string, any>;
  sorts?: Array<Record<string, any>>;
  start_cursor?: string;
  page_size?: number;
}

interface NotionAppendBlockParams {
  blockId: string;
  children: any[];
}

interface NotionUpdateBlockParams {
  blockId: string;
  data: Record<string, any>;
}

interface NotionGetBlockChildrenParams {
  blockId: string;
  start_cursor?: string;
  page_size?: number;
}

export class NotionAPIClient extends BaseAPIClient {
  private readonly notionVersion: string;

  constructor(credentials: APICredentials & { notionVersion?: string }) {
    if (!credentials.accessToken) {
      throw new Error('Notion integration requires an access token');
    }

    super('https://api.notion.com/v1', credentials);
    this.notionVersion = credentials.notionVersion ?? '2022-06-28';
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.credentials.accessToken}`,
      'Notion-Version': this.notionVersion
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.post('/search', { page_size: 1 });
  }

  public async createPage(params: NotionCreatePageParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['parent', 'properties']);
    return this.post('/pages', {
      parent: params.parent,
      properties: params.properties,
      children: params.children
    });
  }

  public async updatePage(params: NotionUpdatePageParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['pageId']);
    return this.patch(`/pages/${params.pageId}`, {
      properties: params.properties,
      archived: params.archived
    });
  }

  public async getPage(params: NotionGetPageParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['pageId']);
    return this.get(`/pages/${params.pageId}`);
  }

  public async createDatabaseEntry(params: NotionCreateDatabaseEntryParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['databaseId', 'properties']);
    return this.post('/pages', {
      parent: { database_id: params.databaseId },
      properties: params.properties,
      children: params.children
    });
  }

  public async queryDatabase(params: NotionQueryDatabaseParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['databaseId']);
    return this.post(`/databases/${params.databaseId}/query`, {
      filter: params.filter,
      sorts: params.sorts,
      start_cursor: params.start_cursor,
      page_size: params.page_size
    });
  }

  public async appendBlockChildren(params: NotionAppendBlockParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['blockId', 'children']);
    return this.patch(`/blocks/${params.blockId}/children`, {
      children: params.children
    });
  }

  public async updateBlock(params: NotionUpdateBlockParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['blockId', 'data']);
    return this.patch(`/blocks/${params.blockId}`, params.data);
  }

  public async getBlockChildren(params: NotionGetBlockChildrenParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['blockId']);
    const query = this.buildQueryString({
      start_cursor: params.start_cursor,
      page_size: params.page_size
    });

    return this.get(`/blocks/${params.blockId}/children${query}`);
  }
}
