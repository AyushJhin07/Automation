import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

interface InstallChartParams {
  release_name: string;
  chart: string;
  namespace?: string;
  values?: Record<string, any>;
  version?: string;
  repository?: string;
}

interface UpgradeReleaseParams extends InstallChartParams {}

interface UninstallReleaseParams {
  release_name: string;
  namespace?: string;
  keep_history?: boolean;
}

interface ListReleasesParams {
  namespace?: string;
  all_namespaces?: boolean;
  status?: string;
}

export class HelmAPIClient extends BaseAPIClient {
  private readonly defaultNamespace: string;

  constructor(credentials: APICredentials) {
    const baseUrl = (credentials.baseUrl || credentials.helm_url || 'https://helm-controller.local/api').replace(/\/$/, '');
    super(baseUrl, credentials);

    this.defaultNamespace = credentials.namespace || 'default';

    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'install_chart': this.installChart.bind(this) as any,
      'upgrade_release': this.upgradeRelease.bind(this) as any,
      'uninstall_release': this.uninstallRelease.bind(this) as any,
      'list_releases': this.listReleases.bind(this) as any,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (this.credentials.bearer_token) {
      headers.Authorization = `Bearer ${this.credentials.bearer_token}`;
    }
    return headers;
  }

  private resolveNamespace(namespace?: string): string {
    return namespace || this.credentials.namespace || this.defaultNamespace || 'default';
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/healthz');
  }

  public async installChart(params: InstallChartParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['release_name', 'chart']);
    const namespace = this.resolveNamespace(params.namespace);

    const payload = {
      releaseName: params.release_name,
      chart: params.chart,
      namespace,
      values: params.values ?? {},
      version: params.version,
      repository: params.repository
    };

    return this.post('/releases', payload);
  }

  public async upgradeRelease(params: UpgradeReleaseParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['release_name', 'chart']);
    const namespace = this.resolveNamespace(params.namespace);
    const payload = {
      chart: params.chart,
      namespace,
      values: params.values ?? {},
      version: params.version,
      repository: params.repository
    };

    return this.put(`/releases/${params.release_name}`, payload);
  }

  public async uninstallRelease(params: UninstallReleaseParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['release_name']);
    const namespace = this.resolveNamespace(params.namespace);
    const query = this.buildQueryString({ namespace, keepHistory: params.keep_history ?? false });
    return this.delete(`/releases/${params.release_name}${query}`);
  }

  public async listReleases(params: ListReleasesParams = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString({
      namespace: params.all_namespaces ? undefined : this.resolveNamespace(params.namespace),
      allNamespaces: params.all_namespaces ?? false,
      status: params.status
    });
    return this.get(`/releases${query}`);
  }
}
