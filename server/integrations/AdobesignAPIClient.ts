import { APIResponse, APICredentials, BaseAPIClient } from './BaseAPIClient';

export interface AdobeSignCredentials extends APICredentials {
  accessToken: string;
  apiEndpoint?: string;
}

export interface AdobeSignFileInfo {
  transientDocumentId?: string;
  libraryDocumentId?: string;
  label?: string;
  name?: string;
}

export interface AdobeSignRecipient {
  email: string;
  role: 'SIGNER' | 'APPROVER' | 'DELEGATE_TO_SIGNER' | 'DELEGATE_TO_APPROVER';
  name?: string;
  order?: number;
}

export interface CreateAgreementParams {
  name: string;
  participantSetsInfo: Array<{
    memberInfos: Array<{ email: string; name?: string }>;
    order?: number;
    role: AdobeSignRecipient['role'];
  }>;
  fileInfos: AdobeSignFileInfo[];
  message?: string;
  signatureType?: 'ESIGN' | 'WRITTEN';
  state?: 'DRAFT' | 'IN_PROCESS';
}

export interface AgreementIdentifier {
  agreementId: string;
}

/**
 * Adobe Acrobat Sign API client covering agreement workflows.
 */
export class AdobesignAPIClient extends BaseAPIClient {
  constructor(credentials: AdobeSignCredentials) {
    super(AdobesignAPIClient.resolveBaseUrl(credentials), credentials);

    this.registerHandlers({
      test_connection: this.testConnection.bind(this) as any,
      create_agreement: this.createAgreement.bind(this) as any,
      send_agreement: this.sendAgreement.bind(this) as any,
      get_agreement: this.getAgreement.bind(this) as any,
      cancel_agreement: this.cancelAgreement.bind(this) as any,
    });
  }

  private static resolveBaseUrl(credentials: AdobeSignCredentials): string {
    const endpoint = credentials.apiEndpoint || 'https://api.na1.adobesign.com/api/rest/v6';
    return endpoint.replace(/\/$/, '');
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.credentials.accessToken}`
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/users/me');
  }

  public async createAgreement(params: CreateAgreementParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['name', 'participantSetsInfo', 'fileInfos']);
    const payload = {
      name: params.name,
      participantSetsInfo: params.participantSetsInfo,
      fileInfos: params.fileInfos,
      message: params.message,
      signatureType: params.signatureType ?? 'ESIGN',
      state: params.state ?? 'IN_PROCESS',
    };
    return this.post('/agreements', payload);
  }

  public async sendAgreement(params: AgreementIdentifier): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['agreementId']);
    return this.post(`/agreements/${encodeURIComponent(params.agreementId)}/state`, {
      value: 'IN_PROCESS',
      notifySigner: true,
    });
  }

  public async getAgreement(params: AgreementIdentifier): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['agreementId']);
    return this.get(`/agreements/${encodeURIComponent(params.agreementId)}`);
  }

  public async cancelAgreement(params: AgreementIdentifier & { comment?: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['agreementId']);
    return this.put(`/agreements/${encodeURIComponent(params.agreementId)}/state`, {
      value: 'CANCELLED',
      comment: params.comment ?? 'Cancelled via automation',
      notifySigner: true,
    });
  }
}
