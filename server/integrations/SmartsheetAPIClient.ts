import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

export class SmartsheetAPIClient extends BaseAPIClient {
  constructor(credentials: APICredentials) {
    const token = credentials.accessToken || credentials.apiKey;
    if (!token) {
      throw new Error('Smartsheet integration requires accessToken or apiKey');
    }
    super('https://api.smartsheet.com/2.0', credentials);
    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'list_sheets': this.listSheets.bind(this) as any,
      'add_row': this.addRow.bind(this) as any,
      'update_row': this.updateRow.bind(this) as any,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const token = this.credentials.accessToken || this.credentials.apiKey || '';
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/users/me', this.getAuthHeaders());
  }

  public async listSheets(params: { includeAll?: boolean } = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString({ includeAll: params.includeAll ? 'true' : undefined });
    return this.get(`/sheets${query}`, this.getAuthHeaders());
  }

  public async addRow(params: { sheetId: number | string; row: Record<string, any> }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['sheetId', 'row']);
    return this.post(`/sheets/${params.sheetId}/rows`, {
      toBottom: true,
      rows: [params.row]
    }, this.getAuthHeaders());
  }

  public async updateRow(params: { sheetId: number | string; rows: Record<string, any>[] }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['sheetId', 'rows']);
    return this.put(`/sheets/${params.sheetId}/rows`, params.rows, this.getAuthHeaders());
  }
}

