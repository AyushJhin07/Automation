import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

interface HellosignCredentials extends APICredentials {
  apiKey?: string;
  accessToken?: string;
}

interface SendSignatureRequestParams {
  title?: string;
  subject?: string;
  message?: string;
  signers: Array<Record<string, any>>;
  cc_email_addresses?: string[];
  files?: Array<{ name: string; fileBase64: string }>;
  metadata?: Record<string, any>;
  test_mode?: boolean;
  custom_fields?: Array<Record<string, any>>;
  [key: string]: any;
}

interface SignatureRequestIdentifier {
  signature_request_id: string;
}

interface RemindSignatureRequestParams extends SignatureRequestIdentifier {
  email_address: string;
}

interface EmbeddedSignUrlParams {
  signature_id: string;
}

interface CreateTemplateParams {
  title: string;
  subject?: string;
  message?: string;
  signers: Array<Record<string, any>>;
  cc_roles?: string[];
  files?: Array<{ name: string; fileBase64: string }>;
  [key: string]: any;
}

interface SendWithTemplateParams {
  template_id: string;
  title?: string;
  subject?: string;
  message?: string;
  signers: Array<Record<string, any>>;
  cc_email_addresses?: string[];
  custom_fields?: Record<string, any>;
  metadata?: Record<string, any>;
  [key: string]: any;
}

export class HellosignAPIClient extends BaseAPIClient {
  private readonly authHeader: string;

  constructor(credentials: HellosignCredentials) {
    super('https://api.hellosign.com/v3', credentials);
    const apiKey = credentials.apiKey || credentials.accessToken;
    if (!apiKey) {
      throw new Error('HelloSign integration requires an API key');
    }
    this.authHeader = `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`;

    this.registerAliasHandlers({
      test_connection: 'testConnection',
      get_account: 'getAccount',
      send_signature_request: 'sendSignatureRequest',
      get_signature_request: 'getSignatureRequest',
      list_signature_requests: 'listSignatureRequests',
      remind_signature_request: 'remindSignatureRequest',
      cancel_signature_request: 'cancelSignatureRequest',
      download_files: 'downloadFiles',
      create_embedded_signature_request: 'createEmbeddedSignatureRequest',
      get_embedded_sign_url: 'getEmbeddedSignUrl',
      create_template: 'createTemplate',
      get_template: 'getTemplate',
      send_with_template: 'sendWithTemplate',
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      Authorization: this.authHeader,
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/account');
  }

  public async getAccount(): Promise<APIResponse<any>> {
    return this.get('/account');
  }

  public async sendSignatureRequest(params: SendSignatureRequestParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['signers']);
    return this.post('/signature_request/send', params);
  }

  public async getSignatureRequest(params: SignatureRequestIdentifier): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['signature_request_id']);
    return this.get(`/signature_request/${encodeURIComponent(params.signature_request_id)}`);
  }

  public async listSignatureRequests(params: { page?: number; page_size?: number } = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString(params);
    return this.get(`/signature_request/list${query}`);
  }

  public async remindSignatureRequest(params: RemindSignatureRequestParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['signature_request_id', 'email_address']);
    return this.post(`/signature_request/remind/${encodeURIComponent(params.signature_request_id)}`, {
      email_address: params.email_address,
    });
  }

  public async cancelSignatureRequest(params: SignatureRequestIdentifier): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['signature_request_id']);
    return this.post(`/signature_request/cancel/${encodeURIComponent(params.signature_request_id)}`);
  }

  public async downloadFiles(
    params: SignatureRequestIdentifier & { file_type?: 'pdf' | 'zip' }
  ): Promise<APIResponse<{ content: string; contentType: string }>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['signature_request_id']);
    const query = this.buildQueryString({ file_type: params.file_type ?? 'pdf' });
    const response = await fetch(`${this.baseURL}/signature_request/files/${encodeURIComponent(params.signature_request_id)}${query}`, {
      method: 'GET',
      headers: {
        ...this.getAuthHeaders(),
        Accept: params.file_type === 'zip' ? 'application/zip' : 'application/pdf',
      },
    });

    const arrayBuffer = await response.arrayBuffer();
    if (!response.ok) {
      const errorText = Buffer.from(arrayBuffer).toString('utf8');
      return { success: false, error: errorText || `HTTP ${response.status}` };
    }

    const content = Buffer.from(arrayBuffer).toString('base64');
    const contentType = response.headers.get('content-type') || (params.file_type === 'zip' ? 'application/zip' : 'application/pdf');
    return { success: true, data: { content, contentType } };
  }

  public async createEmbeddedSignatureRequest(params: SendSignatureRequestParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['signers']);
    return this.post('/signature_request/create_embedded', params);
  }

  public async getEmbeddedSignUrl(params: EmbeddedSignUrlParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['signature_id']);
    return this.get(`/embedded/sign_url/${encodeURIComponent(params.signature_id)}`);
  }

  public async createTemplate(params: CreateTemplateParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['title', 'signers']);
    return this.post('/template/create', params);
  }

  public async getTemplate(params: { template_id: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['template_id']);
    return this.get(`/template/${encodeURIComponent(params.template_id)}`);
  }

  public async sendWithTemplate(params: SendWithTemplateParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['template_id', 'signers']);
    return this.post('/signature_request/send_with_template', params);
  }
}
