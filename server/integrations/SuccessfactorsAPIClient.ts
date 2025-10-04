// SAP SUCCESSFACTORS API CLIENT
// Production-ready client for interacting with SuccessFactors OData resources

import type { JSONSchemaType } from 'ajv';

import { APIResponse, BaseAPIClient } from './BaseAPIClient.js';

export interface SuccessfactorsAPIClientConfig {
  accessToken: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  companyId: string;
  /**
   * Optional SuccessFactors data centre identifier (for example `api4`).
   * If omitted you can provide an explicit host or baseUrl.
   */
  datacenter?: string;
  /**
   * Optional fully-qualified host name (e.g. `api4.successfactors.com`).
   */
  host?: string;
  /**
   * Overrides the default OData base URL.
   */
  baseUrl?: string;
  [key: string]: unknown;
}

export interface SuccessfactorsEmployeeRecord {
  userId: string;
  personIdExternal: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  managerId?: string | null;
  hireDate?: string | null;
  lastModifiedDateTime?: string | null;
  raw?: Record<string, unknown> | null;
}

export interface SuccessfactorsEmployeeListResult {
  employees: SuccessfactorsEmployeeRecord[];
  nextSkipToken?: string | null;
  nextDeltaToken?: string | null;
  raw?: any;
}

type CreateEmployeeParams = {
  userId: string;
  personalInfo: Record<string, any>;
  employmentInfo: Record<string, any>;
  [key: string]: any;
};

type UpdateEmployeeParams = {
  userId: string;
  updates: Record<string, any>;
  [key: string]: any;
};

type GetEmployeeParams = {
  userId: string;
  expand?: string;
  [key: string]: any;
};

type ListEmployeesParams = {
  filter?: string;
  top?: number;
  skipToken?: string;
  deltaToken?: string;
  select?: string;
  orderBy?: string;
  expand?: string;
  [key: string]: any;
};

const DEFAULT_HOST_SUFFIX = 'successfactors.com';
const DEFAULT_BASE_TEMPLATE = 'https://{host}/odata/v2';
const EMPLOYEE_SCHEMA: JSONSchemaType<SuccessfactorsEmployeeRecord> = {
  type: 'object',
  properties: {
    userId: { type: 'string', minLength: 1 },
    personIdExternal: { type: 'string', minLength: 1 },
    firstName: { type: 'string', nullable: true },
    lastName: { type: 'string', nullable: true },
    email: { type: 'string', nullable: true },
    jobTitle: { type: 'string', nullable: true },
    department: { type: 'string', nullable: true },
    managerId: { type: 'string', nullable: true },
    hireDate: { type: 'string', nullable: true },
    lastModifiedDateTime: { type: 'string', nullable: true },
    raw: {
      type: 'object',
      nullable: true,
      additionalProperties: true,
      required: []
    }
  },
  required: ['userId', 'personIdExternal'],
  additionalProperties: true
};

export class SuccessfactorsAPIClient extends BaseAPIClient {
  private readonly companyId: string;
  private readonly resolvedHost: string;

