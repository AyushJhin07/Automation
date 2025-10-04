import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

interface AdobesignCredentials extends APICredentials {
  accessToken?: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  tokenUrl?: string;
  expiresAt?: string | number;
  baseUrl?: string;
}

interface CreateAgreementParams {
  name: string;
  fileInfos: Array<Record<string, any>>;
  participantSetsInfo: Array<Record<string, any>>;
  signatureType?: string;
  state?: string;
  emailOption?: Record<string, any>;
  externalId?: Record<string, any>;
  message?: string;
  [key: string]: any;
}

interface AgreementIdentifier {
  agreementId: string;
}

interface CancelAgreementParams extends AgreementIdentifier {
  reason?: string;
  notifySigner?: boolean;
}

function parseExpiryTimestamp(raw?: string | number): number | undefined {
  if (typeof raw === 'number') {
    return raw;
  }
  if (typeof raw === 'string' && raw) {
    const parsed = Date.parse(raw);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

export class AdobesignAPIClient extends BaseAPIClient {
  private readonly tokenEndpoint: string;
  private refreshPromise?: Promise<void>;
  private readonly refreshSkewMs = 60_000;

  constructor(credentials: AdobesignCredentials) {
    const baseUrl = (credentials.baseUrl ?? 'https://api.na1.echosign.com/api/rest/v6').replace(/\/$/, '');
    super(baseUrl, credentials);
    this.tokenEndpoint = credentials.tokenUrl ?? 'https://api.na1.echosign.com/oauth/token';

    this.registerAliasHandlers({
      test_connection: 'testConnection',
      create_agreement: 'createAgreement',
      send_agreement: 'sendAgreement',
      get_agreement: 'getAgreement',
      cancel_agreement: 'cancelAgreement',
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const token = this.credentials.accessToken;
    if (!token) {
      throw new Error('Adobe Sign integration requires an access token');
    }
    return { Authorization: `Bearer ${token}` };
  }

  private async ensureAccessToken(): Promise<void> {
    const expiresAt = parseExpiryTimestamp(this.credentials.expiresAt);
    const now = Date.now();
    if (this.credentials.accessToken && (!expiresAt || expiresAt - now > this.refreshSkewMs)) {
      return;
    }

    if (!this.credentials.refreshToken || !this.credentials.clientId || !this.credentials.clientSecret) {
      throw new Error('Adobe Sign refresh requires refreshToken, clientId, and clientSecret');
    }

    if (!this.refreshPromise) {
      this.refreshPromise = (async () => {
        const body = new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: this.credentials.refreshToken as string,
          client_id: this.credentials.clientId as string,
          client_secret: this.credentials.clientSecret as string,
        });

        const response = await fetch(this.tokenEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
          },
          body,
        });

        if (!response.ok) {
          this.refreshPromise = undefined;
          throw new Error(`Adobe Sign token refresh failed: ${response.status} ${response.statusText}`);
        }

        const payload = await response.json();
        const expiresAt = payload.expires_in ? Date.now() + Number(payload.expires_in) * 1000 : undefined;
        await this.applyTokenRefresh({
          accessToken: payload.access_token,
          refreshToken: payload.refresh_token,
          expiresAt,
          tokenType: payload.token_type,
          scope: payload.scope,
        });

        this.refreshPromise = undefined;
      })().catch(error => {
        this.refreshPromise = undefined;
        throw error;
      });
    }

    await this.refreshPromise;
  }

  protected override async makeRequest<T = any>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    endpoint: string,
    data?: any,
    headers: Record<string, string> = {},
    options?: any
  ): Promise<APIResponse<T>> {
    await this.ensureAccessToken();
    return super.makeRequest(method, endpoint, data, headers, options);
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/users/me');
  }

  public async createAgreement(params: CreateAgreementParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['name', 'fileInfos', 'participantSetsInfo']);
    return this.post('/agreements', params);
  }

  public async sendAgreement(params: AgreementIdentifier): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['agreementId']);
    const body = { state: 'IN_PROCESS' };
    return this.post(`/agreements/${encodeURIComponent(params.agreementId)}/state`, body);
  }

  public async getAgreement(params: AgreementIdentifier & { includeSupportingDocuments?: boolean }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['agreementId']);
    const query = this.buildQueryString({ includeSupportingDocuments: params.includeSupportingDocuments });
    return this.get(`/agreements/${encodeURIComponent(params.agreementId)}${query}`);
  }

  public async cancelAgreement(params: CancelAgreementParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['agreementId']);
    const body = {
      state: 'CANCELLED',
      note: params.reason,
      notifySigner: params.notifySigner ?? true,
    };
    return this.post(`/agreements/${encodeURIComponent(params.agreementId)}/state`, body);
  }
}
