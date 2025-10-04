import type { JSONSchemaType } from 'ajv';

import { APIResponse, BaseAPIClient } from './BaseAPIClient';
import { getErrorMessage } from '../types/common';

type OpsgenieRegion = 'us' | 'us1' | 'eu' | 'eu1';

type OpsgenieIdentifierType = 'id' | 'tiny' | 'alias';

type OpsgenieSortField =
  | 'createdAt'
  | 'updatedAt'
  | 'tinyId'
  | 'alias'
  | 'message'
  | 'status'
  | 'acknowledged'
  | 'isSeen'
  | 'snoozed';

type OpsgenieSortOrder = 'asc' | 'desc';

const REGION_HOSTS: Record<OpsgenieRegion, string> = {
  us: 'api.opsgenie.com',
  us1: 'api.opsgenie.com',
  eu: 'api.eu.opsgenie.com',
  eu1: 'api.eu.opsgenie.com',
};

const DEFAULT_BASE_URL = 'https://api.opsgenie.com/v2';

export interface OpsgenieAPIClientConfig {
  apiKey: string;
  /**
   * Optional Opsgenie region (e.g. `us`, `eu`).
   */
  region?: string | OpsgenieRegion;
  /**
   * Optional fully qualified API host or base URL (takes precedence over region).
   */
  apiHost?: string;
  /**
   * Optional explicit base URL including the API version path.
   */
  baseUrl?: string;
}

interface OpsgenieAccountResponse {
  data?: {
    name?: string | null;
    timezone?: string | null;
    plan?: string | null;
    createdAt?: string | null;
  } | null;
  took?: number | null;
  requestId?: string | null;
}

interface OpsgenieAlert {
  id: string;
  message: string;
  tinyId?: string | null;
  alias?: string | null;
  status?: string | null;
  acknowledged?: boolean | null;
  isSeen?: boolean | null;
  tags?: string[] | null;
  snoozed?: boolean | null;
  count?: number | null;
  lastOccurredAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  source?: string | null;
  owner?: string | null;
  priority?: string | null;
  details?: Record<string, any> | null;
  responders?: Array<Record<string, any>> | null;
}

interface OpsgenieActionResponse {
  result?: string | null;
  took?: number | null;
  requestId?: string | null;
  data?: Record<string, any> | null;
}

interface OpsgenieCreateAlertResponse extends OpsgenieActionResponse {
  alertId?: string | null;
  alertTinyId?: string | null;
}

interface OpsgenieAlertListResponse {
  data: OpsgenieAlert[];
  paging?: {
    next?: string | null;
    prev?: string | null;
    first?: string | null;
    last?: string | null;
  } | null;
  took?: number | null;
  requestId?: string | null;
}

interface OpsgenieTeam {
  id: string;
  name: string;
  description?: string | null;
  memberCount?: number | null;
  links?: Record<string, string | null> | null;
}

interface OpsgenieTeamListResponse {
  data: OpsgenieTeam[];
  paging?: {
    next?: string | null;
    prev?: string | null;
  } | null;
  took?: number | null;
  requestId?: string | null;
}

interface OpsgenieSchedule {
  id: string;
  name: string;
  timezone?: string | null;
  enabled?: boolean | null;
  ownerTeam?: { id?: string | null; name?: string | null } | null;
  rotationCount?: number | null;
}

interface OpsgenieScheduleListResponse {
  data: OpsgenieSchedule[];
  paging?: {
    next?: string | null;
    prev?: string | null;
  } | null;
  took?: number | null;
  requestId?: string | null;
}

interface OpsgenieOnCallRecipient {
  name?: string | null;
  username?: string | null;
  email?: string | null;
  state?: string | null;
  escalationLevel?: number | null;
  nextOnCallDate?: string | null;
}