  constructor(config: SuccessfactorsAPIClientConfig) {
    const { companyId, datacenter, host, baseUrl, ...credentialFields } = config;

    if (!companyId || typeof companyId !== 'string' || companyId.trim().length === 0) {
      throw new Error('SuccessFactors configuration requires a non-empty companyId');
    }

    const trimmedCompanyId = companyId.trim();
    const derivedHost = host
      ? host.replace(/\/$/, '')
      : datacenter
        ? `${datacenter}.${DEFAULT_HOST_SUFFIX}`
        : `api4.${DEFAULT_HOST_SUFFIX}`;
    const derivedBaseUrl = (baseUrl || DEFAULT_BASE_TEMPLATE.replace('{host}', derivedHost)).replace(/\/$/, '');

    super(derivedBaseUrl, credentialFields);

    this.companyId = trimmedCompanyId;
    this.resolvedHost = derivedHost;

    this.registerHandlers({
      'test_connection': () => this.testConnection(),
      'get_employee': params => this.getEmployee(params as GetEmployeeParams),
      'create_employee': params => this.createEmployee(params as CreateEmployeeParams),
      'update_employee': params => this.updateEmployee(params as UpdateEmployeeParams),
      'list_employees': params => this.listEmployees(params as ListEmployeesParams)
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const token = this.credentials.accessToken;
    if (!token) {
      throw new Error('SuccessFactors access token is not configured');
    }

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    if (this.companyId) {
      headers['CompanyID'] = this.companyId;
    }

    return headers;
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get(this.buildODataEndpoint('/User', { '$top': 1 }));
  }

  public async getEmployee(params: GetEmployeeParams): Promise<APIResponse<SuccessfactorsEmployeeRecord | null>> {
    const userId = this.requireUserId(params?.userId);
    const encodedId = encodeURIComponent(userId);
    const endpoint = this.buildODataEndpoint(`/PerPerson('${encodedId}')`, {
      '$expand': params?.['expand'] || 'employmentNav,personalInfoNav,personNav'
    });

    const response = await this.get(endpoint);
    if (!response.success) {
      return response as APIResponse<SuccessfactorsEmployeeRecord | null>;
    }

    const record = this.unwrapSingleRecord(response.data);
    if (!record) {
      return { success: true, data: null };
    }

    try {
      const employee = this.normaliseEmployee(record);
      return { success: true, data: employee };
    } catch (error) {
      return { success: false, error: this.normaliseError(error) };
    }
  }

  public async listEmployees(params: ListEmployeesParams = {}): Promise<APIResponse<SuccessfactorsEmployeeListResult>> {
    const endpoint = this.buildCollectionEndpoint('/PerPerson', params);
    const response = await this.get(endpoint);
    if (!response.success) {
      return response as APIResponse<SuccessfactorsEmployeeListResult>;
    }

    try {
      const container = this.unwrapContainer(response.data);
      const results = Array.isArray(container.results) ? container.results : [];
      const employees = results.map(item => this.normaliseEmployee(item));
      const nextSkipToken = this.extractToken(container.__next ?? container['@odata.nextLink'], '$skiptoken');
      const nextDeltaToken = this.extractToken(container.__delta ?? container['@odata.deltaLink'], '$deltatoken');

      return {
        success: true,
        data: {
          employees,
          nextSkipToken: nextSkipToken ?? null,
          nextDeltaToken: nextDeltaToken ?? null,
          raw: response.data
        }
      };
    } catch (error) {
      return { success: false, error: this.normaliseError(error) };
    }
  }

  public async createEmployee(params: CreateEmployeeParams): Promise<APIResponse<SuccessfactorsEmployeeRecord>> {
    const userId = this.requireUserId(params?.userId);
    const payload = this.buildCreatePayload(userId, params.personalInfo, params.employmentInfo);
    const response = await this.post(this.buildODataEndpoint('/PerPerson'), payload);
    if (!response.success) {
      return response as APIResponse<SuccessfactorsEmployeeRecord>;
    }

    try {
      const record = this.unwrapSingleRecord(response.data);
      if (!record) {
        throw new Error('SuccessFactors did not return a created employee record');
      }
      const employee = this.normaliseEmployee(record);
      return { success: true, data: employee };
    } catch (error) {
      return { success: false, error: this.normaliseError(error), data: response.data };
    }
  }

  public async updateEmployee(params: UpdateEmployeeParams): Promise<APIResponse<SuccessfactorsEmployeeRecord>> {
    const userId = this.requireUserId(params?.userId);
    const updates = params?.updates ?? {};
    if (typeof updates !== 'object' || Array.isArray(updates)) {
      return { success: false, error: 'updates must be an object' };
    }

    const encodedId = encodeURIComponent(userId);
    const endpoint = this.buildODataEndpoint(`/PerPerson('${encodedId}')`);
    const response = await this.patch(endpoint, updates);
    if (!response.success) {
      return response as APIResponse<SuccessfactorsEmployeeRecord>;
    }

    try {
      const record = this.unwrapSingleRecord(response.data) ?? updates;
      const employee = this.normaliseEmployee(record);
      return { success: true, data: employee };
    } catch (error) {
      return { success: false, error: this.normaliseError(error), data: response.data };
    }
  }

  private buildODataEndpoint(path: string, query: Record<string, string | number | undefined> = {}): string {
    const normalisedPath = path.startsWith('/') ? path : `/${path}`;
    const [pathname, initialQuery = ''] = normalisedPath.split('?');
    const search = new URLSearchParams(initialQuery);

    if (this.companyId && !search.has('companyId')) {
      search.set('companyId', this.companyId);
    }
    if (!search.has('$format')) {
      search.set('$format', 'json');
    }

    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      search.set(key, String(value));
    }

    const queryString = search.toString();
    return queryString ? `${pathname}?${queryString}` : pathname;
  }

  private buildCollectionEndpoint(resource: string, params: ListEmployeesParams): string {
    const path = params.deltaToken ? `${resource}/delta` : resource;
    const query: Record<string, string | number | undefined> = {
      '$filter': params.filter,
      '$top': params.top,
      '$skiptoken': params.skipToken,
      '$deltatoken': params.deltaToken,
      '$select': params.select,
      '$orderby': params.orderBy,
      '$expand': params.expand || 'employmentNav,personalInfoNav,personNav'
    };

    return this.buildODataEndpoint(path, query);
  }

  private unwrapContainer(payload: any): any {
    if (!payload) return {};
    if (payload.d && typeof payload.d === 'object') {
      return payload.d;
    }
    return payload;
  }

  private unwrapSingleRecord(payload: any): any | null {
    if (!payload) return null;
    const container = this.unwrapContainer(payload);
    if (container.results && Array.isArray(container.results)) {
      return container.results[0] ?? null;
    }
    return container;
  }

  private extractToken(link: unknown, param: string): string | null {
    if (typeof link !== 'string' || link.length === 0) {
      return null;
    }

    try {
      const base = this.baseURL || `https://${this.resolvedHost}`;
      const url = new URL(link, base);
      const token = url.searchParams.get(param);
      return token ?? null;
    } catch {
      const pattern = new RegExp(`${param}=([^&]+)`);
      const match = pattern.exec(link);
      return match ? decodeURIComponent(match[1]) : null;
    }
  }

  private requireUserId(userId: unknown): string {
    if (typeof userId !== 'string' || userId.trim().length === 0) {
      throw new Error('userId is required for SuccessFactors operations');
    }
    return userId.trim();
  }

  private extractFirst(input: any): any {
    if (!input) return undefined;
    if (Array.isArray(input)) return input[0];
    if (Array.isArray(input.results)) return input.results[0];
    return input;
  }

  private buildCreatePayload(userId: string, personalInfo: Record<string, any>, employmentInfo: Record<string, any>): Record<string, any> {
    return {
      personIdExternal: userId,
      userId,
      personalInfoNav: {
        results: [personalInfo ?? {}]
      },
      employmentNav: {
        results: [employmentInfo ?? {}]
      }
    };
  }

  private toOptionalString(value: any): string | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    return null;
  }

