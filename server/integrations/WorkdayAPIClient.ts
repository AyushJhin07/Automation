import type { APICredentials, APIResponse } from './BaseAPIClient';
import { BaseAPIClient } from './BaseAPIClient';

interface WorkdaySearchParams {
  searchTerm?: string;
  location?: string;
  department?: string;
  jobTitle?: string;
  manager?: string;
  isActive?: boolean;
  limit?: number;
  offset?: number;
}

interface WorkdayWorkerMutation {
  workerId?: string;
  personalData?: Record<string, any>;
  positionData?: Record<string, any>;
  jobData?: Record<string, any>;
  hireDate?: string;
  terminationDate?: string;
  reason?: string;
}

type WorkdayTriggerParams = {
  since?: string;
  pageSize?: number;
  pageToken?: string;
};

function normalizeHost(candidate?: string | null): string {
  const raw = `${candidate ?? ''}`.trim();
  if (!raw) {
    throw new Error('Workday connector requires a tenant host (for example https://wd5.myworkday.com).');
  }

  const prefixed = raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`;
  return prefixed.replace(/\/$/, '');
}

function assertTenant(tenant?: string | null): string {
  const raw = `${tenant ?? ''}`.trim();
  if (!raw) {
    throw new Error('Workday connector requires a tenant identifier (for example acme).');
  }
  return raw;
}

function buildODataFilter(parts: Array<string | null | undefined>): string | undefined {
  const filtered = parts.filter((part): part is string => Boolean(part && part.trim()));
  if (!filtered.length) {
    return undefined;
  }
  return filtered.join(' and ');
}

function escapeODataString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export class WorkdayAPIClient extends BaseAPIClient {
  private readonly tenant: string;

  constructor(
    credentials: APICredentials & { tenant?: string; tenantAlias?: string; host?: string; baseUrl?: string },
    additionalConfig?: Record<string, any>
  ) {
    const tenant = assertTenant(
      additionalConfig?.tenant ?? credentials.tenant ?? credentials.tenantAlias ?? (credentials as any).workdayTenant
    );
    const host = normalizeHost(
      additionalConfig?.host ??
        credentials.baseUrl ??
        credentials.host ??
        (credentials as any).tenantUrl ??
        (credentials as any).domain
    );
    const baseURL = `${host.replace(/\/$/, '')}/ccx/api/v1/${encodeURIComponent(tenant)}`;

    super(baseURL, credentials, { connectorId: 'workday' });

    this.tenant = tenant;

    this.registerHandlers({
      test_connection: this.testConnection.bind(this) as any,
      get_worker: this.getWorker.bind(this) as any,
      search_workers: this.searchWorkers.bind(this) as any,
      create_worker: this.createWorker.bind(this) as any,
      update_worker: this.updateWorker.bind(this) as any,
      terminate_worker: this.terminateWorker.bind(this) as any,
      create_position: this.createPosition.bind(this) as any,
      update_position: this.updatePosition.bind(this) as any,
      worker_hired: this.pollWorkerHired.bind(this) as any,
      worker_terminated: this.pollWorkerTerminated.bind(this) as any,
      time_off_requested: this.pollTimeOffRequested.bind(this) as any,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    if (!this.credentials.accessToken) {
      throw new Error('Workday connector requires an OAuth access token.');
    }
    return { Authorization: `Bearer ${this.credentials.accessToken}` };
  }

  private buildHumanResourcesPath(path: string): string {
    return `/human_resources${path.startsWith('/') ? path : `/${path}`}`;
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get(
      `${this.buildHumanResourcesPath('/workers')}${this.buildQueryString({ '$top': 1, '$select': 'worker_id' })}`
    );
  }

  public async getWorker(params: { workerId: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['workerId']);
    const endpoint = this.buildHumanResourcesPath(`/workers/${encodeURIComponent(params.workerId)}`);
    return this.get(endpoint);
  }

  public async searchWorkers(params: WorkdaySearchParams = {}): Promise<APIResponse<any>> {
    const { searchTerm, location, department, jobTitle, manager, isActive, limit = 20, offset = 0 } = params;

    const filter = buildODataFilter([
      isActive === undefined ? undefined : `WorkerStatus/Active eq ${isActive ? 'true' : 'false'}`,
      location ? `WorkerLocation/LocationName eq ${escapeODataString(location)}` : undefined,
      department ? `Organizations/any(o: o/OrganizationName eq ${escapeODataString(department)})` : undefined,
      jobTitle ? `JobProfile/JobTitle eq ${escapeODataString(jobTitle)}` : undefined,
      manager ? `ManagementChain/any(m: m/ManagerWorker/ID eq ${escapeODataString(manager)})` : undefined,
    ]);

    const query = {
      '$search': searchTerm ? `"${searchTerm}"` : undefined,
      '$filter': filter,
      '$top': limit,
      '$skip': offset,
    };

    return this.get(`${this.buildHumanResourcesPath('/workers')}${this.buildQueryString(query)}`);
  }

  public async createWorker(payload: WorkdayWorkerMutation): Promise<APIResponse<any>> {
    this.validateRequiredParams(payload as Record<string, any>, ['personalData', 'hireDate']);
    const position = payload.positionData ?? payload.jobData;
    if (!position) {
      throw new Error('Workday worker creation requires positionData or jobData details.');
    }

    const body = {
      Worker: {
        PersonalData: payload.personalData ?? {},
        PositionAssignments: position ? [position] : [],
        HireDate: payload.hireDate,
      },
    };

    return this.post(this.buildHumanResourcesPath('/workers'), body);
  }

  public async updateWorker(payload: WorkdayWorkerMutation): Promise<APIResponse<any>> {
    this.validateRequiredParams(payload as Record<string, any>, ['workerId']);

    const position = payload.positionData ?? payload.jobData;
    if (!payload.personalData && !position) {
      throw new Error('Provide personalData or positionData when updating a worker.');
    }

    const body = {
      Worker: {
        PersonalData: payload.personalData,
        PositionAssignments: position ? [position] : undefined,
      },
    };

    return this.patch(this.buildHumanResourcesPath(`/workers/${encodeURIComponent(String(payload.workerId))}`), body);
  }

  public async terminateWorker(payload: WorkdayWorkerMutation): Promise<APIResponse<any>> {
    this.validateRequiredParams(payload as Record<string, any>, ['workerId', 'terminationDate']);

    const body = {
      TerminationDetails: {
        TerminationDate: payload.terminationDate,
        Reason: payload.reason ?? 'Other',
      },
    };

    return this.post(this.buildHumanResourcesPath(`/workers/${encodeURIComponent(String(payload.workerId))}/terminate`), body);
  }

  public async createPosition(params: { positionTitle: string; department: string; jobProfile: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['positionTitle', 'department', 'jobProfile']);

    const body = {
      Position: {
        Title: params.positionTitle,
        Department: params.department,
        JobProfile: params.jobProfile,
      },
    };

    return this.post(this.buildHumanResourcesPath('/positions'), body);
  }

  public async updatePosition(params: { positionId: string; updates: Record<string, any> }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, any>, ['positionId', 'updates']);
    const endpoint = this.buildHumanResourcesPath(`/positions/${encodeURIComponent(params.positionId)}`);
    return this.patch(endpoint, { Position: params.updates });
  }

  public async pollWorkerHired(params: WorkdayTriggerParams = {}): Promise<APIResponse<any>> {
    const query = {
      '$top': params.pageSize ?? 50,
      '$skiptoken': params.pageToken,
      since: params.since,
    };

    return this.get(`${this.buildHumanResourcesPath('/reports/WorkerHires')}${this.buildQueryString(query)}`);
  }

  public async pollWorkerTerminated(params: WorkdayTriggerParams = {}): Promise<APIResponse<any>> {
    const query = {
      '$top': params.pageSize ?? 50,
      '$skiptoken': params.pageToken,
      since: params.since,
    };

    return this.get(`${this.buildHumanResourcesPath('/reports/WorkerTerminations')}${this.buildQueryString(query)}`);
  }

  public async pollTimeOffRequested(params: WorkdayTriggerParams = {}): Promise<APIResponse<any>> {
    const query = {
      '$top': params.pageSize ?? 50,
      '$skiptoken': params.pageToken,
      since: params.since,
    };

    return this.get(`${this.buildHumanResourcesPath('/time_off_requests')}${this.buildQueryString(query)}`);
  }
}
