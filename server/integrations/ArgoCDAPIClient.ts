import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

interface ApplicationParams {
  name: string;
  namespace?: string;
  repo_url: string;
  path?: string;
  target_revision?: string;
  destination_server?: string;
  destination_namespace?: string;
  auto_sync?: boolean;
}

interface SyncApplicationParams {
  name: string;
  revision?: string;
  prune?: boolean;
  dry_run?: boolean;
}

interface GetApplicationParams {
  name: string;
}

interface DeleteApplicationParams {
  name: string;
  cascade?: boolean;
}

export class ArgoCDAPIClient extends BaseAPIClient {
  constructor(credentials: APICredentials) {
    const baseUrl = (credentials.server_url || credentials.baseUrl || 'https://argocd-server.com/api/v1').replace(/\/$/, '');
    super(baseUrl, credentials);

    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'create_application': this.createApplication.bind(this) as any,
      'sync_application': this.syncApplication.bind(this) as any,
      'get_application': this.getApplication.bind(this) as any,
      'delete_application': this.deleteApplication.bind(this) as any,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const token = this.credentials.auth_token || this.credentials.accessToken || this.credentials.token;
    if (!token) {
      return { 'Content-Type': 'application/json' };
    }
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/projects');
  }

  public async createApplication(params: ApplicationParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['name', 'repo_url']);

    const payload: Record<string, any> = {
      metadata: {
        name: params.name,
        namespace: params.namespace || 'argocd'
      },
      spec: {
        project: 'default',
        source: {
          repoURL: params.repo_url,
          path: params.path ?? '.',
          targetRevision: params.target_revision ?? 'HEAD'
        },
        destination: {
          server: params.destination_server ?? 'https://kubernetes.default.svc',
          namespace: params.destination_namespace ?? 'default'
        }
      }
    };

    if (params.auto_sync) {
      payload.spec.syncPolicy = { automated: { prune: true, selfHeal: true } };
    }

    return this.post('/applications', payload);
  }

  public async syncApplication(params: SyncApplicationParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['name']);

    const payload: Record<string, any> = {
      prune: params.prune ?? false,
      dryRun: params.dry_run ?? false
    };

    if (params.revision) {
      payload.revision = params.revision;
    }

    return this.post(`/applications/${params.name}/sync`, payload);
  }

  public async getApplication(params: GetApplicationParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['name']);
    return this.get(`/applications/${params.name}`);
  }

  public async deleteApplication(params: DeleteApplicationParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['name']);
    const query = this.buildQueryString({ cascade: params.cascade ?? true });
    return this.delete(`/applications/${params.name}${query}`);
  }
}