  private normaliseEmployee(raw: any): SuccessfactorsEmployeeRecord {
    if (!raw || typeof raw !== 'object') {
      throw new Error('Invalid SuccessFactors employee payload');
    }

    const personId = this.toOptionalString(raw.personIdExternal ?? raw.personId);
    const resolvedUserId = this.toOptionalString(raw.userId ?? personId);

    if (!personId || !resolvedUserId) {
      throw new Error('SuccessFactors employee record is missing required identifiers');
    }

    const employment = this.extractFirst(raw.employmentNav || raw.employmentInfoNav || raw.employmentNavDEFLT);
    const personal = this.extractFirst(raw.personalNav || raw.personalInfoNav);

    const normalized: SuccessfactorsEmployeeRecord = {
      userId: resolvedUserId,
      personIdExternal: personId,
      firstName: this.toOptionalString(raw.firstName ?? personal?.firstName),
      lastName: this.toOptionalString(raw.lastName ?? personal?.lastName),
      email: this.toOptionalString(raw.email ?? personal?.email ?? personal?.emailAddress),
      jobTitle: this.toOptionalString(raw.jobTitle ?? employment?.jobTitle ?? employment?.jobCode),
      department: this.toOptionalString(raw.department ?? employment?.department ?? employment?.departmentId),
      managerId: this.toOptionalString(raw.managerId ?? employment?.managerId ?? employment?.managerIdExternal),
      hireDate: this.toOptionalString(employment?.hireDate ?? employment?.startDate ?? raw.hireDate),
      lastModifiedDateTime: this.toOptionalString(
        raw.lastModifiedDateTime || raw.lastModifiedOn || employment?.lastModifiedDateTime || employment?.lastModifiedOn
      ),
      raw: raw as Record<string, unknown>
    };

    return this.validatePayload(EMPLOYEE_SCHEMA, normalized);
  }

  private normaliseError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return typeof error === 'string' ? error : 'Unknown error';
  }
}
