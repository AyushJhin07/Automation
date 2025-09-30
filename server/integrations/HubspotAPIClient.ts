// HUBSPOT API CLIENT (fixed minimal)

import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

export class HubspotAPIClient extends BaseAPIClient {
  constructor(credentials: APICredentials) {
    super('https://api.hubapi.com', credentials);
    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'create_contact': this.createContact.bind(this) as any,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const token = this.credentials.accessToken || this.credentials.token || '';
    return { Authorization: `Bearer ${token}` };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    // List one contact to validate token
    return this.get('/crm/v3/objects/contacts?limit=1', this.getAuthHeaders());
  }

  public async createContact(params: { properties: Record<string, any> }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['properties']);
    return this.post('/crm/v3/objects/contacts', { properties: params.properties }, this.getAuthHeaders());
  }
}

