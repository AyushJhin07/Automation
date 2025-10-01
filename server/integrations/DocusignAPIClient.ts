import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

export interface DocusignCredentials extends APICredentials {
  /**
   * Optional base URL for the tenant specific DocuSign REST API endpoint.
   * Defaults to the public NA3 environment.
   */
  baseUrl?: string;
  /**
   * Account identifier used for most envelope operations.
   */
  accountId?: string;
}

type EnvelopeDocument = {
  documentBase64: string;
  name: string;
  fileExtension?: string;
  documentId?: string;
};

type EnvelopeRecipient = {
  email: string;
  name: string;
  recipientId: string;
  routingOrder?: string;
  tabs?: Record<string, any>;
};

type EnvelopeCarbonCopy = {
  email: string;
  name: string;
  recipientId: string;
};

interface CreateEnvelopeInput {
  accountId?: string;
  emailSubject: string;
  status?: 'sent' | 'created' | 'draft';
  documents: EnvelopeDocument[];
  recipients: {
    signers?: EnvelopeRecipient[];
    carbonCopies?: EnvelopeCarbonCopy[];
  };
  eventNotification?: Record<string, any>;
}

interface GetEnvelopeInput {
  accountId?: string;
  envelopeId: string;
  include?: string;
}

interface ListEnvelopesInput {
  accountId?: string;
  status?: string;
  from_date?: string;
  to_date?: string;
  folder?: string;
  start_position?: number;
  count?: number;
}

interface DownloadDocumentInput {
  accountId?: string;
  envelopeId: string;
  documentId?: string;
  encoding?: 'base64' | 'binary';
}

interface UpdateEnvelopeStateInput {
  accountId?: string;
  envelopeId: string;
  voidReason?: string;
}

export class DocusignAPIClient extends BaseAPIClient {
  private readonly defaultAccountId?: string;

  constructor(credentials: DocusignCredentials) {
    const baseUrl = (credentials.baseUrl || 'https://na3.docusign.net/restapi').replace(/\/$/, '');
    super(baseUrl, credentials);

    this.defaultAccountId = credentials.accountId;

    this.registerHandlers({
      test_connection: () => this.testConnection(),
      create_envelope: params => this.createEnvelope(params as CreateEnvelopeInput),
      get_envelope: params => this.getEnvelope(params as GetEnvelopeInput),
      list_envelopes: params => this.listEnvelopes(params as ListEnvelopesInput),
      get_envelope_status: params => this.getEnvelopeStatus(params as GetEnvelopeInput),
      get_recipients: params => this.getEnvelopeRecipients(params as GetEnvelopeInput),
      download_document: params => this.downloadDocument(params as DownloadDocumentInput),
      void_envelope: params => this.voidEnvelope(params as UpdateEnvelopeStateInput)
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const token = this.credentials.accessToken;
    if (!token) {
      throw new Error('DocuSign integration requires an OAuth access token.');
    }

    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    const accountId = this.defaultAccountId;
    if (accountId) {
      return this.get(`/accounts/${accountId}`, this.getAuthHeaders());
    }

    return this.get('/accounts', this.getAuthHeaders());
  }

  private resolveAccountId(provided?: string): string {
    const accountId = provided || this.defaultAccountId || (this.credentials as DocusignCredentials).accountId;
    if (!accountId) {
      throw new Error('DocuSign accountId must be supplied in credentials or request parameters.');
    }
    return accountId;
  }

  private pruneObject<T extends Record<string, any>>(value?: T | null): T | undefined {
    if (!value) {
      return undefined;
    }

    const cleaned: Record<string, any> = {};
    for (const [key, fieldValue] of Object.entries(value)) {
      if (fieldValue === undefined || fieldValue === null) {
        continue;
      }
      cleaned[key] = fieldValue;
    }

    return cleaned as T;
  }

  public async createEnvelope(params: CreateEnvelopeInput): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['emailSubject', 'documents', 'recipients']);
    const accountId = this.resolveAccountId(params.accountId);

    const documents = params.documents.map((doc, index) =>
      this.pruneObject({
        documentBase64: doc.documentBase64,
        name: doc.name,
        fileExtension: doc.fileExtension,
        documentId: doc.documentId || String(index + 1)
      })
    );

    const payload = this.pruneObject({
      emailSubject: params.emailSubject,
      status: params.status || 'sent',
      documents,
      recipients: this.pruneObject({
        signers: params.recipients?.signers,
        carbonCopies: params.recipients?.carbonCopies
      }),
      eventNotification: params.eventNotification && this.pruneObject(params.eventNotification)
    });

    return this.post(`/accounts/${accountId}/envelopes`, payload, this.getAuthHeaders());
  }

  public async getEnvelope(params: GetEnvelopeInput): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['envelopeId']);
    const accountId = this.resolveAccountId(params.accountId);
    const query = this.buildQueryString(this.pruneObject({ include: params.include }) ?? {});
    return this.get(`/accounts/${accountId}/envelopes/${params.envelopeId}${query}`, this.getAuthHeaders());
  }

  public async getEnvelopeStatus(params: GetEnvelopeInput): Promise<APIResponse<any>> {
    return this.getEnvelope(params);
  }

  public async listEnvelopes(params: ListEnvelopesInput): Promise<APIResponse<any>> {
    const accountId = this.resolveAccountId(params.accountId);
    const query = this.buildQueryString(this.pruneObject({
      status: params.status,
      from_date: params.from_date,
      to_date: params.to_date,
      folder: params.folder,
      start_position: params.start_position,
      count: params.count
    }) ?? {});

    return this.get(`/accounts/${accountId}/envelopes${query}`, this.getAuthHeaders());
  }

  public async getEnvelopeRecipients(params: GetEnvelopeInput): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['envelopeId']);
    const accountId = this.resolveAccountId(params.accountId);
    return this.get(`/accounts/${accountId}/envelopes/${params.envelopeId}/recipients`, this.getAuthHeaders());
  }

  public async downloadDocument(params: DownloadDocumentInput): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['envelopeId']);
    const accountId = this.resolveAccountId(params.accountId);
    const documentId = params.documentId || 'combined';
    const query = params.encoding ? this.buildQueryString({ encoding: params.encoding }) : '';

    const url = `${this.baseURL}/accounts/${accountId}/envelopes/${params.envelopeId}/documents/${documentId}${query}`;
    const headers = {
      ...this.getAuthHeaders(),
      Accept: params.encoding === 'base64' ? 'application/json' : 'application/pdf'
    };

    const response = await fetch(url, { method: 'GET', headers });
    this.updateRateLimitInfo(response.headers);

    if (!response.ok) {
      const text = await response.text();
      return {
        success: false,
        statusCode: response.status,
        error: text || `Failed to download document ${documentId}`
      };
    }

    if (params.encoding === 'base64') {
      const json = await response.json();
      return {
        success: true,
        statusCode: response.status,
        data: json,
        headers: Object.fromEntries(response.headers.entries())
      };
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    return {
      success: true,
      statusCode: response.status,
      data: {
        documentId,
        contentType: response.headers.get('content-type') || 'application/pdf',
        contentBase64: buffer.toString('base64')
      },
      headers: Object.fromEntries(response.headers.entries())
    };
  }

  public async voidEnvelope(params: UpdateEnvelopeStateInput): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['envelopeId']);
    const accountId = this.resolveAccountId(params.accountId);

    const payload = this.pruneObject({
      status: 'voided',
      voidedReason: params.voidReason
    });

    return this.put(`/accounts/${accountId}/envelopes/${params.envelopeId}`, payload, this.getAuthHeaders());
  }
}