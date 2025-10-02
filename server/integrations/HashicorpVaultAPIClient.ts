import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

interface ReadSecretParams {
  path: string;
  version?: number;
}

interface WriteSecretParams {
  path: string;
  data: Record<string, any>;
  cas?: number;
}

interface DeleteSecretParams {
  path: string;
}

interface CreatePolicyParams {
  name: string;
  policy: string;
}

export class HashicorpVaultAPIClient extends BaseAPIClient {
  constructor(credentials: APICredentials) {
    const baseUrl = (credentials.vault_url || credentials.baseUrl || 'https://vault-server.com:8200/v1').replace(/\/$/, '');
    super(baseUrl, credentials);

    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'read_secret': this.readSecret.bind(this) as any,
      'write_secret': this.writeSecret.bind(this) as any,
      'delete_secret': this.deleteSecret.bind(this) as any,
      'create_policy': this.createPolicy.bind(this) as any,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const token = this.credentials.vault_token || this.credentials.token || this.credentials.accessToken;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (token) {
      headers['X-Vault-Token'] = token;
    }
    if (this.credentials.namespace) {
      headers['X-Vault-Namespace'] = this.credentials.namespace;
    }
    return headers;
  }

  private normalizePath(path: string): string {
    if (!path.startsWith('/')) {
      return `/${path}`;
    }
    return path;
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/sys/health');
  }

  public async readSecret(params: ReadSecretParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['path']);
    const query = this.buildQueryString({ version: params.version });
    return this.get(`${this.normalizePath(params.path)}${query}`);
  }

  public async writeSecret(params: WriteSecretParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['path', 'data']);
    const body: Record<string, any> = { data: params.data };
    if (typeof params.cas === 'number') {
      body.options = { cas: params.cas };
    }
    return this.post(this.normalizePath(params.path), body);
  }

  public async deleteSecret(params: DeleteSecretParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['path']);
    return this.delete(this.normalizePath(params.path));
  }

  public async createPolicy(params: CreatePolicyParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['name', 'policy']);
    const payload = { name: params.name, policy: params.policy };
    return this.put(`/sys/policy/${params.name}`, payload);
  }
}
