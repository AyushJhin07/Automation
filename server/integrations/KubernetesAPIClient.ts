import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

interface DeploymentParams {
  name: string;
  namespace?: string;
  image: string;
  replicas?: number;
  port?: number;
}

interface ListDeploymentsParams {
  namespace?: string;
  label_selector?: string;
}

interface DeleteDeploymentParams {
  name: string;
  namespace?: string;
  propagationPolicy?: 'Foreground' | 'Background' | 'Orphan';
}

interface ServicePort {
  port: number;
  targetPort?: number;
  protocol?: 'TCP' | 'UDP';
}

interface CreateServiceParams {
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

interface PodLogsParams {
  pod_name: string;
  namespace?: string;
  container?: string;
  tail_lines?: number;
}

export class KubernetesAPIClient extends BaseAPIClient {
  private readonly defaultNamespace: string;

  constructor(credentials: APICredentials) {
    const baseUrl = (credentials.api_server || credentials.baseUrl || 'https://kubernetes.default.svc').replace(/\/$/, '');
    super(baseUrl, credentials);

    this.defaultNamespace = credentials.namespace || 'default';

    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'create_deployment': this.createDeployment.bind(this) as any,
      'list_deployments': this.listDeployments.bind(this) as any,
      'delete_deployment': this.deleteDeployment.bind(this) as any,
      'create_service': this.createService.bind(this) as any,
      'scale_deployment': this.scaleDeployment.bind(this) as any,
      'get_pod_logs': this.getPodLogs.bind(this) as any,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const token = this.credentials.bearer_token || this.credentials.token || this.credentials.accessToken;
    if (!token) {
      return {};
    }
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    };
  }

  private resolveNamespace(namespace?: string): string {
    return namespace || this.credentials.namespace || this.defaultNamespace || 'default';
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/api/v1/namespaces?limit=1');
  }

  public async createDeployment(params: DeploymentParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['name', 'image']);

    const namespace = this.resolveNamespace(params.namespace);
    const containers = [
      {
        name: params.name,
        image: params.image,
        ...(params.port ? { ports: [{ containerPort: params.port }] } : {})
      }
    ];

    const payload = {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: params.name,
        namespace
      },
      spec: {
        replicas: params.replicas ?? 1,
        selector: { matchLabels: { app: params.name } },
        template: {
          metadata: { labels: { app: params.name } },
          spec: { containers }
        }
      }
    };

    return this.post(`/apis/apps/v1/namespaces/${namespace}/deployments`, payload);
  }

  public async listDeployments(params: ListDeploymentsParams = {}): Promise<APIResponse<any>> {
    const namespace = this.resolveNamespace(params.namespace);
    const query = this.buildQueryString({ labelSelector: params.label_selector });
    return this.get(`/apis/apps/v1/namespaces/${namespace}/deployments${query}`);
  }

  public async deleteDeployment(params: DeleteDeploymentParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['name']);
    const namespace = this.resolveNamespace(params.namespace);
    const query = this.buildQueryString({ propagationPolicy: params.propagationPolicy });
    return this.delete(`/apis/apps/v1/namespaces/${namespace}/deployments/${params.name}${query}`);
  }

  public async createService(params: CreateServiceParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['name', 'selector', 'ports']);
    const namespace = this.resolveNamespace(params.namespace);

    const payload = {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: {
        name: params.name,
        namespace
      },
      spec: {
        selector: params.selector,
        ports: params.ports.map(port => ({
          port: port.port,
          targetPort: port.targetPort ?? port.port,
          protocol: port.protocol ?? 'TCP'
        })),
        type: params.type ?? 'ClusterIP'
      }
    };

    return this.post(`/api/v1/namespaces/${namespace}/services`, payload);
  }

  public async scaleDeployment(params: ScaleDeploymentParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['name', 'replicas']);
    const namespace = this.resolveNamespace(params.namespace);
    const payload = { spec: { replicas: params.replicas } };
    return this.patch(
      `/apis/apps/v1/namespaces/${namespace}/deployments/${params.name}`,
      payload,
      { 'Content-Type': 'application/strategic-merge-patch+json' }
    );
  }

  public async getPodLogs(params: PodLogsParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['pod_name']);
    const namespace = this.resolveNamespace(params.namespace);
    const query = this.buildQueryString({
      container: params.container,
      tailLines: params.tail_lines
    });
    return this.get(`/api/v1/namespaces/${namespace}/pods/${params.pod_name}/log${query}`, {
      Accept: 'text/plain'
    });
  }
}