interface OpsgenieOnCallResponse {
  data: {
    onCallRecipients?: OpsgenieOnCallRecipient[] | null;
    nextOnCallDate?: string | null;
    schedule?: { id?: string | null; name?: string | null } | null;
    team?: { id?: string | null; name?: string | null } | null;
  };
  took?: number | null;
  requestId?: string | null;
}

interface CreateAlertParams {
  message: string;
  alias?: string;
  description?: string;
  priority?: string;
  source?: string;
  tags?: string[];
  details?: Record<string, any>;
  entity?: string;
  user?: string;
  note?: string;
}

interface GetAlertParams {
  identifier: string;
  identifierType?: OpsgenieIdentifierType;
}

interface UpdateAlertParams {
  identifier: string;
  identifierType?: OpsgenieIdentifierType;
  data: Record<string, any>;
}

interface AlertLifecycleParams {
  identifier: string;
  identifierType?: OpsgenieIdentifierType;
  user?: string;
  note?: string;
  source?: string;
}

interface AddNoteParams extends AlertLifecycleParams {
  note: string;
}

interface AssignAlertParams extends AlertLifecycleParams {
  owner: { username?: string; id?: string };
}

interface ListAlertsParams {
  query?: string;
  searchIdentifier?: string;
  searchIdentifierType?: OpsgenieIdentifierType;
  offset?: number;
  limit?: number;
  sort?: OpsgenieSortField;
  order?: OpsgenieSortOrder;
}

interface GetTeamsParams {
  limit?: number;
  offset?: number;
}

interface GetSchedulesParams {
  limit?: number;
  offset?: number;
}

interface GetOnCallsParams {
  scheduleIdentifier: string;
  scheduleIdentifierType?: 'id' | 'name';
  flat?: boolean;
  date?: string;
}

interface CreateRecordParams {
  data: CreateAlertParams;
}

interface UpdateRecordParams {
  id: string;
  data: Record<string, any>;
  identifierType?: OpsgenieIdentifierType;
}

interface GetRecordParams {
  id: string;
  identifierType?: OpsgenieIdentifierType;
}

interface DeleteRecordParams {
  id: string;
  identifierType?: OpsgenieIdentifierType;
}

interface ListRecordsParams {
  limit?: number;
  filter?: Record<string, any> | null;
}

interface PollAlertsParams {
  since?: string | number | Date;
  limit?: number;
  query?: string;
}

const OPTIONAL_STRING_SCHEMA = { type: 'string', nullable: true } as const;
const OPTIONAL_NUMBER_SCHEMA = { type: 'number', nullable: true } as const;
const OPTIONAL_BOOLEAN_SCHEMA = { type: 'boolean', nullable: true } as const;

const OPSGENIE_ALERT_SCHEMA: JSONSchemaType<OpsgenieAlert> = {
  type: 'object',
  required: ['id', 'message'],
  additionalProperties: true,
  properties: {
    id: { type: 'string' },
    message: { type: 'string' },
    tinyId: OPTIONAL_STRING_SCHEMA,
    alias: OPTIONAL_STRING_SCHEMA,
    status: OPTIONAL_STRING_SCHEMA,
    acknowledged: OPTIONAL_BOOLEAN_SCHEMA,
    isSeen: OPTIONAL_BOOLEAN_SCHEMA,
    tags: {
      type: 'array',
      nullable: true,
      items: { type: 'string' },
    },
    snoozed: OPTIONAL_BOOLEAN_SCHEMA,
    count: OPTIONAL_NUMBER_SCHEMA,
    lastOccurredAt: OPTIONAL_STRING_SCHEMA,
    createdAt: OPTIONAL_STRING_SCHEMA,
    updatedAt: OPTIONAL_STRING_SCHEMA,
    source: OPTIONAL_STRING_SCHEMA,
    owner: OPTIONAL_STRING_SCHEMA,
    priority: OPTIONAL_STRING_SCHEMA,
    details: {
      type: 'object',
      nullable: true,
      required: [],
      additionalProperties: true,
      properties: {},
    },
    responders: {
      type: 'array',
      nullable: true,
      items: {
        type: 'object',
        required: [],
        additionalProperties: true,
        properties: {},
      },
    },
  },
};

