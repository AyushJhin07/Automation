import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

interface DocusignCredentials extends APICredentials {
  accessToken?: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  tokenUrl?: string;
  expiresAt?: string | number;
  accountId?: string;
  baseUrl?: string;
  baseUri?: string;
}

interface EnvelopeDocument {
  documentId: string;
  name: string;
  fileBase64?: string;
  fileExtension?: string;
  [key: string]: any;
}

interface RecipientDefinition {
  signers?: Array<Record<string, any>>;
  carbonCopies?: Array<Record<string, any>>;
  [key: string]: any;
}

interface CreateEnvelopeParams {
  accountId?: string;
  emailSubject: string;
  documents: EnvelopeDocument[];
  recipients: RecipientDefinition;
  status?: string;
  eventNotification?: Record<string, any>;
}

interface EnvelopeIdentifier {
  accountId?: string;
  envelopeId: string;
}

interface ListEnvelopesParams {
  accountId?: string;
  fromDate?: string;
  toDate?: string;
  status?: string;
}

interface DownloadDocumentParams extends EnvelopeIdentifier {
  documentId: string;
}

interface VoidEnvelopeParams extends EnvelopeIdentifier {
  voidedReason?: string;
}

function resolveBaseUrl(credentials: DocusignCredentials): { baseUrl: string; accountId: string } {
  const accountId = credentials.accountId;
  if (!accountId) {
    throw new Error('DocuSign integration requires an accountId in credentials');
  }

  if (credentials.baseUrl) {
    const trimmed = credentials.baseUrl.replace(/\/$/, '');
    return { baseUrl: trimmed.includes('/accounts/') ? trimmed : `${trimmed}/accounts/${accountId}`, accountId };
  }

  const baseUri = (credentials.baseUri ?? 'https://na3.docusign.net/restapi').replace(/\/$/, '');
  const withVersion = baseUri.match(/\/v\d\.\d\/accounts\//)
    ? baseUri
    : `${baseUri}/v2.1/accounts/${accountId}`;

  return { baseUrl: withVersion, accountId };
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

export class DocusignAPIClient extends BaseAPIClient {
  private readonly tokenEndpoint: string;
  private refreshPromise?: Promise<void>;
  private readonly refreshSkewMs = 60_000;
  private readonly accountId: string;

  constructor(credentials: DocusignCredentials) {
    const { baseUrl, accountId } = resolveBaseUrl(credentials);
    super(baseUrl, credentials);
    this.accountId = accountId;
    this.tokenEndpoint = credentials.tokenUrl ?? 'https://account.docusign.com/oauth/token';

    this.registerAliasHandlers({
      test_connection: 'testConnection',
      create_envelope: 'createEnvelope',
      get_envelope: 'getEnvelope',
      list_envelopes: 'listEnvelopes',
      get_envelope_status: 'getEnvelopeStatus',
      get_recipients: 'getEnvelopeRecipients',
      download_document: 'downloadDocument',
      void_envelope: 'voidEnvelope',
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const token = this.credentials.accessToken;
    if (!token) {
      throw new Error('DocuSign integration requires an access token');
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
      throw new Error('DocuSign refresh requires refreshToken, clientId, and clientSecret');
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
          throw new Error(`DocuSign token refresh failed: ${response.status} ${response.statusText}`);
        }

        const payload = await response.json();
        this.credentials.accessToken = payload.access_token;
        if (payload.refresh_token) {
          this.credentials.refreshToken = payload.refresh_token;
        }
        if (payload.expires_in) {
          this.credentials.expiresAt = Date.now() + Number(payload.expires_in) * 1000;
        }

        if (typeof this.credentials.onTokenRefreshed === 'function') {
          await this.credentials.onTokenRefreshed({
            accessToken: this.credentials.accessToken!,
            refreshToken: this.credentials.refreshToken,
            expiresAt: parseExpiryTimestamp(this.credentials.expiresAt),
          });
        }

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
    headers: Record<string, string> = {}
  ): Promise<APIResponse<T>> {
    await this.ensureAccessToken();
    return super.makeRequest(method, endpoint, data, headers);
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/users?count=1');
  }

  public async createEnvelope(params: CreateEnvelopeParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['emailSubject', 'documents', 'recipients']);
    const payload = {
      emailSubject: params.emailSubject,
      documents: params.documents,
      recipients: params.recipients,
      status: params.status ?? 'created',
      eventNotification: params.eventNotification,
    };
    return this.post('/envelopes', payload);
  }

  public async getEnvelope(params: EnvelopeIdentifier): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['envelopeId']);
    return this.get(`/envelopes/${encodeURIComponent(params.envelopeId)}`);
  }

  public async getEnvelopeStatus(params: EnvelopeIdentifier): Promise<APIResponse<any>> {
    return this.getEnvelope(params);
  }

  public async getEnvelopeRecipients(params: EnvelopeIdentifier): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['envelopeId']);
    return this.get(`/envelopes/${encodeURIComponent(params.envelopeId)}/recipients`);
  }

  public async listEnvelopes(params: ListEnvelopesParams = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString({
      from_date: params.fromDate,
      to_date: params.toDate,
      status: params.status,
    });
    return this.get(`/envelopes${query}`);
  }

  public async downloadDocument(params: DownloadDocumentParams): Promise<APIResponse<{ content: string; contentType: string }>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['envelopeId', 'documentId']);
    await this.ensureAccessToken();

    const response = await fetch(`${this.baseURL}/envelopes/${encodeURIComponent(params.envelopeId)}/documents/${encodeURIComponent(params.documentId)}`, {
      method: 'GET',
      headers: {
        ...this.getAuthHeaders(),
        Accept: 'application/pdf',
      },
    });

    const arrayBuffer = await response.arrayBuffer();
    if (!response.ok) {
      const errorText = Buffer.from(arrayBuffer).toString('utf8');
      return { success: false, error: errorText || `HTTP ${response.status}` };
    }

    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const contentType = response.headers.get('content-type') || 'application/pdf';
    return { success: true, data: { content: base64, contentType } };
  }

  public async voidEnvelope(params: VoidEnvelopeParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['envelopeId']);
    const body = {
      status: 'voided',
      voidedReason: params.voidedReason,
    };
    return this.put(`/envelopes/${encodeURIComponent(params.envelopeId)}`, body);
  }
}
