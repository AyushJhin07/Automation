// Production-ready BambooHR API client

import { APIResponse, BaseAPIClient } from './BaseAPIClient';

export interface BamboohrAPIClientConfig {
  apiKey: string;
  companyDomain?: string;
  baseUrl?: string;
}

type EmployeeFields = Record<string, unknown>;

type CreateEmployeeParams = {
  companyDomain?: string;
  firstName: string;
  lastName: string;
  workEmail?: string;
  hireDate?: string;
  department?: string;
  jobTitle?: string;
  supervisor?: string;
  [key: string]: unknown;
};

type UpdateEmployeeParams = {
  companyDomain?: string;
  employeeId: string;
  fields: EmployeeFields;
};

type GetEmployeeParams = {
  companyDomain?: string;
  employeeId: string;
  fields?: string;
};

type TimeOffRequestParams = {
  companyDomain?: string;
  start?: string;
  end?: string;
  employeeId?: string;
};

const DEFAULT_BASE_URL = 'https://api.bamboohr.com/api/gateway.php';

export class BamboohrAPIClient extends BaseAPIClient {
  private defaultCompanyDomain?: string;

  constructor(config: BamboohrAPIClientConfig) {
    super((config.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, ''), {
      apiKey: config.apiKey,
      companyDomain: config.companyDomain
    });
    this.defaultCompanyDomain = config.companyDomain;

    this.registerHandlers({
      'test_connection': () => this.testConnection(),
      'get_employee': params => this.getEmployee(params as GetEmployeeParams),
      'create_employee': params => this.createEmployee(params as CreateEmployeeParams),
      'update_employee': params => this.updateEmployee(params as UpdateEmployeeParams),
      'get_time_off_requests': params => this.getTimeOffRequests(params as TimeOffRequestParams)
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const token = Buffer.from(`${this.credentials.apiKey}:x`).toString('base64');
    return {
      'Authorization': `Basic ${token}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };
  }

  private resolveCompanyDomain(params?: { companyDomain?: string }): string | undefined {
    return params?.companyDomain || (this.credentials as { companyDomain?: string }).companyDomain || this.defaultCompanyDomain;
  }

  private buildPath(companyDomain: string, path: string): string {
    const normalisedPath = path.startsWith('/') ? path : `/${path}`;
    return `/${companyDomain}/v1${normalisedPath}`;
  }

  public async testConnection(): Promise<APIResponse> {
    const domain = this.resolveCompanyDomain();
    if (!domain) {
      return { success: false, error: 'companyDomain is required to test the BambooHR connection.' };
    }

    return this.get(this.buildPath(domain, '/employees/directory'));
  }

  public async getEmployee(params: GetEmployeeParams): Promise<APIResponse> {
    const domain = this.resolveCompanyDomain(params);
    if (!domain) {
      return { success: false, error: 'companyDomain is required to fetch an employee.' };
    }

    const { employeeId, fields } = params;
    if (!employeeId) {
      return { success: false, error: 'employeeId is required to fetch an employee.' };
    }

    const query = fields ? `?fields=${encodeURIComponent(fields)}` : '';
    return this.get(this.buildPath(domain, `/employees/${encodeURIComponent(employeeId)}${query}`));
  }

  private pruneUndefined<T extends Record<string, unknown>>(input: T): T {
    return Object.fromEntries(
      Object.entries(input).filter(([, value]) => value !== undefined && value !== null)
    ) as T;
  }

  public async createEmployee(params: CreateEmployeeParams): Promise<APIResponse> {
    const domain = this.resolveCompanyDomain(params);
    if (!domain) {
      return { success: false, error: 'companyDomain is required to create an employee.' };
    }

    const payload: EmployeeFields = this.pruneUndefined({
      firstName: params.firstName,
      lastName: params.lastName,
      workEmail: params.workEmail,
      hireDate: params.hireDate,
      department: params.department,
      jobTitle: params.jobTitle,
      supervisor: params.supervisor
    });

    return this.post(this.buildPath(domain, '/employees/'), payload);
  }

  public async updateEmployee(params: UpdateEmployeeParams): Promise<APIResponse> {
    const domain = this.resolveCompanyDomain(params);
    if (!domain) {
      return { success: false, error: 'companyDomain is required to update an employee.' };
    }

    if (!params.employeeId) {
      return { success: false, error: 'employeeId is required to update an employee.' };
    }

    return this.post(
      this.buildPath(domain, `/employees/${encodeURIComponent(params.employeeId)}`),
      this.pruneUndefined(params.fields)
    );
  }

  public async getTimeOffRequests(params: TimeOffRequestParams): Promise<APIResponse> {
    const domain = this.resolveCompanyDomain(params);
    if (!domain) {
      return { success: false, error: 'companyDomain is required to list time off requests.' };
    }

    const query = new URLSearchParams();
    if (params.start) query.append('start', params.start);
    if (params.end) query.append('end', params.end);
    if (params.employeeId) query.append('employeeId', params.employeeId);

    const queryString = query.toString();
    const endpoint = this.buildPath(domain, '/time_off/requests' + (queryString ? `?${queryString}` : ''));
    return this.get(endpoint);
  }
}