const OPSGENIE_ACCOUNT_RESPONSE_SCHEMA: JSONSchemaType<OpsgenieAccountResponse> = {
  type: 'object',
  required: [],
  additionalProperties: true,
  properties: {
    data: {
      type: 'object',
      nullable: true,
      required: [],
      additionalProperties: true,
      properties: {
        name: OPTIONAL_STRING_SCHEMA,
        timezone: OPTIONAL_STRING_SCHEMA,
        plan: OPTIONAL_STRING_SCHEMA,
        createdAt: OPTIONAL_STRING_SCHEMA,
      },
    },
    took: OPTIONAL_NUMBER_SCHEMA,
    requestId: OPTIONAL_STRING_SCHEMA,
  },
};

const OPSGENIE_ACTION_RESPONSE_SCHEMA: JSONSchemaType<OpsgenieActionResponse> = {
  type: 'object',
  required: [],
  additionalProperties: true,
  properties: {
    result: OPTIONAL_STRING_SCHEMA,
    took: OPTIONAL_NUMBER_SCHEMA,
    requestId: OPTIONAL_STRING_SCHEMA,
    data: {
      type: 'object',
      nullable: true,
      required: [],
      additionalProperties: true,
      properties: {},
    },
  },
};

const OPSGENIE_CREATE_ALERT_RESPONSE_SCHEMA: JSONSchemaType<OpsgenieCreateAlertResponse> = {
  ...OPSGENIE_ACTION_RESPONSE_SCHEMA,
  properties: {
    ...OPSGENIE_ACTION_RESPONSE_SCHEMA.properties,
    alertId: OPTIONAL_STRING_SCHEMA,
    alertTinyId: OPTIONAL_STRING_SCHEMA,
  },
};

const OPSGENIE_GET_ALERT_RESPONSE_SCHEMA: JSONSchemaType<
  { data: OpsgenieAlert } & OpsgenieActionResponse
> = {
  type: 'object',
  required: ['data'],
  additionalProperties: true,
  properties: {
    data: OPSGENIE_ALERT_SCHEMA,
    took: OPTIONAL_NUMBER_SCHEMA,
    requestId: OPTIONAL_STRING_SCHEMA,
    result: OPTIONAL_STRING_SCHEMA,
  },
};

const OPSGENIE_ALERT_LIST_RESPONSE_SCHEMA: JSONSchemaType<OpsgenieAlertListResponse> = {
  type: 'object',
  required: ['data'],
  additionalProperties: true,
  properties: {
    data: {
      type: 'array',
      items: OPSGENIE_ALERT_SCHEMA,
    },
    paging: {
      type: 'object',
      nullable: true,
      required: [],
      additionalProperties: true,
      properties: {
        next: OPTIONAL_STRING_SCHEMA,
        prev: OPTIONAL_STRING_SCHEMA,
        first: OPTIONAL_STRING_SCHEMA,
        last: OPTIONAL_STRING_SCHEMA,
      },
    },
    took: OPTIONAL_NUMBER_SCHEMA,
    requestId: OPTIONAL_STRING_SCHEMA,
  },
};

const OPSGENIE_TEAM_SCHEMA: JSONSchemaType<OpsgenieTeam> = {
  type: 'object',
  required: ['id', 'name'],
  additionalProperties: true,
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    description: OPTIONAL_STRING_SCHEMA,
    memberCount: OPTIONAL_NUMBER_SCHEMA,
    links: {
      type: 'object',
      nullable: true,
      required: [],
      additionalProperties: { type: 'string', nullable: true },
      properties: {},
    },
  },
};

