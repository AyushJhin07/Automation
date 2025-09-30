import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

export class PipedriveAPIClient extends BaseAPIClient {
  private token: string;

  constructor(credentials: APICredentials) {
    const companyDomain = credentials.companyDomain || credentials.subdomain;
    const token = credentials.apiToken || credentials.accessToken;
    if (!companyDomain || !token) {
      throw new Error('Pipedrive integration requires companyDomain and apiToken');
    }
    super(`https://${companyDomain}.pipedrive.com/api/v1`, credentials);
    this.token = token;

    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'create_deal': this.createDeal.bind(this) as any,
      'update_deal': this.updateDeal.bind(this) as any,
      'add_note': this.addNote.bind(this) as any,
    });
  }

  private buildUrl(path: string, params: Record<string, any> = {}): string {
    const search = new URLSearchParams({ api_token: this.token });
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) search.append(k, String(v));
    });
    return `${this.baseURL}${path}?${search.toString()}`;
  }

  protected getAuthHeaders(): Record<string, string> {
    return { 'Content-Type': 'application/json' };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    const resp = await fetch(this.buildUrl('/users/me')); 
    const data = await resp.json().catch(() => ({}));
    return resp.ok ? { success: true, data } : { success: false, error: data?.error || `HTTP ${resp.status}` };
  }

  public async createDeal(params: { title: string; value?: number; currency?: string; personId?: number; stageId?: number }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['title']);
    const resp = await fetch(this.buildUrl('/deals'), {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(params)
    });
    const data = await resp.json().catch(() => ({}));
    return resp.ok ? { success: true, data } : { success: false, error: data?.error || `HTTP ${resp.status}` };
  }

  public async updateDeal(params: { dealId: number; updates: Record<string, any> }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['dealId', 'updates']);
    const resp = await fetch(this.buildUrl(`/deals/${params.dealId}`), {
      method: 'PUT',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(params.updates)
    });
    const data = await resp.json().catch(() => ({}));
    return resp.ok ? { success: true, data } : { success: false, error: data?.error || `HTTP ${resp.status}` };
  }

  public async addNote(params: { content: string; dealId?: number; personId?: number }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['content']);
    const resp = await fetch(this.buildUrl('/notes'), {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(params)
    });
    const data = await resp.json().catch(() => ({}));
    return resp.ok ? { success: true, data } : { success: false, error: data?.error || `HTTP ${resp.status}` };
  }
}

