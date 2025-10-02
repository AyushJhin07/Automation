import { APIResponse, APICredentials, BaseAPIClient } from './BaseAPIClient';

export interface HelloSignCredentials extends APICredentials {
  accessToken: string;
}

export interface HelloSignSigner {
  emailAddress: string;
  name: string;
  order?: number;
  pin?: string;
  redirectUrl?: string;
  role?: string;
}

export interface HelloSignFile {
  name: string;
  fileData: string; // base64
}

export interface SendSignatureRequestParams {
  title?: string;
  subject?: string;
  message?: string;
  signers: HelloSignSigner[];
  files: HelloSignFile[];
  testMode?: boolean;
  metadata?: Record<string, any>;
  ccEmailAddresses?: string[];
}

export interface SignatureRequestIdentifier {
  signatureRequestId: string;
}

export interface CreateTemplateParams {
  title: string;
  subject?: string;
  message?: string;
  signers: Array<{ name: string; role: string; order?: number }>;
  files: HelloSignFile[];
  testMode?: boolean;
}

export interface SendWithTemplateParams {
  templateId: string;
  signers: Array<{ role: string; name: string; emailAddress: string }>;
  customFields?: Record<string, any>;
  message?: string;
  subject?: string;
  testMode?: boolean;
}

/**
 * Dropbox Sign (HelloSign) API client implementing signature request flows.
 */
export class HellosignAPIClient extends BaseAPIClient {
  constructor(credentials: HelloSignCredentials) {
    super('https://api.hellosign.com/v3', credentials);

    this.registerHandlers({
      test_connection: this.testConnection.bind(this) as any,
      get_account: this.getAccount.bind(this) as any,
      send_signature_request: this.sendSignatureRequest.bind(this) as any,
      get_signature_request: this.getSignatureRequest.bind(this) as any,
      list_signature_requests: this.listSignatureRequests.bind(this) as any,
      remind_signature_request: this.remindSignatureRequest.bind(this) as any,
      cancel_signature_request: this.cancelSignatureRequest.bind(this) as any,
      download_files: this.downloadFiles.bind(this) as any,
      create_embedded_signature_request: this.createEmbeddedSignatureRequest.bind(this) as any,
      get_embedded_sign_url: this.getEmbeddedSignUrl.bind(this) as any,
      create_template: this.createTemplate.bind(this) as any,
      get_template: this.getTemplate.bind(this) as any,
      send_with_template: this.sendWithTemplate.bind(this) as any,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.credentials.accessToken}`
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/account');
  }

  public async getAccount(): Promise<APIResponse<any>> {
    return this.get('/account');
  }

  public async sendSignatureRequest(params: SendSignatureRequestParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['signers', 'files']);
    return this.post('/signature_request/send', this.transformSignatureRequest(params));
  }

  public async createEmbeddedSignatureRequest(params: SendSignatureRequestParams & { clientId: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['clientId', 'signers', 'files']);
    return this.post('/signature_request/create_embedded', this.transformSignatureRequest(params));
  }

  public async getSignatureRequest(params: SignatureRequestIdentifier): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['signatureRequestId']);
    return this.get(`/signature_request/${encodeURIComponent(params.signatureRequestId)}`);
  }

  public async listSignatureRequests(params: { page?: number; pageSize?: number } = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString(params as Record<string, any>);
    return this.get(`/signature_request/list${query}`);
  }

  public async remindSignatureRequest(params: SignatureRequestIdentifier & { emailAddress: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['signatureRequestId', 'emailAddress']);
    return this.post(`/signature_request/remind/${encodeURIComponent(params.signatureRequestId)}`, {
      email_address: params.emailAddress,
    });
  }

  public async cancelSignatureRequest(params: SignatureRequestIdentifier): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['signatureRequestId']);
    return this.post(`/signature_request/cancel/${encodeURIComponent(params.signatureRequestId)}`);
  }

  public async downloadFiles(params: SignatureRequestIdentifier & { fileType?: 'zip' | 'pdf' }): Promise<APIResponse<ArrayBuffer>> {
    this.validateRequiredParams(params, ['signatureRequestId']);
    const query = this.buildQueryString({ file_type: params.fileType ?? 'pdf' });
    return this.makeRequest<ArrayBuffer>(
      'GET',
      `/signature_request/files/${encodeURIComponent(params.signatureRequestId)}${query}`,
      undefined,
      { Accept: 'application/pdf' }
    );
  }

  public async getEmbeddedSignUrl(params: { signatureId: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['signatureId']);
    return this.get(`/embedded/sign_url/${encodeURIComponent(params.signatureId)}`);
  }

  public async createTemplate(params: CreateTemplateParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['title', 'signers', 'files']);
    return this.post('/template/create', this.transformTemplatePayload(params));
  }

  public async getTemplate(params: { templateId: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['templateId']);
    return this.get(`/template/${encodeURIComponent(params.templateId)}`);
  }

  public async sendWithTemplate(params: SendWithTemplateParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['templateId', 'signers']);
    const payload: Record<string, any> = {
      template_id: params.templateId,
      signers: params.signers.map(s => ({
        role: s.role,
        name: s.name,
        email_address: s.emailAddress,
      })),
    };
    if (params.customFields) {
      payload.custom_fields = params.customFields;
    }
    if (params.message) payload.message = params.message;
    if (params.subject) payload.subject = params.subject;
    if (params.testMode !== undefined) payload.test_mode = params.testMode ? 1 : 0;
    return this.post('/signature_request/send_with_template', payload);
  }

  private transformSignatureRequest(params: SendSignatureRequestParams & { clientId?: string }): Record<string, any> {
    const payload: Record<string, any> = {
      signers: params.signers.map((signer, index) => ({
        email_address: signer.emailAddress,
        name: signer.name,
        order: signer.order ?? index + 1,
        pin: signer.pin,
        redirect_url: signer.redirectUrl,
        role: signer.role,
      })),
      files: params.files.map(file => ({
        name: file.name,
        file_base64: file.fileData,
      })),
    };

    if (params.title) payload.title = params.title;
    if (params.subject) payload.subject = params.subject;
    if (params.message) payload.message = params.message;
    if (params.ccEmailAddresses?.length) payload.cc_email_addresses = params.ccEmailAddresses;
    if (params.metadata) payload.metadata = params.metadata;
    if (params.testMode !== undefined) payload.test_mode = params.testMode ? 1 : 0;
    if (params.clientId) payload.client_id = params.clientId;

    return payload;
  }

  private transformTemplatePayload(params: CreateTemplateParams): Record<string, any> {
    const payload: Record<string, any> = {
      title: params.title,
      signers: params.signers.map((signer, index) => ({
        name: signer.name,
        role: signer.role,
        order: signer.order ?? index + 1,
      })),
      files: params.files.map(file => ({
        name: file.name,
        file_base64: file.fileData,
      })),
    };

    if (params.subject) payload.subject = params.subject;
    if (params.message) payload.message = params.message;
    if (params.testMode !== undefined) payload.test_mode = params.testMode ? 1 : 0;

    return payload;
  }
}
