import { BaseAPIClient, APICredentials, APIResponse } from './BaseAPIClient';

export interface SheetsAppendRowParams {
  spreadsheetId?: string;
  sheetId?: string;
  sheetName?: string;
  values?: any[];
  row?: any[] | Record<string, any>;
  data?: any[] | Record<string, any>;
  [key: string]: any;
}

export class LocalSheetsAPIClient extends BaseAPIClient {
  private static sheets = new Map<string, Map<string, any[][]>>();

  constructor(credentials: APICredentials) {
    super('local://sheets', credentials);
  }

  protected getAuthHeaders(): Record<string, string> {
    return {};
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return {
      success: true,
      data: { message: 'Local Sheets client ready' }
    };
  }

  public async appendRow(params: SheetsAppendRowParams): Promise<APIResponse<any>> {
    const spreadsheetKey =
      params.spreadsheetId ||
      params.sheetId ||
      params.spreadsheetUrl ||
      this.credentials.spreadsheetId ||
      'default';

    const sheetName = params.sheetName || params.tabName || 'Sheet1';
    const values = this.extractRowValues(params);

    if (!LocalSheetsAPIClient.sheets.has(spreadsheetKey)) {
      LocalSheetsAPIClient.sheets.set(spreadsheetKey, new Map());
    }

    const sheets = LocalSheetsAPIClient.sheets.get(spreadsheetKey)!;
    if (!sheets.has(sheetName)) {
      sheets.set(sheetName, []);
    }

    const sheet = sheets.get(sheetName)!;
    sheet.push(values);

    return {
      success: true,
      data: {
        spreadsheetId: spreadsheetKey,
        sheetName,
        rowIndex: sheet.length - 1,
        values
      }
    };
  }

  private extractRowValues(params: SheetsAppendRowParams): any[] {
    if (Array.isArray(params.values)) {
      return params.values;
    }

    if (Array.isArray(params.row)) {
      return params.row;
    }

    if (Array.isArray(params.data)) {
      return params.data;
    }

    if (params.row && typeof params.row === 'object') {
      return Object.values(params.row);
    }

    if (params.data && typeof params.data === 'object') {
      return Object.values(params.data);
    }

    const entries = Object.entries(params)
      .filter(([key]) => !['spreadsheetId', 'sheetId', 'sheetName', 'tabName', 'values', 'row', 'data'].includes(key));

    if (entries.length > 0) {
      return entries.map(([, value]) => value);
    }

    return [];
  }
}

export interface TimeDelayParams {
  hours?: number;
  minutes?: number;
  seconds?: number;
  delayMs?: number;
  delaySeconds?: number;
  delayMinutes?: number;
  delayHours?: number;
  [key: string]: any;
}

export class LocalTimeAPIClient extends BaseAPIClient {
  constructor(credentials: APICredentials) {
    super('local://time', credentials);
  }

  protected getAuthHeaders(): Record<string, string> {
    return {};
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return {
      success: true,
      data: { message: 'Local Time client ready' }
    };
  }

  public async delay(params: TimeDelayParams): Promise<APIResponse<any>> {
    const delayMs = this.calculateDelayMs(params);

    if (delayMs > 0) {
      const waitMs = Math.min(delayMs, 10);
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }

    return {
      success: true,
      data: {
        delayedMs: delayMs,
        requested: params
      }
    };
  }

  private calculateDelayMs(params: TimeDelayParams): number {
    if (typeof params.delayMs === 'number') {
      return Math.max(0, params.delayMs);
    }

    if (typeof params.delaySeconds === 'number') {
      return Math.max(0, params.delaySeconds * 1000);
    }

    if (typeof params.delayMinutes === 'number') {
      return Math.max(0, params.delayMinutes * 60 * 1000);
    }

    if (typeof params.delayHours === 'number') {
      return Math.max(0, params.delayHours * 60 * 60 * 1000);
    }

    if (typeof params.hours === 'number') {
      return Math.max(0, params.hours * 60 * 60 * 1000);
    }

    if (typeof params.minutes === 'number') {
      return Math.max(0, params.minutes * 60 * 1000);
    }

    if (typeof params.seconds === 'number') {
      return Math.max(0, params.seconds * 1000);
    }

    return 0;
  }
}
