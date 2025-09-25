import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

interface AirtableBaseParams {
  baseId: string;
  tableId: string;
}

interface AirtableCreateRecordParams extends AirtableBaseParams {
  fields: Record<string, any>;
  typecast?: boolean;
}

interface AirtableUpdateRecordParams extends AirtableBaseParams {
  recordId: string;
  fields: Record<string, any>;
  typecast?: boolean;
}

interface AirtableDeleteRecordParams extends AirtableBaseParams {
  recordId: string;
}

interface AirtableGetRecordParams extends AirtableBaseParams {
  recordId: string;
}

interface AirtableListRecordsParams extends AirtableBaseParams {
  fields?: string[];
  filterByFormula?: string;
  maxRecords?: number;
  pageSize?: number;
  sort?: Array<{ field: string; direction?: 'asc' | 'desc' }>;
  view?: string;
  cellFormat?: 'json' | 'string';
  timeZone?: string;
  userLocale?: string;
  offset?: string;
}

export class AirtableAPIClient extends BaseAPIClient {
  constructor(credentials: APICredentials) {
    if (!credentials.apiKey) {
      throw new Error('Airtable integration requires an API key');
    }

    super('https://api.airtable.com/v0', credentials);
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.credentials.apiKey}`
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/meta/whoami');
  }

  public async createRecord(params: AirtableCreateRecordParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['baseId', 'tableId', 'fields']);
    return this.post(
      `/${params.baseId}/${encodeURIComponent(params.tableId)}`,
      {
        fields: params.fields,
        typecast: params.typecast ?? false
      }
    );
  }

  public async updateRecord(params: AirtableUpdateRecordParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['baseId', 'tableId', 'recordId', 'fields']);
    return this.patch(
      `/${params.baseId}/${encodeURIComponent(params.tableId)}/${params.recordId}`,
      {
        fields: params.fields,
        typecast: params.typecast ?? false
      }
    );
  }

  public async getRecord(params: AirtableGetRecordParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['baseId', 'tableId', 'recordId']);
    return this.get(
      `/${params.baseId}/${encodeURIComponent(params.tableId)}/${params.recordId}`
    );
  }

  public async deleteRecord(params: AirtableDeleteRecordParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['baseId', 'tableId', 'recordId']);
    return this.delete(
      `/${params.baseId}/${encodeURIComponent(params.tableId)}/${params.recordId}`
    );
  }

  public async listRecords(params: AirtableListRecordsParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['baseId', 'tableId']);

    const searchParams = new URLSearchParams();
    if (params.fields) {
      params.fields.forEach(field => searchParams.append('fields[]', field));
    }

    if (params.sort) {
      params.sort.forEach((sort, index) => {
        if (sort.field) {
          searchParams.append(`sort[${index}][field]`, sort.field);
        }
        if (sort.direction) {
          searchParams.append(`sort[${index}][direction]`, sort.direction);
        }
      });
    }

    if (params.filterByFormula) searchParams.set('filterByFormula', params.filterByFormula);
    if (params.maxRecords !== undefined) searchParams.set('maxRecords', String(params.maxRecords));
    if (params.pageSize !== undefined) searchParams.set('pageSize', String(params.pageSize));
    if (params.view) searchParams.set('view', params.view);
    if (params.cellFormat) searchParams.set('cellFormat', params.cellFormat);
    if (params.timeZone) searchParams.set('timeZone', params.timeZone);
    if (params.userLocale) searchParams.set('userLocale', params.userLocale);
    if (params.offset) searchParams.set('offset', params.offset);

    const query = searchParams.toString();
    return this.get(
      `/${params.baseId}/${encodeURIComponent(params.tableId)}${query ? `?${query}` : ''}`
    );
  }
}
