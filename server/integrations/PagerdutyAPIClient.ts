// Production-ready PagerDuty API client

import { APIResponse, BaseAPIClient } from './BaseAPIClient';

export interface PagerdutyAPIClientConfig {
  apiKey: string;
  fromEmail?: string;
  baseUrl?: string;
}

type IncidentReference = {
  id: string;
  type: string;
};

type CreateIncidentParams = {
  incident: {
    type: string;
    title: string;
    service: IncidentReference;
    urgency?: 'high' | 'low';
    incident_key?: string;
    body?: Record<string, unknown>;
    priority?: IncidentReference;
    escalation_policy?: IncidentReference;
    assignments?: Array<{ assignee: IncidentReference }>;
  };
  from?: string;
};

type UpdateIncidentParams = {
  id: string;
  incident: Record<string, unknown>;
  from?: string;
};

type IncidentStatusChangeParams = {
  id: string;
  from?: string;
  resolution?: string;
};

type CreateNoteParams = {
  incidentId: string;
  from: string;
  content: string;
};

type ListQuery = Record<string, unknown>;

type IdentifierParams = {
  id: string;
};

type ListUsersParams = {
  query?: string;
  limit?: number;
  offset?: number;
};

const DEFAULT_BASE_URL = 'https://api.pagerduty.com';

export class PagerdutyAPIClient extends BaseAPIClient {
  private fromEmail?: string;

  constructor(config: PagerdutyAPIClientConfig) {
    super((config.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, ''), {
      apiKey: config.apiKey,
      fromEmail: config.fromEmail
    });
    this.fromEmail = config.fromEmail;

    this.registerHandlers({
      'test_connection': () => this.testConnection(),
      'create_incident': params => this.createIncident(params as CreateIncidentParams),
      'get_incident': params => this.getIncident(params as IdentifierParams),
      'update_incident': params => this.updateIncident(params as UpdateIncidentParams),
      'list_incidents': params => this.listIncidents(params as ListQuery),
      'acknowledge_incident': params => this.acknowledgeIncident(params as IncidentStatusChangeParams),
      'resolve_incident': params => this.resolveIncident(params as IncidentStatusChangeParams),
      'create_note': params => this.createNote(params as CreateNoteParams),
      'get_service': params => this.getService(params as IdentifierParams),
      'list_services': params => this.listServices(params as ListQuery),
      'get_user': params => this.getUser(params as IdentifierParams),
      'list_users': params => this.listUsers(params as ListUsersParams)
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      'Authorization': `Token token=${this.credentials.apiKey}`,
      'Accept': 'application/vnd.pagerduty+json;version=2',
      'Content-Type': 'application/json'
    };
  }

  private resolveFromEmail(params?: { from?: string }): string | undefined {
    return params?.from || (this.credentials as { fromEmail?: string }).fromEmail || this.fromEmail;
  }

  private withFromHeader(from: string | undefined, extraHeaders: Record<string, string> = {}): Record<string, string> {
    return from ? { ...extraHeaders, From: from } : extraHeaders;
  }

  public async testConnection(): Promise<APIResponse> {
    return this.get('/users/me');
  }

  public async createIncident(params: CreateIncidentParams): Promise<APIResponse> {
    const from = this.resolveFromEmail(params);
    if (!from) {
      return { success: false, error: 'from email is required to create an incident.' };
    }

    return this.post('/incidents', { incident: params.incident }, this.withFromHeader(from));
  }

  public async getIncident(params: IdentifierParams): Promise<APIResponse> {
    if (!params.id) {
      return { success: false, error: 'id is required to retrieve an incident.' };
    }

    return this.get(`/incidents/${encodeURIComponent(params.id)}`);
  }

  public async updateIncident(params: UpdateIncidentParams): Promise<APIResponse> {
    if (!params.id) {
      return { success: false, error: 'id is required to update an incident.' };
    }

    const from = this.resolveFromEmail(params);
    if (!from) {
      return { success: false, error: 'from email is required to update an incident.' };
    }

    return this.put(
      `/incidents/${encodeURIComponent(params.id)}`,
      { incident: params.incident },
      this.withFromHeader(from)
    );
  }

  public async listIncidents(params: ListQuery = {}): Promise<APIResponse> {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        query.append(key, value.join(','));
      } else {
        query.append(key, String(value));
      }
    }
    const qs = query.toString();
    return this.get(`/incidents${qs ? `?${qs}` : ''}`);
  }

  public async acknowledgeIncident(params: IncidentStatusChangeParams): Promise<APIResponse> {
    const from = this.resolveFromEmail(params);
    if (!from) {
      return { success: false, error: 'from email is required to acknowledge an incident.' };
    }
    if (!params.id) {
      return { success: false, error: 'id is required to acknowledge an incident.' };
    }

    const body = { incident: { type: 'incident', status: 'acknowledged' as const } };
    return this.put(`/incidents/${encodeURIComponent(params.id)}`, body, this.withFromHeader(from));
  }

  public async resolveIncident(params: IncidentStatusChangeParams): Promise<APIResponse> {
    const from = this.resolveFromEmail(params);
    if (!from) {
      return { success: false, error: 'from email is required to resolve an incident.' };
    }
    if (!params.id) {
      return { success: false, error: 'id is required to resolve an incident.' };
    }

    const body = {
      incident: {
        type: 'incident',
        status: 'resolved' as const,
        resolution: params.resolution
      }
    };
    return this.put(`/incidents/${encodeURIComponent(params.id)}`, body, this.withFromHeader(from));
  }

  public async createNote(params: CreateNoteParams): Promise<APIResponse> {
    if (!params.incidentId) {
      return { success: false, error: 'incidentId is required to create a note.' };
    }
    if (!params.from) {
      return { success: false, error: 'from email is required to create a note.' };
    }
    if (!params.content) {
      return { success: false, error: 'content is required to create a note.' };
    }

    const body = {
      note: {
        content: params.content,
        type: 'note'
      }
    };

    return this.post(`/incidents/${encodeURIComponent(params.incidentId)}/notes`, body, this.withFromHeader(params.from));
  }

  public async getService(params: IdentifierParams): Promise<APIResponse> {
    if (!params.id) {
      return { success: false, error: 'id is required to fetch a service.' };
    }
    return this.get(`/services/${encodeURIComponent(params.id)}`);
  }

  public async listServices(params: ListQuery = {}): Promise<APIResponse> {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        query.append(key, value.join(','));
      } else {
        query.append(key, String(value));
      }
    }
    const qs = query.toString();
    return this.get(`/services${qs ? `?${qs}` : ''}`);
  }

  public async getUser(params: IdentifierParams): Promise<APIResponse> {
    if (!params.id) {
      return { success: false, error: 'id is required to fetch a user.' };
    }
    return this.get(`/users/${encodeURIComponent(params.id)}`);
  }

  public async listUsers(params: ListUsersParams = {}): Promise<APIResponse> {
    const query = new URLSearchParams();
    if (params.query) query.append('query', params.query);
    if (typeof params.limit === 'number') query.append('limit', String(params.limit));
    if (typeof params.offset === 'number') query.append('offset', String(params.offset));

    const qs = query.toString();
    return this.get(`/users${qs ? `?${qs}` : ''}`);
  }
}
