import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

interface ArgocdCredentials extends APICredentials {
  server_url?: string;
  serverUrl?: string;
  auth_token?: string;
  authToken?: string;
  token?: string;
  project?: string;
}

interface ApplicationParams {
  name: string;
  namespace?: string;
  repo_url: string;
  path?: string;
  target_revision?: string;
  destination_server?: string;
  destination_namespace?: string;
  auto_sync?: boolean;
  project?: string;
}

interface SyncApplicationParams {
  name: string;
  revision?: string;
  prune?: boolean;
  dry_run?: boolean;
}

interface DeleteApplicationParams {
  name: string;
  cascade?: boolean;
}

function sanitizeBaseUrl(url: string): string {
  return url.replace(/\/$/, '');
}

export class ArgocdAPIClient extends BaseAPIClient {
  private readonly token: string;
  private readonly defaultNamespace: string;
  private readonly defaultProject: string;

  constructor(credentials: ArgocdCredentials) {
    const serverUrl = credentials.server_url || credentials.serverUrl || credentials.baseUrl || credentials.url;
    if (!serverUrl) {
      throw new Error('Argo CD integration requires a server_url');
    }

    const authToken = credentials.auth_token || credentials.authToken || credentials.token;
    if (!authToken) {
      throw new Error('Argo CD integration requires an auth token');
    }

    super(sanitizeBaseUrl(serverUrl), credentials);

    this.token = authToken;
    this.defaultNamespace = credentials.namespace || 'argocd';
    this.defaultProject = credentials.project || 'default';

    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'create_application': this.createApplication.bind(this) as any,
      'sync_application': this.syncApplication.bind(this) as any,
      'get_application': this.getApplication.bind(this) as any,
      'delete_application': this.deleteApplication.bind(this) as any,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/json',
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/version');
  }

  public async createApplication(params: ApplicationParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['name', 'repo_url']);

    const payload: Record<string, any> = {
      metadata: {
        name: params.name,
        namespace: params.namespace || this.defaultNamespace,
      },
      spec: {
        project: params.project || this.defaultProject,
        source: {
          repoURL: params.repo_url,
          path: params.path ?? '.',
          targetRevision: params.target_revision ?? 'HEAD',
        },
        destination: {
          server: params.destination_server ?? 'https://kubernetes.default.svc',
          namespace: params.destination_namespace ?? 'default',
        },
      },
    };

    if (params.auto_sync) {
      payload.spec.syncPolicy = { automated: { prune: true, selfHeal: true } };
    }

    return this.post('/applications', payload);
  }

  public async syncApplication(params: SyncApplicationParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['name']);

    const payload: Record<string, any> = {
      revision: params.revision,
      prune: params.prune ?? false,
      dryRun: params.dry_run ?? false,
    };

    return this.post(`/applications/${encodeURIComponent(params.name)}/sync`, payload);
  }

  public async getApplication(params: { name: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['name']);
    return this.get(`/applications/${encodeURIComponent(params.name)}`);
  }

  public async deleteApplication(params: DeleteApplicationParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['name']);
    const cascade = params.cascade !== undefined ? params.cascade : true;
    const query = this.buildQueryString({ cascade });
    return this.delete(`/applications/${encodeURIComponent(params.name)}${query}`);
  }
}
