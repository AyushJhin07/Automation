import { randomUUID } from 'node:crypto';

import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';
import { getErrorMessage } from '../types/common';

export interface SnowflakeAPIClientConfig extends APICredentials {
  account: string;
  warehouse?: string;
  database?: string;
  schema?: string;
  role?: string;
}

export interface SnowflakeExecuteQueryParams {
  sql: string;
  warehouse?: string;
  database?: string;
  schema?: string;
  role?: string;
  timeout?: number;
  parameters?: Record<string, any> | any[] | Map<string, any>;
  requestId?: string;
  describeOnly?: boolean;
}

export interface SnowflakeCancelQueryParams {
  statementHandle: string;
  requestId?: string;
}

export interface SnowflakeQueryResult {
  statementHandle: string;
  queryId?: string;
  requestId: string;
  rows: any[];
  resultSetMetaData?: Record<string, any>;
}

interface SnowflakeBindingValue {
  type: string;
  value: any;
}

interface SnowflakeQueryRequestPayload {
  requestId: string;
  sqlText: string;
  warehouse?: string;
  database?: string;
  schema?: string;
  role?: string;
  describeOnly?: boolean;
  queryTimeout?: number;
  bindings?: Record<string, SnowflakeBindingValue>;
}

interface SnowflakeQueryResponseBody {
  success?: boolean;
  statementHandle?: string;
  statementStatusUrl?: string;
  resultSetMetaData?: Record<string, any> | null;
  data?: any[] | null;
  rowset?: any[] | null;
  rowSet?: any[] | null;
  rows?: any[] | null;
  nextUri?: string | null;
  queryId?: string;
  requestId?: string;
  code?: string;
  message?: string;
  error?: string;
  errorCode?: string;
  errorMessage?: string;
  sqlState?: string;
}

export class SnowflakeAPIClient extends BaseAPIClient {
  private readonly defaults: {
    warehouse?: string;
    database?: string;
    schema?: string;
    role?: string;
  };

