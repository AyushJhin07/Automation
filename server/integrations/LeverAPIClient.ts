import {
  APICredentials,
  APIResponse,
  BaseAPIClient,
  DynamicOptionHandlerContext,
  DynamicOptionResult,
  DynamicOptionValue,
} from './BaseAPIClient';

interface LeverCredentials extends APICredentials {
  apiKey?: string;
}

interface OpportunityPhone {
  type?: string;
  value?: string;
}

interface OpportunityArchive {
  archivedAt?: number;
  reason?: 'hired' | 'passed' | 'lost' | 'other';
}

interface CreateOpportunityParams {
  name: string;
  headline?: string;
  summary?: string;
  location?: string;
  phone?: OpportunityPhone;
  emails?: string[];
  links?: string[];
  tags?: string[];
  sources?: string[];
  origin?: 'agency' | 'applied' | 'internal' | 'referred' | 'sourced' | 'university';
  owner?: string;
  followers?: string[];
  stage?: string;
  archived?: OpportunityArchive;
  postings?: string[];
}

interface UpdateOpportunityParams extends Partial<CreateOpportunityParams> {
  id: string;
}

interface ListOpportunitiesParams {
  limit?: number;
  offset?: string;
  posted_after?: number;
  posted_before?: number;
  updated_after?: number;
  updated_before?: number;
  posting_id?: string;
  stage_id?: string;
  source_id?: string;
  archived?: boolean;
  confidentiality?: 'confidential' | 'non-confidential';
  email?: string;
}

interface ArchiveOpportunityParams {
  id: string;
  reason: 'hired' | 'passed' | 'lost' | 'other';
}

interface AddNoteParams {
  opportunity_id: string;
  value: string;
  visibility?: 'public' | 'private';
}

interface AdvanceOpportunityParams {
  id: string;
  stage: string;
}

interface ListStagesParams {
  limit?: number;
  offset?: string;
}

type StagePayload = {
  id?: string;
  text?: string;
  name?: string;
  [key: string]: any;
};

export class LeverAPIClient extends BaseAPIClient {
  private readonly authHeader: string;

  constructor(credentials: LeverCredentials) {
    const apiKey = credentials.apiKey ?? credentials.accessToken;
    if (!apiKey) {
      throw new Error('Lever integration requires an API key');
    }

    super('https://api.lever.co/v1', { ...credentials, apiKey });

    this.authHeader = LeverAPIClient.buildAuthHeader(apiKey);

    this.registerHandlers({
      test_connection: this.testConnection.bind(this) as any,
      list_opportunities: this.listOpportunities.bind(this) as any,
      get_opportunity: this.getOpportunity.bind(this) as any,
      create_opportunity: this.createOpportunity.bind(this) as any,
      update_opportunity: this.updateOpportunity.bind(this) as any,
      archive_opportunity: this.archiveOpportunity.bind(this) as any,
      list_postings: this.listPostings.bind(this) as any,
      get_posting: this.getPosting.bind(this) as any,
      list_users: this.listUsers.bind(this) as any,
      get_user: this.getUser.bind(this) as any,
      add_note: this.addNote.bind(this) as any,
      advance_opportunity: this.advanceOpportunity.bind(this) as any,
    });

    this.registerDynamicOptionHandlers({
      list_stages: this.buildStageOptions.bind(this),
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      Authorization: this.authHeader,
      Accept: 'application/json',
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.listUsers({ limit: 1 });
  }

  public async listOpportunities(params: ListOpportunitiesParams = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString(this.stripUndefined(params));
    return this.withLeverRetries(() => this.get(`/opportunities${query}`));
  }

  public async getOpportunity(params: { id: string; expand?: string[] }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['id']);

    const query = this.buildQueryString({
      expand: Array.isArray(params.expand) && params.expand.length > 0 ? params.expand.join(',') : undefined,
    });

    return this.withLeverRetries(() => this.get(`/opportunities/${this.encodeId(params.id)}${query}`));
  }

  public async createOpportunity(params: CreateOpportunityParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['name']);
    const payload = this.buildOpportunityPayload(params);
    return this.withLeverRetries(() => this.post('/opportunities', payload));
  }

  public async updateOpportunity(params: UpdateOpportunityParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['id']);
    const { id, ...updates } = params;
    const payload = this.buildOpportunityPayload(updates);

    if (Object.keys(payload).length === 0) {
      throw new Error('Lever update_opportunity requires at least one field to update');
    }

