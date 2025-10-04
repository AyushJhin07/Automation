// Production-grade Workday API client

import type { APIResponse } from './BaseAPIClient';
import { BaseAPIClient } from './BaseAPIClient';

export interface WorkdayAPIClientConfig {
  accessToken: string;
  tenant: string;
  region?: string;
  hostname?: string;
}

type WorkerIdentifier = { workerId: string };

type GetWorkerParams = WorkerIdentifier & {
  include?: string;
};

type SearchWorkersParams = {
  searchTerm?: string;
  location?: string;
  department?: string;
  jobTitle?: string;
  manager?: string;
  isActive?: boolean;
  limit?: number;
  offset?: number;
};

type CreateWorkerParams = {
  personalData: Record<string, any>;
  positionData: Record<string, any>;
  hireDate: string;
  onboardingData?: Record<string, any>;
};

type UpdateWorkerParams = WorkerIdentifier & {
  personalData?: Record<string, any>;
  positionData?: Record<string, any>;
};

type TerminateWorkerParams = WorkerIdentifier & {
  terminationDate: string;
  reason?: string;
  lastDayWorked?: string;
};

type CreatePositionParams = {
  positionTitle: string;
  department?: string;
  jobProfile?: string;
  location?: string;
  costCenter?: string;
};

type UpdatePositionParams = {
  positionId: string;
  updates: Record<string, any>;
};

type WorkerEventPollParams = {
  department?: string;
  location?: string;
  terminationReason?: string;
  timeOffType?: string;
  since?: string;
  limit?: number;
};

const DEFAULT_HOST = 'wd5-impl-services1.workday.com';

export class WorkdayAPIClient extends BaseAPIClient {
  private readonly tenant: string;
  private readonly host: string;

  constructor(config: WorkdayAPIClientConfig) {
    const tenant = WorkdayAPIClient.requireTenant(config.tenant);
    const host = WorkdayAPIClient.resolveHost(config);
    const baseURL = WorkdayAPIClient.buildBaseUrl(host, tenant);

    super(baseURL, { accessToken: config.accessToken, tenant, region: config.region, hostname: config.hostname });

    this.tenant = tenant;
    this.host = host;

    this.registerHandlers({
      'test_connection': () => this.testConnection(),
      'get_worker': params => this.getWorker(params as GetWorkerParams),
      'search_workers': params => this.searchWorkers(params as SearchWorkersParams),
      'create_worker': params => this.createWorker(params as CreateWorkerParams),
      'update_worker': params => this.updateWorker(params as UpdateWorkerParams),
      'terminate_worker': params => this.terminateWorker(params as TerminateWorkerParams),
      'create_position': params => this.createPosition(params as CreatePositionParams),
      'update_position': params => this.updatePosition(params as UpdatePositionParams),
    });
  }

  private static requireTenant(value: string | undefined): string {
    const tenant = (value ?? '').trim();
    if (!tenant) {
      throw new Error('Workday tenant is required to initialize the API client.');
    }
    return tenant;
  }