const OPSGENIE_TEAM_LIST_RESPONSE_SCHEMA: JSONSchemaType<OpsgenieTeamListResponse> = {
  type: 'object',
  required: ['data'],
  additionalProperties: true,
  properties: {
    data: {
      type: 'array',
      items: OPSGENIE_TEAM_SCHEMA,
    },
    paging: {
      type: 'object',
      nullable: true,
      required: [],
      additionalProperties: true,
      properties: {
        next: OPTIONAL_STRING_SCHEMA,
        prev: OPTIONAL_STRING_SCHEMA,
      },
    },
    took: OPTIONAL_NUMBER_SCHEMA,
    requestId: OPTIONAL_STRING_SCHEMA,
  },
};

const OPSGENIE_SCHEDULE_SCHEMA: JSONSchemaType<OpsgenieSchedule> = {
  type: 'object',
  required: ['id', 'name'],
  additionalProperties: true,
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    timezone: OPTIONAL_STRING_SCHEMA,
    enabled: OPTIONAL_BOOLEAN_SCHEMA,
    ownerTeam: {
      type: 'object',
      nullable: true,
      required: [],
      additionalProperties: true,
      properties: {
        id: OPTIONAL_STRING_SCHEMA,
        name: OPTIONAL_STRING_SCHEMA,
      },
    },
    rotationCount: OPTIONAL_NUMBER_SCHEMA,
  },
};

const OPSGENIE_SCHEDULE_LIST_RESPONSE_SCHEMA: JSONSchemaType<OpsgenieScheduleListResponse> = {
  type: 'object',
  required: ['data'],
  additionalProperties: true,
  properties: {
    data: {
      type: 'array',
      items: OPSGENIE_SCHEDULE_SCHEMA,
    },
    paging: {
      type: 'object',
      nullable: true,
      required: [],
      additionalProperties: true,
      properties: {
        next: OPTIONAL_STRING_SCHEMA,
        prev: OPTIONAL_STRING_SCHEMA,
      },
    },
    took: OPTIONAL_NUMBER_SCHEMA,
    requestId: OPTIONAL_STRING_SCHEMA,
  },
};

const OPSGENIE_ON_CALL_RECIPIENT_SCHEMA: JSONSchemaType<OpsgenieOnCallRecipient> = {
  type: 'object',
  required: [],
  additionalProperties: true,
  properties: {
    name: OPTIONAL_STRING_SCHEMA,
    username: OPTIONAL_STRING_SCHEMA,
    email: OPTIONAL_STRING_SCHEMA,
    state: OPTIONAL_STRING_SCHEMA,
    escalationLevel: OPTIONAL_NUMBER_SCHEMA,
    nextOnCallDate: OPTIONAL_STRING_SCHEMA,
  },
};

const OPSGENIE_ON_CALL_RESPONSE_SCHEMA: JSONSchemaType<OpsgenieOnCallResponse> = {
  type: 'object',
  required: ['data'],
  additionalProperties: true,
  properties: {
    data: {
      type: 'object',
      required: [],
      additionalProperties: true,
      properties: {
        onCallRecipients: {
          type: 'array',
          nullable: true,
          items: OPSGENIE_ON_CALL_RECIPIENT_SCHEMA,
        },
        nextOnCallDate: OPTIONAL_STRING_SCHEMA,
        schedule: {
          type: 'object',
          nullable: true,
          required: [],
          additionalProperties: true,
          properties: {
            id: OPTIONAL_STRING_SCHEMA,
            name: OPTIONAL_STRING_SCHEMA,
          },
        },
        team: {
          type: 'object',
          nullable: true,
          required: [],
          additionalProperties: true,
          properties: {
            id: OPTIONAL_STRING_SCHEMA,
            name: OPTIONAL_STRING_SCHEMA,
          },
        },
      },
    },
    took: OPTIONAL_NUMBER_SCHEMA,
    requestId: OPTIONAL_STRING_SCHEMA,
  },
};