  constructor(config: SnowflakeAPIClientConfig) {
    if (!config || typeof config.account !== 'string' || config.account.trim().length === 0) {
      throw new Error('Snowflake API client requires an account identifier');
    }

    const { account, warehouse, database, schema, role, ...credentials } = config;
    const normalizedAccount = SnowflakeAPIClient.normalizeAccount(account);

    super(`https://${normalizedAccount}.snowflakecomputing.com`, credentials as APICredentials);

    this.defaults = { warehouse, database, schema, role };

    this.registerHandlers({
      'test_connection': async () => this.testConnection(),
      'execute_query': this.executeQuery.bind(this),
      'cancel_query': this.cancelQuery.bind(this)
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const token = this.credentials.accessToken ?? this.credentials.apiKey;
    if (!token) {
      throw new Error('Snowflake API client requires an access token or API key');
    }

    const formatted = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
    return {
      Authorization: formatted,
      Accept: 'application/json'
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    const response = await this.get('/api/v2/accounts/current');
    if (!response.success) {
      return response;
    }

    return {
      success: true,
      data: response.data
    };
  }

  public async executeQuery(params: SnowflakeExecuteQueryParams): Promise<APIResponse<SnowflakeQueryResult>> {
    try {
      if (!params || typeof params.sql !== 'string' || params.sql.trim().length === 0) {
        throw new Error('Snowflake execute_query requires a SQL statement');
      }

      const requestPayload = this.buildQueryPayload(params);
      const response = await this.post<SnowflakeQueryResponseBody>('/queries/v1/query-request', requestPayload);
      if (!response.success) {
        return response;
      }

      const body = response.data;
      if (!body || typeof body !== 'object') {
        return { success: false, error: 'Snowflake query response was empty' };
      }

      const error = this.extractError(body);
      if (error) {
        return { success: false, error };
      }

      if (!body.statementHandle) {
        return { success: false, error: 'Snowflake query did not return a statement handle' };
      }

      const { rows, finalPayload } = await this.collectQueryRows(body);

      return {
        success: true,
        data: {
          statementHandle: body.statementHandle,
          queryId: body.queryId ?? finalPayload.queryId,
          requestId: body.requestId ?? requestPayload.requestId,
          rows,
          resultSetMetaData: body.resultSetMetaData ?? finalPayload.resultSetMetaData ?? undefined
        }
      };
    } catch (error) {
      return { success: false, error: getErrorMessage(error) };
    }
  }

  public async cancelQuery(params: SnowflakeCancelQueryParams): Promise<APIResponse<any>> {
    try {
      if (!params || typeof params.statementHandle !== 'string' || params.statementHandle.trim().length === 0) {
        throw new Error('Snowflake cancel_query requires a statement handle');
      }

      const payload = {
        statementHandle: params.statementHandle,
        requestId: params.requestId ?? randomUUID()
      };

      return await this.post('/queries/v1/abort-request', payload);
    } catch (error) {
      return { success: false, error: getErrorMessage(error) };
    }
  }

  private buildQueryPayload(params: SnowflakeExecuteQueryParams): SnowflakeQueryRequestPayload {
    const requestId = params.requestId ?? randomUUID();
    const payload: SnowflakeQueryRequestPayload = {
      requestId,
      sqlText: params.sql,
      warehouse: params.warehouse ?? this.defaults.warehouse,
      database: params.database ?? this.defaults.database,
      schema: params.schema ?? this.defaults.schema,
      role: params.role ?? this.defaults.role,
      describeOnly: params.describeOnly ?? false
    };

    const timeout = this.resolveTimeout(params.timeout);
    if (timeout !== undefined) {
      payload.queryTimeout = timeout;
    }

    const bindings = this.buildBindings(params.parameters);
    if (bindings) {
      payload.bindings = bindings;
    }

    return this.removeUndefined(payload);
  }

  private resolveTimeout(timeout?: number): number | undefined {
    if (timeout === undefined || timeout === null) {
      return undefined;
    }

    const numeric = Math.floor(Number(timeout));
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return undefined;
    }

    const clamped = Math.min(Math.max(numeric, 1), 3600);
    return clamped;
  }

  private buildBindings(parameters?: Record<string, any> | any[] | Map<string, any>): Record<string, SnowflakeBindingValue> | undefined {
    if (!parameters) {
      return undefined;
    }

    const bindings: Record<string, SnowflakeBindingValue> = {};

    if (parameters instanceof Map) {
      for (const [key, value] of parameters.entries()) {
        if (key === undefined || key === null) continue;
        bindings[String(key)] = this.createBindingValue(value);
      }
    } else if (Array.isArray(parameters)) {
      parameters.forEach((value, index) => {
        bindings[String(index + 1)] = this.createBindingValue(value);
      });
    } else {
      for (const [key, value] of Object.entries(parameters)) {
        bindings[String(key)] = this.createBindingValue(value);
      }
    }

    return Object.keys(bindings).length > 0 ? bindings : undefined;
  }

  private createBindingValue(value: any): SnowflakeBindingValue {
    if (value === null || value === undefined) {
      return { type: 'NULL', value: null };
    }

    if (value instanceof Date) {
      return { type: 'TIMESTAMP_LTZ', value: value.toISOString() };
    }

    const valueType = typeof value;

    if (valueType === 'number' || valueType === 'bigint') {
      const numeric = Number(value);
      if (Number.isFinite(numeric) && !Number.isNaN(numeric)) {
        const isInteger = Number.isInteger(numeric);
        return { type: isInteger ? 'FIXED' : 'REAL', value: String(value) };
      }
      return { type: 'TEXT', value: String(value) };
    }

    if (valueType === 'boolean') {
      return { type: 'BOOLEAN', value };
    }

    if (Array.isArray(value) || valueType === 'object') {
      try {
        return { type: 'VARIANT', value: JSON.stringify(value) };
      } catch {
        return { type: 'TEXT', value: String(value) };
      }
    }

    return { type: 'TEXT', value: String(value) };
  }

  private extractError(payload?: SnowflakeQueryResponseBody | null): string | null {
    if (!payload || typeof payload !== 'object') {
      return 'Snowflake query returned an empty response';
    }

    if (payload.success === false) {
      return payload.message ?? payload.errorMessage ?? payload.error ?? 'Snowflake query failed';
    }

    if (payload.error || payload.errorMessage) {
      return payload.error ?? payload.errorMessage ?? null;
    }

    if (payload.errorCode || payload.sqlState) {
      const parts: string[] = [];
      if (payload.errorCode) parts.push(`error code ${payload.errorCode}`);
      if (payload.sqlState) parts.push(`SQL state ${payload.sqlState}`);
      if (payload.message) parts.push(payload.message);
      return parts.length > 0 ? `Snowflake query failed: ${parts.join(' - ')}` : 'Snowflake query failed';
    }

    if (payload.code && payload.code !== '00000' && payload.code !== '0000') {
      const message = payload.message ? `: ${payload.message}` : '';
      return `Snowflake query failed with code ${payload.code}${message}`;
    }

    return null;
  }

  private async collectQueryRows(initial: SnowflakeQueryResponseBody): Promise<{ rows: any[]; finalPayload: SnowflakeQueryResponseBody; }> {
    const rows = [...this.extractRows(initial)];
    const visited = new Set<string>();
    let nextUri = this.resolveNextUri(initial);
    let current = initial;

    while (nextUri && !visited.has(nextUri)) {
      visited.add(nextUri);
      const chunkResponse = await this.get<SnowflakeQueryResponseBody>(nextUri);
      if (!chunkResponse.success) {
        throw new Error(chunkResponse.error || `Failed to fetch Snowflake query results from ${nextUri}`);
      }

      const chunk = chunkResponse.data;
      if (!chunk || typeof chunk !== 'object') {
        break;
      }

      const error = this.extractError(chunk);
      if (error) {
        throw new Error(error);
      }

      rows.push(...this.extractRows(chunk));
      current = chunk;
      const resolvedNext = this.resolveNextUri(chunk);
      if (!resolvedNext || visited.has(resolvedNext)) {
        nextUri = undefined;
      } else {
        nextUri = resolvedNext;
      }
    }

    return { rows, finalPayload: current };
  }

  private extractRows(payload: SnowflakeQueryResponseBody): any[] {
    if (!payload) {
      return [];
    }

    if (Array.isArray(payload.data)) {
      return payload.data;
    }
    if (Array.isArray(payload.rowset)) {
      return payload.rowset;
    }
    if (Array.isArray(payload.rowSet)) {
      return payload.rowSet;
    }
    if (Array.isArray(payload.rows)) {
      return payload.rows;
    }

    return [];
  }

  private resolveNextUri(payload: SnowflakeQueryResponseBody): string | undefined {
    if (!payload) {
      return undefined;
    }

    if (payload.nextUri && payload.nextUri.trim().length > 0) {
      return payload.nextUri;
    }

    if (payload.statementStatusUrl && payload.statementStatusUrl.trim().length > 0) {
      return payload.statementStatusUrl;
    }

    const meta = payload.resultSetMetaData as Record<string, any> | null | undefined;
    const metaNext = meta && typeof meta === 'object' ? meta.nextUri : undefined;
    if (typeof metaNext === 'string' && metaNext.trim().length > 0) {
      return metaNext;
    }

    return undefined;
  }

  private removeUndefined<T extends Record<string, any>>(payload: T): T {
    for (const key of Object.keys(payload)) {
      if (payload[key] === undefined) {
        delete payload[key];
      }
    }
    return payload;
  }

  private static normalizeAccount(input: string): string {
    const trimmed = input.trim();
    const withoutProtocol = trimmed.replace(/^https?:\/\//i, '');
    const withoutDomain = withoutProtocol.replace(/\.snowflakecomputing\.com.*$/i, '');
    return withoutDomain;
  }
}
