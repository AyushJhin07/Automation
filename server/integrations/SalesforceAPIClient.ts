import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';
import type { JSONSchemaType } from 'ajv';

type SalesforceCreateRecordInput = {
  sobjectType: string;
  fields: Record<string, any>;
};

type SalesforceUpdateRecordInput = SalesforceCreateRecordInput & {
  recordId: string;
};

type SalesforceGetRecordInput = {
  sobjectType: string;
  recordId: string;
  fields?: string[];
};

type SalesforceQueryInput = {
  query: string;
};

const CREATE_RECORD_SCHEMA: JSONSchemaType<SalesforceCreateRecordInput> = {
  type: 'object',
  properties: {
    sobjectType: { type: 'string' },
    fields: { type: 'object', additionalProperties: true }
  },
  required: ['sobjectType', 'fields'],
  additionalProperties: true
};

const UPDATE_RECORD_SCHEMA: JSONSchemaType<SalesforceUpdateRecordInput> = {
  type: 'object',
  properties: {
    sobjectType: { type: 'string' },
    fields: { type: 'object', additionalProperties: true },
    recordId: { type: 'string' }
  },
  required: ['sobjectType', 'fields', 'recordId'],
  additionalProperties: true
};

const GET_RECORD_SCHEMA: JSONSchemaType<SalesforceGetRecordInput> = {
  type: 'object',
  properties: {
    sobjectType: { type: 'string' },
    recordId: { type: 'string' },
    fields: {
      type: 'array',
      nullable: true,
      items: { type: 'string' }
    }
  },
  required: ['sobjectType', 'recordId'],
  additionalProperties: true
};

const QUERY_RECORDS_SCHEMA: JSONSchemaType<SalesforceQueryInput> = {
  type: 'object',
  properties: {
    query: { type: 'string' }
  },
  required: ['query'],
  additionalProperties: true
};

export class SalesforceAPIClient extends BaseAPIClient {
  private instanceUrl: string;

  constructor(credentials: APICredentials) {
    const instanceUrl = credentials.instanceUrl || credentials.baseUrl;
    const accessToken = credentials.accessToken;
    if (!instanceUrl || !accessToken) {
      throw new Error('Salesforce integration requires instanceUrl and accessToken');
    }
    const base = instanceUrl.replace(/\/$/, '') + '/services/data/v60.0';
    super(base, credentials);
    this.instanceUrl = instanceUrl.replace(/\/$/, '');

    this.registerHandlers({
      'test_connection': () => this.testConnection(),
      'create_sobject': params => this.createSObject(params as { object?: string; sobjectType?: string; data?: Record<string, any>; fields?: Record<string, any> }),
      'update_sobject': params => this.updateSObject(params as { object?: string; sobjectType?: string; id?: string; recordId?: string; data?: Record<string, any>; fields?: Record<string, any> }),
      'get_sobject': params => this.getRecord(params as { object?: string; sobjectType?: string; id?: string; recordId?: string; fields?: string[] }),
      'query': params => this.query(params as { soql?: string; query?: string })
    });

    this.registerAliasHandlers({
      'create_record': 'handleCreateRecord',
      'update_record': 'handleUpdateRecord',
      'get_record': 'handleGetRecord',
      'query_records': 'handleQueryRecords'
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const token = this.credentials.accessToken || '';
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.withRetries(() => this.get('/limits', this.getAuthHeaders()));
  }

  public async createSObject(params: {
    object?: string;
    sobjectType?: string;
    data?: Record<string, any>;
    fields?: Record<string, any>;
  }): Promise<APIResponse<any>> {
    const objectType = params.object || params.sobjectType;
    const payload = params.data ?? params.fields;
    if (!objectType || !payload) {
      return { success: false, error: 'object/sobjectType and data/fields are required to create a record.' };
    }
    return this.post(`/sobjects/${objectType}`, payload, this.getAuthHeaders());
  }

  public async updateSObject(params: {
    object?: string;
    sobjectType?: string;
    id?: string;
    recordId?: string;
    data?: Record<string, any>;
    fields?: Record<string, any>;
  }): Promise<APIResponse<any>> {
    const objectType = params.object || params.sobjectType;
    const recordId = params.id || params.recordId;
    const payload = params.data ?? params.fields;

    if (!objectType || !recordId || !payload) {
      return { success: false, error: 'object/sobjectType, id/recordId, and data/fields are required to update a record.' };
    }

    return this.patch(`/sobjects/${objectType}/${recordId}`, payload, this.getAuthHeaders());
  }

  public async getRecord(params: {
    object?: string;
    sobjectType?: string;
    id?: string;
    recordId?: string;
    fields?: string[];
  }): Promise<APIResponse<any>> {
    const objectType = params.object || params.sobjectType;
    const recordId = params.id || params.recordId;
    if (!objectType || !recordId) {
      return { success: false, error: 'object/sobjectType and id/recordId are required to retrieve a record.' };
    }

    const query = params.fields && params.fields.length ? this.buildQueryString({ fields: params.fields.join(',') }) : '';
    return this.get(`/sobjects/${objectType}/${recordId}${query}`, this.getAuthHeaders());
  }

  public async query(params: { soql?: string; query?: string }): Promise<APIResponse<any>> {
    const soql = (params.soql || params.query || '').trim();
    if (!soql) {
      return { success: false, error: 'SOQL query is required to query records.' };
    }
    const query = this.buildQueryString({ q: soql });
    return this.get(`/query${query}`, this.getAuthHeaders());
  }

  private async handleCreateRecord(rawParams: unknown): Promise<APIResponse<any>> {
    const params = this.validatePayload(CREATE_RECORD_SCHEMA, rawParams);
    return this.createSObject({ sobjectType: params.sobjectType, fields: params.fields });
  }

  private async handleUpdateRecord(rawParams: unknown): Promise<APIResponse<any>> {
    const params = this.validatePayload(UPDATE_RECORD_SCHEMA, rawParams);
    return this.updateSObject({ sobjectType: params.sobjectType, recordId: params.recordId, fields: params.fields });
  }

  private async handleGetRecord(rawParams: unknown): Promise<APIResponse<any>> {
    const params = this.validatePayload(GET_RECORD_SCHEMA, rawParams);
    return this.getRecord({ sobjectType: params.sobjectType, recordId: params.recordId, fields: params.fields });
  }

  private async handleQueryRecords(rawParams: unknown): Promise<APIResponse<any>> {
    const params = this.validatePayload(QUERY_RECORDS_SCHEMA, rawParams);
    return this.query({ soql: params.query });
  }
}