function resolveBaseUrl(config: OpsgenieAPIClientConfig): string {
  if (config.baseUrl) {
    return config.baseUrl.replace(/\/$/, '') || DEFAULT_BASE_URL;
  }

  if (config.apiHost) {
    const candidate = config.apiHost.trim();
    if (!candidate) {
      return DEFAULT_BASE_URL;
    }

    try {
      const url = new URL(candidate.includes('://') ? candidate : `https://${candidate}`);
      const origin = url.origin.replace(/\/$/, '');
      const path = url.pathname && url.pathname !== '/' ? url.pathname.replace(/\/$/, '') : '/v2';
      return `${origin}${path.startsWith('/') ? path : `/${path}`}`;
    } catch {
      const sanitized = candidate.replace(/^(https?:\/\/)/i, '').replace(/\/$/, '');
      return `https://${sanitized}/v2`;
    }
  }

  const regionKey = (config.region || 'us').toLowerCase() as OpsgenieRegion;
  const host = REGION_HOSTS[regionKey] || REGION_HOSTS.us;
  return `https://${host}/v2`;
}

function normalizeSinceValue(value?: string | number | Date): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'number') {
    return new Date(value).toISOString();
  }

  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return date.toISOString();
  }

  return undefined;
}

function isNonEmptyObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object';
}

