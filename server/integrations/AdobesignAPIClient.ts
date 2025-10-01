import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

export interface AdobesignCredentials extends APICredentials {
  baseUrl?: string;
}

interface CreateAgreementInput {
  name: string;
  fileInfos: Array<Record<string, any>>;
  participantSetsInfo: Array<Record<string, any>>;
  signatureType?: 'ESIGN' | 'WRITTEN';
  state?: 'IN_PROCESS' | 'AUTHORING';
  emailOption?: Record<string, any>;
  externalId?: string;
  message?: string;
}

interface AgreementLookupInput {
  agreementId: string;
}

interface CancelAgreementInput extends AgreementLookupInput {
  comment?: string;
}

export class AdobesignAPIClient extends BaseAPIClient {
  constructor(credentials: AdobesignCredentials) {
    const baseUrl = (credentials.baseUrl || 'https://api.na1.echosign.com/api/rest/v6').replace(/\/$/, '');
    super(baseUrl, credentials);

    this.registerHandlers({
      test_connection: () => this.testConnection(),
      create_agreement: params => this.createAgreement(params as CreateAgreementInput),
      send_agreement: params => this.sendAgreement(params as AgreementLookupInput),
      get_agreement: params => this.getAgreement(params as AgreementLookupInput),
      cancel_agreement: params => this.cancelAgreement(params as CancelAgreementInput)
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const token = this.credentials.accessToken;
    if (!token) {
      throw new Error('Adobe Sign integration requires an OAuth access token.');
    }

    return {
      Authorization: `Bearer ${token}`,
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
    return this.get('/users/me', this.getAuthHeaders());
  }

  public async createAgreement(params: CreateAgreementInput): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['name', 'fileInfos', 'participantSetsInfo']);
    const payload = this.prune({
      name: params.name,
      fileInfos: params.fileInfos,
      participantSetsInfo: params.participantSetsInfo,
      signatureType: params.signatureType || 'ESIGN',
      state: params.state || 'IN_PROCESS',
      emailOption: params.emailOption,
      externalId: params.externalId,
      message: params.message
    });

    return this.post('/agreements', payload, this.getAuthHeaders());
  }

  public async sendAgreement(params: AgreementLookupInput): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['agreementId']);
    const payload = { value: 'IN_PROCESS' };
    return this.put(`/agreements/${params.agreementId}/state`, payload, this.getAuthHeaders());
  }

  public async getAgreement(params: AgreementLookupInput): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['agreementId']);
    return this.get(`/agreements/${params.agreementId}`, this.getAuthHeaders());
  }

  public async cancelAgreement(params: CancelAgreementInput): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['agreementId']);
    const payload = this.prune({
      value: 'CANCELLED',
      notifySigner: true,
      comment: params.comment
    });

    return this.put(`/agreements/${params.agreementId}/state`, payload, this.getAuthHeaders());
  }
}