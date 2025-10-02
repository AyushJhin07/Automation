import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

interface VaultCredentials extends APICredentials {
  vault_url?: string;
  base_url?: string;
  vault_token?: string;
  token?: string;
  namespace?: string;
}

interface SecretPathParams {
  path: string;
  version?: number;
}

interface WriteSecretParams extends SecretPathParams {
  data: Record<string, any>;
  cas?: number;
}

interface CreatePolicyParams {
  name: string;
  policy: string;
}

function normalizePath(path: string): string {
  if (!path.startsWith('/')) {
    return `/${path}`;
  }
  return path;
}

function sanitizeBaseUrl(url: string): string {
  return url.replace(/\/$/, '');
}

export class HashicorpVaultAPIClient extends BaseAPIClient {
  private readonly token: string;
  private readonly namespace?: string;

  constructor(credentials: VaultCredentials) {
    const baseUrl = credentials.vault_url || credentials.base_url || credentials.baseUrl || credentials.url;
    if (!baseUrl) {
      throw new Error('HashiCorp Vault integration requires a vault_url');
    }

    const token = credentials.vault_token || credentials.token;
    if (!token) {
      throw new Error('HashiCorp Vault integration requires a token');
    }

    super(sanitizeBaseUrl(baseUrl), credentials);

    this.token = token;
    this.namespace = credentials.namespace;

    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'read_secret': this.readSecret.bind(this) as any,
      'write_secret': this.writeSecret.bind(this) as any,
      'delete_secret': this.deleteSecret.bind(this) as any,
      'create_policy': this.createPolicy.bind(this) as any,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'X-Vault-Token': this.token,
      Accept: 'application/json',
    };
    if (this.namespace) {
      headers['X-Vault-Namespace'] = this.namespace;
    }
    return headers;
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/sys/health');
  }

  public async readSecret(params: SecretPathParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['path']);
    const query = this.buildQueryString({ version: params.version });
    return this.get(`${normalizePath(params.path)}${query}`);
  }

  public async writeSecret(params: WriteSecretParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['path', 'data']);
    const payload: Record<string, any> = {
      data: params.data,
    };
    if (typeof params.cas === 'number') {
      payload.options = { cas: params.cas };
    }
    return this.post(normalizePath(params.path), payload);
  }

  public async deleteSecret(params: SecretPathParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['path']);
    return this.delete(normalizePath(params.path));
  }

  public async createPolicy(params: CreatePolicyParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['name', 'policy']);
    const endpoint = `/sys/policies/acl/${encodeURIComponent(params.name)}`;
    return this.put(endpoint, { policy: params.policy });
  }
}