  private static normalizeHost(value: string | undefined): string | null {
    if (!value) {
      return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const withoutProtocol = trimmed.replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
    return withoutProtocol || null;
  }

  private static resolveHost(config: WorkdayAPIClientConfig): string {
    const override =
      WorkdayAPIClient.normalizeHost(config.hostname) ??
      WorkdayAPIClient.normalizeHost(config.region);

    if (!override) {
      return DEFAULT_HOST;
    }

    if (override.includes('.')) {
      return override;
    }

    return `${override}.workday.com`;
  }

  private static buildBaseUrl(host: string, tenant: string): string {
    const normalisedHost = host.replace(/\/+$/, '');
    const encodedTenant = encodeURIComponent(tenant);
    return `https://${normalisedHost}/ccx/api/v1/${encodedTenant}`;
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.credentials.accessToken}`,
      Accept: 'application/json'
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/workers?limit=1');
  }

  public async getWorker(params: GetWorkerParams): Promise<APIResponse<any>> {
    if (!params?.workerId) {
      return { success: false, error: 'workerId is required to retrieve a Workday worker.' };
    }

    const query = params.include ? `?include=${encodeURIComponent(params.include)}` : '';
    return this.get(`/workers/${encodeURIComponent(params.workerId)}${query}`);
  }

  public async searchWorkers(params: SearchWorkersParams = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString({
      search: params.searchTerm,
      location: params.location,
      department: params.department,
      jobTitle: params.jobTitle,
      manager: params.manager,
      isActive: params.isActive,
      limit: params.limit,
      offset: params.offset,
    });

    return this.get(`/workers${query}`);
  }

  public async createWorker(params: CreateWorkerParams): Promise<APIResponse<any>> {
    if (!params?.personalData || !params?.positionData || !params?.hireDate) {
      return { success: false, error: 'personalData, positionData, and hireDate are required to create a worker.' };
    }

    const payload = this.pruneUndefined({
      personalData: params.personalData,
      positionData: params.positionData,
      hireDate: params.hireDate,
      onboardingData: params.onboardingData,
    });

    return this.post('/workers', payload);
  }

  public async updateWorker(params: UpdateWorkerParams): Promise<APIResponse<any>> {
    if (!params?.workerId) {
      return { success: false, error: 'workerId is required to update a worker.' };
    }

    const payload = this.pruneUndefined({
      personalData: params.personalData,
      positionData: params.positionData,
    });

    if (!Object.keys(payload).length) {
      return { success: false, error: 'At least one of personalData or positionData must be provided to update a worker.' };
    }

    return this.patch(`/workers/${encodeURIComponent(params.workerId)}`, payload);
  }

  public async terminateWorker(params: TerminateWorkerParams): Promise<APIResponse<any>> {
    if (!params?.workerId) {
      return { success: false, error: 'workerId is required to terminate a worker.' };
    }

    if (!params.terminationDate) {
      return { success: false, error: 'terminationDate is required to terminate a worker.' };
    }

    const payload = this.pruneUndefined({
      terminationDate: params.terminationDate,
      reason: params.reason,
      lastDayWorked: params.lastDayWorked,
    });

    return this.post(`/workers/${encodeURIComponent(params.workerId)}/terminate`, payload);
  }

  public async createPosition(params: CreatePositionParams): Promise<APIResponse<any>> {
    if (!params?.positionTitle) {
      return { success: false, error: 'positionTitle is required to create a position.' };
    }

    const payload = this.pruneUndefined({
      positionTitle: params.positionTitle,
      department: params.department,
      jobProfile: params.jobProfile,
      location: params.location,
      costCenter: params.costCenter,
    });

    return this.post('/positions', payload);
  }

  public async updatePosition(params: UpdatePositionParams): Promise<APIResponse<any>> {
    if (!params?.positionId) {
      return { success: false, error: 'positionId is required to update a position.' };
    }

    if (!params.updates || Object.keys(params.updates).length === 0) {
      return { success: false, error: 'updates must contain at least one field to update a position.' };
    }

    return this.patch(`/positions/${encodeURIComponent(params.positionId)}`, params.updates);
  }

  public async pollWorkerHired(params: WorkerEventPollParams = {}): Promise<APIResponse<any>> {
    return this.get(this.buildWorkerEventEndpoint('HIRE', params));
  }

  public async pollWorkerTerminated(params: WorkerEventPollParams = {}): Promise<APIResponse<any>> {
    return this.get(this.buildWorkerEventEndpoint('TERMINATION', params));
  }

  public async pollTimeOffRequested(params: WorkerEventPollParams = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString({
      eventType: 'TIME_OFF_REQUEST',
      department: params.department,
      timeOffType: params.timeOffType,
      since: params.since,
      limit: params.limit,
    });
    return this.get(`/notifications/timeOff${query}`);
  }

  private buildWorkerEventEndpoint(eventType: string, params: WorkerEventPollParams): string {
    const query = this.buildQueryString({
      eventType,
      department: params.department,
      location: params.location,
      terminationReason: params.terminationReason,
      since: params.since,
      limit: params.limit,
    });

    return `/notifications/workerEvents${query}`;
  }

  private buildQueryString(values: Record<string, any>): string {
    const searchParams = new URLSearchParams();

    for (const [key, value] of Object.entries(values)) {
      if (value === undefined || value === null || value === '') {
        continue;
      }

      if (Array.isArray(value)) {
        for (const entry of value) {
          if (entry === undefined || entry === null) {
            continue;
          }
          searchParams.append(key, String(entry));
        }
        continue;
      }

      if (typeof value === 'boolean') {
        searchParams.append(key, value ? 'true' : 'false');
        continue;
      }

      searchParams.append(key, String(value));
    }

    const query = searchParams.toString();
    return query ? `?${query}` : '';
  }

  private pruneUndefined<T extends Record<string, any>>(input: T): T {
    return Object.fromEntries(
      Object.entries(input).filter(([, value]) => value !== undefined && value !== null)
    ) as T;
  }
}
