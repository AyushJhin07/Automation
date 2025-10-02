import { APIResponse, APICredentials, BaseAPIClient } from './BaseAPIClient';

export interface DocusignCredentials extends APICredentials {
  accessToken: string;
  accountId: string;
  baseUrl?: string;
}

export interface DocusignDocument {
  documentBase64: string;
  name: string;
  documentId: string;
  fileExtension?: string;
}

export interface DocusignRecipient {
  email: string;
  name: string;
  recipientId: string;
  routingOrder?: string;
  tabs?: Record<string, any>;
}

export interface CreateEnvelopeParams {
  accountId?: string;
  emailSubject: string;
  status?: 'sent' | 'created' | 'draft';
  documents: DocusignDocument[];
  recipients: {
    signers?: DocusignRecipient[];
    carbonCopies?: Array<{ email: string; name: string; recipientId: string }>;
  };
  eventNotification?: Record<string, any>;
}

export interface EnvelopeIdentifier {
  accountId?: string;
  envelopeId: string;
}

export interface DownloadDocumentParams extends EnvelopeIdentifier {
  documentId: string;
}

/**
 * DocuSign eSignature API client supporting the envelope lifecycle flows from the connector.
 */
export class DocusignAPIClient extends BaseAPIClient {
  private readonly accountId: string;

  constructor(credentials: DocusignCredentials) {
    const baseUrl = DocusignAPIClient.resolveBaseUrl(credentials);
    super(baseUrl, credentials);
    if (!credentials.accountId) {
      throw new Error('DocuSign credentials must include an accountId');
    }
    this.accountId = credentials.accountId;

    this.registerHandlers({
      test_connection: this.testConnection.bind(this) as any,
      create_envelope: this.createEnvelope.bind(this) as any,
      get_envelope: this.getEnvelope.bind(this) as any,
      list_envelopes: this.listEnvelopes.bind(this) as any,
      get_envelope_status: this.getEnvelopeStatus.bind(this) as any,
      get_recipients: this.getRecipients.bind(this) as any,
      download_document: this.downloadDocument.bind(this) as any,
      void_envelope: this.voidEnvelope.bind(this) as any,
    });
  }

  private static resolveBaseUrl(credentials: DocusignCredentials): string {
    if (credentials.baseUrl) {
      return credentials.baseUrl.replace(/\/$/, '');
    }
    return 'https://na3.docusign.net/restapi/v2.1';
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.credentials.accessToken}`
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get(`/accounts/${encodeURIComponent(this.accountId)}`);
  }

  public async createEnvelope(params: CreateEnvelopeParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['emailSubject', 'documents', 'recipients']);
    const accountId = this.resolveAccountId(params.accountId);
    const payload = {
      emailSubject: params.emailSubject,
      status: params.status ?? 'sent',
      documents: params.documents,
      recipients: params.recipients,
      eventNotification: params.eventNotification,
    };
    return this.post(`/accounts/${encodeURIComponent(accountId)}/envelopes`, payload);
  }

  public async getEnvelope(params: EnvelopeIdentifier): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['envelopeId']);
    const accountId = this.resolveAccountId(params.accountId);
    return this.get(`/accounts/${encodeURIComponent(accountId)}/envelopes/${encodeURIComponent(params.envelopeId)}`);
  }

  public async listEnvelopes(params: { accountId?: string; fromDate?: string; status?: string } & Record<string, any>): Promise<APIResponse<any>> {
    const { accountId, ...query } = params;
    const resolvedAccountId = this.resolveAccountId(accountId);
    const qs = this.buildQueryString(query);
    return this.get(`/accounts/${encodeURIComponent(resolvedAccountId)}/envelopes${qs}`);
  }

  public async getEnvelopeStatus(params: EnvelopeIdentifier): Promise<APIResponse<any>> {
    return this.getEnvelope(params);
  }

  public async getRecipients(params: EnvelopeIdentifier): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['envelopeId']);
    const accountId = this.resolveAccountId(params.accountId);
    return this.get(`/accounts/${encodeURIComponent(accountId)}/envelopes/${encodeURIComponent(params.envelopeId)}/recipients`);
  }

  public async downloadDocument(params: DownloadDocumentParams): Promise<APIResponse<ArrayBuffer>> {
    this.validateRequiredParams(params, ['envelopeId', 'documentId']);
    const accountId = this.resolveAccountId(params.accountId);
    return this.makeRequest<ArrayBuffer>(
      'GET',
      `/accounts/${encodeURIComponent(accountId)}/envelopes/${encodeURIComponent(params.envelopeId)}/documents/${encodeURIComponent(params.documentId)}`,
      undefined,
      { Accept: 'application/pdf' }
    );
  }

  public async voidEnvelope(params: EnvelopeIdentifier & { voidedReason?: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['envelopeId']);
    const accountId = this.resolveAccountId(params.accountId);
    const payload = {
      status: 'voided',
      voidedReason: params.voidedReason ?? 'Voided via automation',
    };
    return this.put(`/accounts/${encodeURIComponent(accountId)}/envelopes/${encodeURIComponent(params.envelopeId)}`, payload);
  }

  private resolveAccountId(accountId?: string): string {
    const resolved = accountId ?? this.accountId;
    if (!resolved) {
      throw new Error('DocuSign accountId is required for this operation');
    }
    return resolved;
  }
}
