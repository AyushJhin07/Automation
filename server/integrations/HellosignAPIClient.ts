import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

export interface HellosignCredentials extends APICredentials {
  baseUrl?: string;
  apiKey?: string;
}

type Signer = {
  email_address: string;
  name: string;
  order?: number;
};

type ReminderInput = {
  signature_request_id: string;
  email_address: string;
};

type CancelInput = {
  signature_request_id: string;
};

type DownloadFilesInput = {
  signature_request_id: string;
  file_type?: 'pdf' | 'zip';
  get_url?: boolean;
};

type EmbeddedSignUrlInput = {
  signature_id: string;
};

interface TemplateRole {
  role: string;
  name: string;
  email_address: string;
  order?: number;
}

interface CreateEmbeddedSignatureRequestInput {
  client_id: string;
  subject?: string;
  message?: string;
  signers: Signer[];
  files?: string[];
  file_urls?: string[];
  metadata?: Record<string, any>;
  test_mode?: boolean;
}

interface SendWithTemplateInput {
  template_id: string;
  subject?: string;
  message?: string;
  signers: TemplateRole[];
  custom_fields?: Record<string, any>;
  cc_email_addresses?: string[];
  metadata?: Record<string, any>;
  test_mode?: boolean;
}

interface CreateTemplateInput {
  name: string;
  files?: string[];
  file_urls?: string[];
  signer_roles: { name: string; order?: number }[];
  cc_roles?: { name: string }[];
  subject?: string;
  message?: string;
  test_mode?: boolean;
}

export class HellosignAPIClient extends BaseAPIClient {
  constructor(credentials: HellosignCredentials) {
    const baseUrl = (credentials.baseUrl || 'https://api.hellosign.com/v3').replace(/\/$/, '');
    super(baseUrl, credentials);

    this.registerHandlers({
      test_connection: () => this.testConnection(),
      get_account: () => this.getAccount(),
      send_signature_request: params => this.sendSignatureRequest(params as Record<string, any>),
      get_signature_request: params => this.getSignatureRequest(params as { signature_request_id: string }),
      list_signature_requests: params => this.listSignatureRequests(params as { page?: number; page_size?: number }),
      remind_signature_request: params => this.remindSignatureRequest(params as ReminderInput),
      cancel_signature_request: params => this.cancelSignatureRequest(params as CancelInput),
      download_files: params => this.downloadFiles(params as DownloadFilesInput),
      create_embedded_signature_request: params => this.createEmbeddedSignatureRequest(params as CreateEmbeddedSignatureRequestInput),
      get_embedded_sign_url: params => this.getEmbeddedSignUrl(params as EmbeddedSignUrlInput),
      create_template: params => this.createTemplate(params as CreateTemplateInput),
      get_template: params => this.getTemplate(params as { template_id: string }),
      send_with_template: params => this.sendWithTemplate(params as SendWithTemplateInput)
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const apiKey = this.credentials.apiKey || (this.credentials.accessToken as string | undefined);
    if (!apiKey) {
      throw new Error('HelloSign integration requires an API key.');
    }

    const encoded = Buffer.from(`${apiKey}:`).toString('base64');
    return {
      Authorization: `Basic ${encoded}`,
      'Content-Type': 'application/json'
    };
  }

  private prune<T extends Record<string, any>>(value?: T | null): T | undefined {
    if (!value) return undefined;
    const cleaned: Record<string, any> = {};
    for (const [key, field] of Object.entries(value)) {
      if (field === undefined || field === null) continue;
      cleaned[key] = field;
    }
    return cleaned as T;
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/account', this.getAuthHeaders());
  }

  public async getAccount(): Promise<APIResponse<any>> {
    return this.get('/account', this.getAuthHeaders());
  }

  public async sendSignatureRequest(params: Record<string, any>): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['signers']);
    const payload = this.prune({
      title: params.title,
      subject: params.subject,
      message: params.message,
      signers: params.signers,
      cc_email_addresses: params.cc_email_addresses,
      files: params.files,
      file_urls: params.file_urls,
      use_text_tags: params.use_text_tags,
      hide_text_tags: params.hide_text_tags,
      allow_decline: params.allow_decline,
      allow_reassign: params.allow_reassign,
      reminders: params.reminders,
      expires_at: params.expires_at,
      form_fields_per_document: params.form_fields_per_document,
      custom_fields: params.custom_fields,
      metadata: params.metadata,
      test_mode: params.test_mode
    });

    return this.post('/signature_request/send', payload, this.getAuthHeaders());
  }

