import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

interface KubernetesCredentials extends APICredentials {
  api_server?: string;
  apiServer?: string;
  bearer_token?: string;
  bearerToken?: string;
  token?: string;
  namespace?: string;
}

interface DeploymentParams {
  name: string;
  namespace?: string;
  image: string;
  replicas?: number;
  port?: number;
}

interface ServicePort {
  port: number;
  targetPort?: number;
  protocol?: 'TCP' | 'UDP';
}

interface ServiceParams {
  name: string;
  namespace?: string;
  selector: Record<string, string>;
  ports: ServicePort[];
  type?: 'ClusterIP' | 'NodePort' | 'LoadBalancer';
}

interface ScaleDeploymentParams {
  name: string;
  namespace?: string;
  replicas: number;
}

interface GetPodLogsParams {
  pod_name: string;
  namespace?: string;
  container?: string;
  tail_lines?: number;
}

function trimTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

export class KubernetesAPIClient extends BaseAPIClient {
  private readonly token: string;
  private readonly defaultNamespace: string;

  constructor(credentials: KubernetesCredentials) {
    const apiServer = credentials.api_server || credentials.apiServer || credentials.baseUrl || credentials.url;
    if (!apiServer) {
      throw new Error('Kubernetes integration requires an api_server or base URL');
    }
    const bearerToken = credentials.bearer_token || credentials.bearerToken || credentials.token;
    if (!bearerToken) {
      throw new Error('Kubernetes integration requires a bearer token');
    }

    super(trimTrailingSlash(apiServer), credentials);

    this.token = bearerToken;
    this.defaultNamespace = credentials.namespace || 'default';

    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'create_deployment': this.createDeployment.bind(this) as any,
      'create_service': this.createService.bind(this) as any,
      'scale_deployment': this.scaleDeployment.bind(this) as any,
      'get_pod_logs': this.getPodLogs.bind(this) as any,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/json',
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/api/v1/namespaces?limit=1');
  }

  public async createDeployment(params: DeploymentParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['name', 'image']);
    const namespace = params.namespace || this.defaultNamespace;

    const payload: Record<string, any> = {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: params.name,
        namespace,
        labels: { app: params.name },
      },
      spec: {
        replicas: params.replicas ?? 1,
        selector: { matchLabels: { app: params.name } },
        template: {
          metadata: { labels: { app: params.name } },
          spec: {
            containers: [
              {
                name: params.name,
                image: params.image,
                ports: params.port ? [{ containerPort: params.port }] : undefined,
              },
            ].filter(Boolean),
          },
        },
      },
    };

    return this.post(`/apis/apps/v1/namespaces/${encodeURIComponent(namespace)}/deployments`, payload);
  }

  public async createService(params: ServiceParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['name', 'selector', 'ports']);
    const namespace = params.namespace || this.defaultNamespace;

    const payload: Record<string, any> = {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: {
        name: params.name,
        namespace,
      },
      spec: {
        selector: params.selector,
        ports: params.ports.map(port => ({
          port: port.port,
          targetPort: port.targetPort ?? port.port,
          protocol: port.protocol ?? 'TCP',
        })),
        type: params.type ?? 'ClusterIP',
      },
    };

    return this.post(`/api/v1/namespaces/${encodeURIComponent(namespace)}/services`, payload);
  }

  public async scaleDeployment(params: ScaleDeploymentParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['name', 'replicas']);
    const namespace = params.namespace || this.defaultNamespace;

    const payload = {
      spec: {
        replicas: params.replicas,
      },
    };

    return this.patch(
      `/apis/apps/v1/namespaces/${encodeURIComponent(namespace)}/deployments/${encodeURIComponent(params.name)}`,
      payload,
      { 'Content-Type': 'application/merge-patch+json' }
    );
  }

  public async getPodLogs(params: GetPodLogsParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['pod_name']);
    const namespace = params.namespace || this.defaultNamespace;

    const query = this.buildQueryString({
      container: params.container,
      'tailLines': params.tail_lines,
    });

    return this.get(`/api/v1/namespaces/${encodeURIComponent(namespace)}/pods/${encodeURIComponent(params.pod_name)}/log${query}`);
  }
}