export class OpsgenieAPIClient extends BaseAPIClient {
  constructor(config: OpsgenieAPIClientConfig) {
    super(resolveBaseUrl(config), { apiKey: config.apiKey });

    this.registerHandlers({
      test_connection: () => this.testConnection(),
      create_alert: params => this.createAlert(params as CreateAlertParams),
      get_alert: params => this.getAlert(params as GetAlertParams),
      close_alert: params => this.closeAlert(params as AlertLifecycleParams),
      acknowledge_alert: params => this.acknowledgeAlert(params as AlertLifecycleParams),
      list_alerts: params => this.listAlerts(params as ListAlertsParams),
      add_note_to_alert: params => this.addNoteToAlert(params as AddNoteParams),
      assign_alert: params => this.assignAlert(params as AssignAlertParams),
      get_teams: params => this.getTeams(params as GetTeamsParams),
      get_schedules: params => this.getSchedules(params as GetSchedulesParams),
      get_on_calls: params => this.getOnCalls(params as GetOnCallsParams),
      create_record: params => this.createRecord(params as CreateRecordParams),
      update_record: params => this.updateRecord(params as UpdateRecordParams),
      get_record: params => this.getRecord(params as GetRecordParams),
      list_records: params => this.listRecords(params as ListRecordsParams),
      delete_record: params => this.deleteRecord(params as DeleteRecordParams),
    });

    this.registerAliasHandlers({
      'action.opsgenie.test_connection': 'testConnection',
      'action.opsgenie.create_alert': 'createAlert',
      'action.opsgenie.get_alert': 'getAlert',
      'action.opsgenie.close_alert': 'closeAlert',
      'action.opsgenie.acknowledge_alert': 'acknowledgeAlert',
      'action.opsgenie.list_alerts': 'listAlerts',
      'action.opsgenie.add_note_to_alert': 'addNoteToAlert',
      'action.opsgenie.assign_alert': 'assignAlert',
      'action.opsgenie.get_teams': 'getTeams',
      'action.opsgenie.get_schedules': 'getSchedules',
      'action.opsgenie.get_on_calls': 'getOnCalls',
      'action.opsgenie.create_record': 'createRecord',
      'action.opsgenie.update_record': 'updateRecord',
      'action.opsgenie.get_record': 'getRecord',
      'action.opsgenie.delete_record': 'deleteRecord',
      'action.opsgenie.list_records': 'listRecords',
      'trigger.opsgenie.record_created': 'pollRecordCreated',
      'trigger.opsgenie.record_updated': 'pollRecordUpdated',
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const apiKey = (this.credentials as { apiKey?: string }).apiKey;
    if (!apiKey) {
      throw new Error('Opsgenie API key is required');
    }
    return {
      Authorization: `GenieKey ${apiKey}`,
    };
  }

  public async testConnection(): Promise<APIResponse<OpsgenieAccountResponse>> {
    const response = await this.get<OpsgenieAccountResponse>('/account');
    return this.validateResponse(response, OPSGENIE_ACCOUNT_RESPONSE_SCHEMA);
  }

  public async createAlert(params: CreateAlertParams): Promise<APIResponse<OpsgenieCreateAlertResponse>> {
    this.validateRequiredParams(params as Record<string, any>, ['message']);
    const response = await this.post<OpsgenieCreateAlertResponse>('/alerts', {
      message: params.message,
      alias: params.alias,
      description: params.description,
      priority: params.priority,
      source: params.source,
      tags: params.tags,
      details: params.details,
      entity: params.entity,
      user: params.user,
      note: params.note,
    });
    return this.validateResponse(response, OPSGENIE_CREATE_ALERT_RESPONSE_SCHEMA);
  }

  public async getAlert(params: GetAlertParams): Promise<APIResponse<{ data: OpsgenieAlert } & OpsgenieActionResponse>> {
    this.validateRequiredParams(params as Record<string, any>, ['identifier']);
    const response = await this.get<{ data: OpsgenieAlert } & OpsgenieActionResponse>(
      this.buildAlertEndpoint(params.identifier, params.identifierType),
    );
    return this.validateResponse(response, OPSGENIE_GET_ALERT_RESPONSE_SCHEMA);
  }

  public async listAlerts(params: ListAlertsParams = {}): Promise<APIResponse<OpsgenieAlertListResponse>> {
    const queryParams = this.buildQueryString({
      query: params.query,
      searchIdentifier: params.searchIdentifier,
      searchIdentifierType: params.searchIdentifierType,
      offset: params.offset,
      limit: params.limit,
      sort: params.sort,
      order: params.order,
    });
    const response = await this.get<OpsgenieAlertListResponse>(`/alerts${queryParams}`);
    return this.validateResponse(response, OPSGENIE_ALERT_LIST_RESPONSE_SCHEMA);
  }

  public async updateAlert(params: UpdateAlertParams): Promise<APIResponse<OpsgenieActionResponse>> {
    this.validateRequiredParams(params as Record<string, any>, ['identifier', 'data']);
    const payload = { ...(params.data || {}) };
    delete (payload as Record<string, any>).identifierType;
    const response = await this.patch<OpsgenieActionResponse>(
      this.buildAlertEndpoint(params.identifier, params.identifierType ?? (params.data as any)?.identifierType),
      payload,
    );
    return this.validateResponse(response, OPSGENIE_ACTION_RESPONSE_SCHEMA);
  }

  public async deleteAlert(params: AlertLifecycleParams): Promise<APIResponse<OpsgenieActionResponse>> {
    this.validateRequiredParams(params as Record<string, any>, ['identifier']);
    const response = await this.delete<OpsgenieActionResponse>(
      this.buildAlertEndpoint(params.identifier, params.identifierType),
    );
    return this.validateResponse(response, OPSGENIE_ACTION_RESPONSE_SCHEMA);
  }

  public async closeAlert(params: AlertLifecycleParams): Promise<APIResponse<OpsgenieActionResponse>> {
    this.validateRequiredParams(params as Record<string, any>, ['identifier']);
    const response = await this.post<OpsgenieActionResponse>(
      this.buildAlertEndpoint(params.identifier, params.identifierType, '/close'),
      {
        user: params.user,
        note: params.note,
        source: params.source,
      },
    );
    return this.validateResponse(response, OPSGENIE_ACTION_RESPONSE_SCHEMA);
  }

  public async acknowledgeAlert(params: AlertLifecycleParams): Promise<APIResponse<OpsgenieActionResponse>> {
    this.validateRequiredParams(params as Record<string, any>, ['identifier']);
    const response = await this.post<OpsgenieActionResponse>(
      this.buildAlertEndpoint(params.identifier, params.identifierType, '/acknowledge'),
      {
        user: params.user,
        note: params.note,
        source: params.source,
      },
    );
    return this.validateResponse(response, OPSGENIE_ACTION_RESPONSE_SCHEMA);
  }

  public async addNoteToAlert(params: AddNoteParams): Promise<APIResponse<OpsgenieActionResponse>> {
    this.validateRequiredParams(params as Record<string, any>, ['identifier', 'note']);
    const response = await this.post<OpsgenieActionResponse>(
      this.buildAlertEndpoint(params.identifier, params.identifierType, '/notes'),
      {
        note: params.note,
        user: params.user,
        source: params.source,
      },
    );
    return this.validateResponse(response, OPSGENIE_ACTION_RESPONSE_SCHEMA);
  }

  public async assignAlert(params: AssignAlertParams): Promise<APIResponse<OpsgenieActionResponse>> {
    this.validateRequiredParams(params as Record<string, any>, ['identifier', 'owner']);
    const response = await this.post<OpsgenieActionResponse>(
      this.buildAlertEndpoint(params.identifier, params.identifierType, '/assign'),
      {
        owner: params.owner,
        user: params.user,
        note: params.note,
        source: params.source,
      },
    );
    return this.validateResponse(response, OPSGENIE_ACTION_RESPONSE_SCHEMA);
  }

  public async getTeams(params: GetTeamsParams = {}): Promise<APIResponse<OpsgenieTeamListResponse>> {
    const response = await this.get<OpsgenieTeamListResponse>(
      `/teams${this.buildQueryString({ limit: params.limit, offset: params.offset })}`,
    );
    return this.validateResponse(response, OPSGENIE_TEAM_LIST_RESPONSE_SCHEMA);
  }

  public async getSchedules(params: GetSchedulesParams = {}): Promise<APIResponse<OpsgenieScheduleListResponse>> {
    const response = await this.get<OpsgenieScheduleListResponse>(
      `/schedules${this.buildQueryString({ limit: params.limit, offset: params.offset })}`,
    );
    return this.validateResponse(response, OPSGENIE_SCHEDULE_LIST_RESPONSE_SCHEMA);
  }

  public async getOnCalls(params: GetOnCallsParams): Promise<APIResponse<OpsgenieOnCallResponse>> {
    this.validateRequiredParams(params as Record<string, any>, ['scheduleIdentifier']);
    const response = await this.get<OpsgenieOnCallResponse>(
      `/schedules/${encodeURIComponent(params.scheduleIdentifier)}/on-calls${this.buildQueryString({
        identifierType: params.scheduleIdentifierType,
        flat: params.flat,
        date: params.date ? normalizeSinceValue(params.date) : undefined,
      })}`,
    );
    return this.validateResponse(response, OPSGENIE_ON_CALL_RESPONSE_SCHEMA);
  }

  public async createRecord(params: CreateRecordParams): Promise<APIResponse<OpsgenieCreateAlertResponse>> {
    if (!params || !isNonEmptyObject(params.data)) {
      return { success: false, error: 'createRecord requires data payload.' };
    }
    return this.createAlert(params.data as CreateAlertParams);
  }

  public async updateRecord(params: UpdateRecordParams): Promise<APIResponse<OpsgenieActionResponse>> {
    if (!params || !params.id || !isNonEmptyObject(params.data)) {
      return { success: false, error: 'updateRecord requires id and data payload.' };
    }
    return this.updateAlert({ identifier: params.id, identifierType: params.identifierType, data: params.data });
  }

  public async getRecord(params: GetRecordParams): Promise<APIResponse<{ data: OpsgenieAlert } & OpsgenieActionResponse>> {
    if (!params || !params.id) {
      return { success: false, error: 'getRecord requires id parameter.' };
    }
    return this.getAlert({ identifier: params.id, identifierType: params.identifierType });
  }

  public async listRecords(params: ListRecordsParams = {}): Promise<APIResponse<any>> {
    const resource = String(params.filter?.resource || params.filter?.type || 'alerts').toLowerCase();

    if (resource === 'teams') {
      return this.getTeams({
        limit: params.limit,
        offset: params.filter?.offset,
      });
    }

    if (resource === 'schedules') {
      return this.getSchedules({
        limit: params.limit,
        offset: params.filter?.offset,
      });
    }

    if (resource === 'on_calls' || resource === 'on-calls') {
      const scheduleIdentifier = params.filter?.scheduleIdentifier || params.filter?.schedule_id;
      if (!scheduleIdentifier) {
        return { success: false, error: 'listRecords for on_calls requires scheduleIdentifier in filter.' };
      }
      return this.getOnCalls({
        scheduleIdentifier,
        scheduleIdentifierType:
          (params.filter?.scheduleIdentifierType || params.filter?.identifierType) as GetOnCallsParams['scheduleIdentifierType'],
        flat: params.filter?.flat,
        date: params.filter?.date,
      });
    }

    return this.listAlerts({
      limit: params.limit,
      offset: params.filter?.offset,
      query: params.filter?.query,
      searchIdentifier: params.filter?.searchIdentifier,
      searchIdentifierType: params.filter?.searchIdentifierType,
      sort: params.filter?.sort,
      order: params.filter?.order,
    });
  }

  public async deleteRecord(params: DeleteRecordParams): Promise<APIResponse<OpsgenieActionResponse>> {
    if (!params || !params.id) {
      return { success: false, error: 'deleteRecord requires id parameter.' };
    }
    return this.deleteAlert({ identifier: params.id, identifierType: params.identifierType });
  }

  public async pollRecordCreated(params: PollAlertsParams = {}): Promise<OpsgenieAlert[]> {
    const since = normalizeSinceValue(params.since);
    const queries: string[] = [];
    if (params.query) {
      queries.push(params.query);
    }
    if (since) {
      queries.push(`createdAt>=${since}`);
    }

    const response = await this.listAlerts({
      query: queries.join(' AND ') || undefined,
      limit: params.limit ?? 20,
      sort: 'createdAt',
      order: 'desc',
    });

    if (!response.success || !response.data) {
      return [];
    }

    return Array.isArray(response.data.data) ? response.data.data : [];
  }

  public async pollRecordUpdated(params: PollAlertsParams = {}): Promise<OpsgenieAlert[]> {
    const since = normalizeSinceValue(params.since);
    const queries: string[] = [];
    if (params.query) {
      queries.push(params.query);
    }
    if (since) {
      queries.push(`updatedAt>=${since}`);
    }

    const response = await this.listAlerts({
      query: queries.join(' AND ') || undefined,
      limit: params.limit ?? 20,
      sort: 'updatedAt',
      order: 'desc',
    });

    if (!response.success || !response.data) {
      return [];
    }

    return Array.isArray(response.data.data) ? response.data.data : [];
  }

  private buildAlertEndpoint(
    identifier: string,
    identifierType?: OpsgenieIdentifierType,
    suffix: string = '',
  ): string {
    const encodedId = encodeURIComponent(identifier);
    const path = `/alerts/${encodedId}${suffix}`;
    if (identifierType && identifierType !== 'id') {
      return `${path}${this.buildQueryString({ identifierType })}`;
    }
    return path;
  }

  private validateResponse<T>(
    response: APIResponse<any>,
    schema: JSONSchemaType<T>,
  ): APIResponse<T> {
    if (!response.success) {
      return response as APIResponse<T>;
    }

    try {
      const data = this.validatePayload(schema, response.data);
      return { ...response, data };
    } catch (error) {
      return {
        success: false,
        error: getErrorMessage(error),
        statusCode: response.statusCode,
      };
    }
  }
}