    return this.withLeverRetries(() => this.patch(`/opportunities/${this.encodeId(id)}`, payload));
  }

  public async archiveOpportunity(params: ArchiveOpportunityParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['id', 'reason']);

    return this.withLeverRetries(() =>
      this.post(`/opportunities/${this.encodeId(params.id)}/archive`, {
        reason: params.reason,
      })
    );
  }

  public async listPostings(params: {
    limit?: number;
    offset?: string;
    include_archived?: boolean;
    include_confidential?: boolean;
    team_id?: string;
    location_id?: string;
    commitment_id?: string;
  } = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString(this.stripUndefined(params));
    return this.withLeverRetries(() => this.get(`/postings${query}`));
  }

  public async getPosting(params: { id: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['id']);
    return this.withLeverRetries(() => this.get(`/postings/${this.encodeId(params.id)}`));
  }

  public async listUsers(params: { limit?: number; offset?: string; include_deactivated?: boolean } = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString(this.stripUndefined(params));
    return this.withLeverRetries(() => this.get(`/users${query}`));
  }

  public async getUser(params: { id: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['id']);
    return this.withLeverRetries(() => this.get(`/users/${this.encodeId(params.id)}`));
  }

  public async addNote(params: AddNoteParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['opportunity_id', 'value']);

    const body = this.pruneEmpty({
      value: params.value,
      visibility: params.visibility ?? 'public',
    });

    return this.withLeverRetries(() =>
      this.post(`/opportunities/${this.encodeId(params.opportunity_id)}/notes`, body)
    );
  }

  public async advanceOpportunity(params: AdvanceOpportunityParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as Record<string, unknown>, ['id', 'stage']);

    const payload = this.pruneEmpty({
      stage: params.stage,
      stageId: params.stage,
      toStageId: params.stage,
    });

    return this.withLeverRetries(() =>
      this.post(`/opportunities/${this.encodeId(params.id)}/advance`, payload)
    );
  }

  private async listStages(params: ListStagesParams = {}): Promise<APIResponse<any>> {
    const query = this.buildQueryString(this.stripUndefined(params));
    return this.withLeverRetries(() => this.get(`/stages${query}`));
  }

  private async buildStageOptions(
    context: DynamicOptionHandlerContext = {}
  ): Promise<DynamicOptionResult> {
    const limit = this.clampOptionLimit(context.limit, 200);
    const cursor = typeof context.cursor === 'string' && context.cursor.length > 0 ? context.cursor : undefined;

    const response = await this.listStages({
      limit,
      offset: cursor,
    });

    if (!response.success) {
      return {
        success: false,
        options: [],
        error: response.error || 'Failed to load Lever stages',
      };
    }

    const payload = response.data ?? {};
    const rawStages: StagePayload[] = Array.isArray((payload as any).data)
      ? (payload as any).data
      : Array.isArray(payload)
        ? (payload as StagePayload[])
        : [];

    const search = typeof context.search === 'string' ? context.search.trim().toLowerCase() : '';

    const options: DynamicOptionValue[] = rawStages
      .filter(stage => {
        if (!search) return true;
        const label = this.resolveStageLabel(stage).toLowerCase();
        return label.includes(search);
      })
      .map(stage => {
        const value = this.resolveStageId(stage);
        const label = this.resolveStageLabel(stage);
        if (!value || !label) {
          return null;
        }
        return {
          value,
          label,
          data: stage,
        } as DynamicOptionValue;
      })
      .filter((option): option is DynamicOptionValue => Boolean(option));

    const nextCursor = typeof (payload as any)?.next === 'string' && (payload as any).next.length > 0
      ? (payload as any).next
      : typeof (payload as any)?.offset === 'string' && (payload as any).offset.length > 0
        ? (payload as any).offset
        : undefined;

    const totalCount = typeof (payload as any)?.total === 'number' ? Number((payload as any).total) : undefined;

    return {
      success: true,
      options,
      nextCursor,
      totalCount,
      raw: payload,
    };
  }

  private withLeverRetries<T>(operation: () => Promise<APIResponse<T>>): Promise<APIResponse<T>> {
    return this.withRetries(operation, {
      retries: 2,
      initialDelayMs: 0,
      maxDelayMs: 4000,
    });
  }

  private buildOpportunityPayload(params: Partial<CreateOpportunityParams>): Record<string, any> {
    const { phone, emails, links, tags, sources, followers, postings, archived, ...rest } = params;
    const payload: Record<string, any> = this.pruneEmpty(rest as Record<string, any>);

    const normalizedPhone = this.normalizePhone(phone);
    if (normalizedPhone) {
      payload.phones = [normalizedPhone];
    }

    const normalizedEmails = this.normalizeStringArray(emails);
    if (normalizedEmails) {
      payload.emails = normalizedEmails;
    }

    const normalizedLinks = this.normalizeStringArray(links);
    if (normalizedLinks) {
      payload.links = normalizedLinks;
    }

    const normalizedTags = this.normalizeStringArray(tags);
    if (normalizedTags) {
      payload.tags = normalizedTags;
    }

    const normalizedSources = this.normalizeStringArray(sources);
    if (normalizedSources) {
      payload.sources = normalizedSources;
    }

    const normalizedFollowers = this.normalizeStringArray(followers);
    if (normalizedFollowers) {
      payload.followers = normalizedFollowers;
    }

    const normalizedPostings = this.normalizeStringArray(postings);
    if (normalizedPostings) {
      payload.postings = normalizedPostings;
    }

    if (archived) {
      const archivePayload = this.pruneEmpty(archived as Record<string, any>);
      if (Object.keys(archivePayload).length > 0) {
        payload.archived = archivePayload;
      }
    }

    return payload;
  }

  private normalizePhone(phone?: OpportunityPhone): Record<string, any> | null {
    if (!phone) {
      return null;
    }

    const value = typeof phone.value === 'string' ? phone.value.trim() : '';
    if (!value) {
      return null;
    }

    const normalized: Record<string, any> = { value };
    if (typeof phone.type === 'string' && phone.type.trim().length > 0) {
      normalized.type = phone.type.trim();
    }
    return normalized;
  }

  private normalizeStringArray(values?: (string | null | undefined)[]): string[] | undefined {
    if (!values) {
      return undefined;
    }

    const normalized = values
      .map(value => (typeof value === 'string' ? value.trim() : ''))
      .filter(value => value.length > 0);

    return normalized.length > 0 ? normalized : undefined;
  }

  private stripUndefined(params: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) {
        continue;
      }
      result[key] = value;
    }
    return result;
  }

  private pruneEmpty(params: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) {
        continue;
      }
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed.length === 0) {
          continue;
        }
        result[key] = trimmed;
        continue;
      }
      if (Array.isArray(value)) {
        const normalized = value
          .map(item => (typeof item === 'string' ? item.trim() : item))
          .filter(item =>
            item !== undefined &&
            item !== null &&
            (!(typeof item === 'string') || item.trim().length > 0)
          );
        if (normalized.length === 0) {
          continue;
        }
        result[key] = normalized;
        continue;
      }
      if (typeof value === 'object') {
        const nested = this.pruneEmpty(value as Record<string, any>);
        if (Object.keys(nested).length === 0) {
          continue;
        }
        result[key] = nested;
        continue;
      }
      result[key] = value;
    }
    return result;
  }

  private encodeId(id: string): string {
    const trimmed = String(id ?? '').trim();
    if (!trimmed) {
      throw new Error('Lever operation requires a valid identifier');
    }
    return encodeURIComponent(trimmed);
  }

  private clampOptionLimit(rawLimit: unknown, fallback: number): number {
    const parsed = Number(rawLimit);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.min(Math.max(Math.floor(parsed), 1), fallback);
    }
    return fallback;
  }

  private resolveStageId(stage: StagePayload): string {
    const id = typeof stage.id === 'string' && stage.id.trim().length > 0 ? stage.id.trim() : undefined;
    const fallback = typeof (stage as any)?._id === 'string' ? (stage as any)._id.trim() : undefined;
    return id ?? fallback ?? '';
  }

  private resolveStageLabel(stage: StagePayload): string {
    const label =
      (typeof stage.text === 'string' && stage.text.trim().length > 0
        ? stage.text.trim()
        : typeof stage.name === 'string' && stage.name.trim().length > 0
          ? stage.name.trim()
          : undefined) ?? this.resolveStageId(stage);
    return label ?? '';
  }

  private static buildAuthHeader(rawKey: string): string {
    const trimmed = String(rawKey ?? '').trim();
    if (!trimmed) {
      throw new Error('Lever API key cannot be empty');
    }

    if (trimmed.toLowerCase().startsWith('basic ')) {
      return trimmed;
    }

    const sanitized = trimmed.replace(/\s+/g, '');
    const looksBase64 = /^[A-Za-z0-9+/]+=*$/.test(sanitized) && !trimmed.includes(':');

    if (looksBase64 && sanitized.length % 4 === 0) {
      return `Basic ${sanitized}`;
    }

    const credential = trimmed.includes(':') ? trimmed : `${trimmed}:`;
    const encoded = Buffer.from(credential, 'utf8').toString('base64');
    return `Basic ${encoded}`;
  }
}
