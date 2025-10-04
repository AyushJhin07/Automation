import { Buffer } from 'node:buffer';
import { APIResponse, BaseAPIClient } from './BaseAPIClient';

export interface GreenhouseAPIClientConfig {
  apiKey: string;
}

export interface CreateCandidateParams {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
}

export interface UpdateCandidateParams {
  candidateId: string | number;
  updates: Record<string, any>;
}

export interface AdvanceStageParams {
  applicationId: string | number;
  stageId: string | number;
}

export interface ScheduleInterviewParams {
  applicationId: string | number;
  interviewerId: string | number;
  startTime: string;
  endTime: string;
}

export interface AddNoteParams {
  candidateId: string | number;
  message: string;
}

export interface CandidatePollingParams {
  page?: number;
  perPage?: number;
  createdAfter?: string;
  updatedAfter?: string;
}

export interface ApplicationPollingParams {
  page?: number;
  perPage?: number;
  updatedAfter?: string;
  jobId?: string | number;
}

export class GreenhouseAPIClient extends BaseAPIClient {
  private readonly config: GreenhouseAPIClientConfig;

  constructor(config: GreenhouseAPIClientConfig) {
    super('https://harvest.greenhouse.io/v1', { apiKey: config.apiKey });
    this.config = config;
  }

  protected getAuthHeaders(): Record<string, string> {
    const token = Buffer.from(`${this.config.apiKey}:`).toString('base64');
    return {
      Authorization: `Basic ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Apps-Script-Automation/1.0',
    };
  }

  async testConnection(): Promise<APIResponse<any>> {
    return this.makeRequest('GET', '/users/me');
  }

  async createCandidate(params: CreateCandidateParams): Promise<any> {
    const payload: Record<string, any> = {
      first_name: params.firstName,
      last_name: params.lastName,
      email_addresses: [
        {
          type: 'work',
          value: params.email,
        },
      ],
    };

    if (params.phone) {
      payload.phone_numbers = [
        {
          type: 'mobile',
          value: params.phone,
        },
      ];
    }

    const response = await this.makeRequest('POST', '/candidates', payload);
    return this.handleResponse(response);
  }

  async updateCandidate(params: UpdateCandidateParams): Promise<any> {
    const endpoint = `/candidates/${this.encodeId(params.candidateId)}`;
    const response = await this.makeRequest('PATCH', endpoint, params.updates ?? {});
    return this.handleResponse(response);
  }

  async advanceStage(params: AdvanceStageParams): Promise<any> {
    const endpoint = `/applications/${this.encodeId(params.applicationId)}/stages`;
    const response = await this.makeRequest('POST', endpoint, {
      stage_id: this.coerceNumeric(params.stageId),
    });
    return this.handleResponse(response);
  }

  async scheduleInterview(params: ScheduleInterviewParams): Promise<any> {
    const payload = {
      application_id: this.coerceNumeric(params.applicationId),
      start_time: params.startTime,
      end_time: params.endTime,
      interviewers: [
        {
          interviewer_id: this.coerceNumeric(params.interviewerId),
        },
      ],
    };

    const response = await this.makeRequest('POST', '/scheduled_interviews', payload);
    return this.handleResponse(response);
  }

  async addNote(params: AddNoteParams): Promise<any> {
    const endpoint = `/candidates/${this.encodeId(params.candidateId)}/notes`;
    const response = await this.makeRequest('POST', endpoint, {
      note: params.message,
    });
    return this.handleResponse(response);
  }

  async pollCandidateCreated(params: CandidatePollingParams = {}): Promise<any[]> {
    try {
      const query = this.buildPaginationQuery(params.page, params.perPage);
      if (params.createdAfter) {
        query.created_after = params.createdAfter;
      }
      if (params.updatedAfter) {
        query.updated_after = params.updatedAfter;
      }

      const response = await this.makeRequest<any[]>('GET', '/candidates', query);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : data ? [data] : [];
    } catch (error) {
      console.error('Polling Candidate Created failed:', error);
      return [];
    }
  }

  async pollApplicationUpdated(params: ApplicationPollingParams = {}): Promise<any[]> {
    try {
      const query = this.buildPaginationQuery(params.page, params.perPage);
      if (params.updatedAfter) {
        query.updated_after = params.updatedAfter;
      }
      if (params.jobId !== undefined) {
        query.job_id = this.coerceNumeric(params.jobId);
      }

      const response = await this.makeRequest<any[]>('GET', '/applications', query);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : data ? [data] : [];
    } catch (error) {
      console.error('Polling Application Updated failed:', error);
      return [];
    }
  }

  private handleResponse<T>(response: APIResponse<T>): T {
    if (!response.success) {
      const detail = response.error || 'Unknown error';
      throw new Error(`Greenhouse API request failed: ${detail}`);
    }
    return response.data as T;
  }

  private buildPaginationQuery(page?: number, perPage?: number): Record<string, any> {
    const query: Record<string, any> = {};
    if (page !== undefined) {
      const normalized = Number(page);
      if (Number.isFinite(normalized)) {
        query.page = Math.max(1, Math.floor(normalized));
      }
    }
    if (perPage !== undefined) {
      const normalized = Number(perPage);
      if (Number.isFinite(normalized)) {
        query.per_page = Math.min(500, Math.max(1, Math.floor(normalized)));
      }
    }
    return query;
  }

  private coerceNumeric(value: string | number): number | string {
    if (typeof value === 'number') {
      return value;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  }

  private encodeId(value: string | number): string {
    return encodeURIComponent(String(value));
  }
}
