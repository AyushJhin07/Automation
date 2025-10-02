import { Buffer } from 'buffer';
import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

interface HelmCredentials extends APICredentials {
  kubeconfig?: string;
  namespace?: string;
  api_url?: string;
  base_url?: string;
  apiBaseUrl?: string;
}

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

function resolveBaseUrl(config: HelmCredentials): string {
  const candidate = config.apiBaseUrl || config.api_url || config.base_url || config.baseUrl || config.url;
  if (!candidate) {
    throw new Error('Helm integration requires an api_url in credentials or additionalConfig');
  }
  return candidate.replace(/\/$/, '');
}

export class HelmAPIClient extends BaseAPIClient {
  private readonly kubeconfig: string;
  private readonly defaultNamespace: string;

  constructor(credentials: HelmCredentials) {
    const kubeconfig = credentials.kubeconfig;
    if (!kubeconfig) {
      throw new Error('Helm integration requires kubeconfig content');
    }

    super(resolveBaseUrl(credentials), credentials);

    this.kubeconfig = kubeconfig;
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
    return {
      'X-Kubeconfig': Buffer.from(this.kubeconfig, 'utf8').toString('base64'),
      Accept: 'application/json',
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/releases?limit=1');
  }

  public async installChart(params: InstallChartParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['release_name', 'chart']);

    const payload = {
      name: params.release_name,
      chart: params.chart,
      namespace: params.namespace || this.defaultNamespace,
      values: params.values,
      version: params.version,
      repository: params.repository,
    };

    return this.post('/releases', payload);
  }

  public async upgradeRelease(params: UpgradeReleaseParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['release_name', 'chart']);

    const payload = {
      chart: params.chart,
      namespace: params.namespace || this.defaultNamespace,
      values: params.values,
      version: params.version,
    };

    return this.put(`/releases/${encodeURIComponent(params.release_name)}`, payload);
  }

  public async uninstallRelease(params: UninstallReleaseParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['release_name']);
    const query = this.buildQueryString({
      namespace: params.namespace || this.defaultNamespace,
      keepHistory: params.keep_history ?? false,
    });
    return this.delete(`/releases/${encodeURIComponent(params.release_name)}${query}`);
  }

  public async listReleases(params: ListReleasesParams = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString({
      namespace: params.all_namespaces ? undefined : (params.namespace || this.defaultNamespace),
      allNamespaces: params.all_namespaces ?? undefined,
      status: params.status,
    });
    return this.get(`/releases${query}`);
  }
}