  public async getSignatureRequest(params: { signature_request_id: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['signature_request_id']);
    return this.get(`/signature_request/${params.signature_request_id}`, this.getAuthHeaders());
  }

  public async listSignatureRequests(params: { page?: number; page_size?: number }): Promise<APIResponse<any>> {
    const query = this.buildQueryString(this.prune(params) ?? {});
    return this.get(`/signature_request/list${query}`, this.getAuthHeaders());
  }

  public async remindSignatureRequest(params: ReminderInput): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['signature_request_id', 'email_address']);
    const payload = this.prune({ email_address: params.email_address });
    return this.post(`/signature_request/remind/${params.signature_request_id}`, payload, this.getAuthHeaders());
  }

  public async cancelSignatureRequest(params: CancelInput): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['signature_request_id']);
    return this.post(`/signature_request/cancel/${params.signature_request_id}`, {}, this.getAuthHeaders());
  }

  public async downloadFiles(params: DownloadFilesInput): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['signature_request_id']);
    const query = this.buildQueryString(this.prune({
      file_type: params.file_type,
      get_url: params.get_url
    }) ?? {});

    const url = `${this.baseURL}/signature_request/files/${params.signature_request_id}${query}`;
    const response = await fetch(url, { method: 'GET', headers: this.getAuthHeaders() });
    this.updateRateLimitInfo(response.headers);

    if (!response.ok) {
      const text = await response.text();
      return {
        success: false,
        statusCode: response.status,
        error: text || `Failed to download files for signature request ${params.signature_request_id}`
      };
    }

    const contentType = response.headers.get('content-type') || 'application/pdf';
    if (params.get_url) {
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
        contentType,
        contentBase64: buffer.toString('base64')
      },
      headers: Object.fromEntries(response.headers.entries())
    };
  }

  public async createEmbeddedSignatureRequest(params: CreateEmbeddedSignatureRequestInput): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['client_id', 'signers']);
    const payload = this.prune({
      client_id: params.client_id,
      subject: params.subject,
      message: params.message,
      signers: params.signers,
      files: params.files,
      file_urls: params.file_urls,
      metadata: params.metadata,
      test_mode: params.test_mode
    });

    return this.post('/signature_request/create_embedded', payload, this.getAuthHeaders());
  }

  public async getEmbeddedSignUrl(params: EmbeddedSignUrlInput): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['signature_id']);
    return this.get(`/embedded/sign_url/${params.signature_id}`, this.getAuthHeaders());
  }

  public async createTemplate(params: CreateTemplateInput): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['name', 'signer_roles']);
    const payload = this.prune({
      name: params.name,
      files: params.files,
      file_urls: params.file_urls,
      signer_roles: params.signer_roles,
      cc_roles: params.cc_roles,
      subject: params.subject,
      message: params.message,
      test_mode: params.test_mode
    });

    return this.post('/template/create', payload, this.getAuthHeaders());
  }

  public async getTemplate(params: { template_id: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['template_id']);
    return this.get(`/template/${params.template_id}`, this.getAuthHeaders());
  }

  public async sendWithTemplate(params: SendWithTemplateInput): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['template_id', 'signers']);
    const payload = this.prune({
      template_id: params.template_id,
      subject: params.subject,
      message: params.message,
      signers: params.signers,
      custom_fields: params.custom_fields,
      cc_email_addresses: params.cc_email_addresses,
      metadata: params.metadata,
      test_mode: params.test_mode
    });

    return this.post('/signature_request/send_with_template', payload, this.getAuthHeaders());
  }
}