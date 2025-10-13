import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

export class GoogleSlidesAPIClient extends BaseAPIClient {
  constructor(credentials: APICredentials) {
    super('https://slides.googleapis.com/v1', credentials);
    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'create_presentation': this.createPresentation.bind(this) as any,
      'get_presentation': this.getPresentation.bind(this) as any,
      'batch_update': this.batchUpdate.bind(this) as any,
      'create_slide': this.createSlide.bind(this) as any,
      'delete_object': this.deleteObject.bind(this) as any,
      'insert_text': this.insertText.bind(this) as any,
      'replace_all_text': this.replaceAllText.bind(this) as any,
      'create_shape': this.createShape.bind(this) as any,
      'create_image': this.createImage.bind(this) as any,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    const token = this.credentials.accessToken || '';
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    const resp = await fetch('https://slides.googleapis.com/$discovery/rest?version=v1');
    return resp.ok ? { success: true, data: await resp.json().catch(() => ({})) } : { success: false, error: `HTTP ${resp.status}` };
  }

  public async createPresentation(params: { title?: string }): Promise<APIResponse<any>> {
    const payload: Record<string, any> = {};
    if (params?.title) {
      payload.title = params.title;
    }
    return this.post('/presentations', payload, this.getAuthHeaders());
  }

  public async getPresentation(params: { presentationId: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['presentationId']);
    return this.get(`/presentations/${params.presentationId}`, this.getAuthHeaders());
  }

  public async batchUpdate(params: {
    presentationId: string;
    requests: any[];
    writeControl?: Record<string, any>;
  }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['presentationId', 'requests']);
    return this.executeBatchUpdate(params.presentationId, {
      requests: this.normalizeRequests(params.requests, { compactEntries: true }),
      writeControl: this.sanitizeObject(params.writeControl),
    });
  }

  public async createSlide(params: {
    presentationId: string;
    slideLayoutReference?: Record<string, any>;
    objectId?: string;
    insertionIndex?: number;
    placeholderIdMappings?: any[];
  }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['presentationId']);
    const payload = this.compact({
      objectId: params.objectId,
      slideLayoutReference: this.sanitizeObject(params.slideLayoutReference),
      insertionIndex: this.toFiniteNumber(params.insertionIndex),
      placeholderIdMappings: this.sanitizeArrayOfObjects(params.placeholderIdMappings),
    });

    return this.executeSingleRequest(params.presentationId, 'createSlide', payload);
  }

  public async deleteObject(params: { presentationId: string; objectId: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['presentationId', 'objectId']);
    return this.executeSingleRequest(params.presentationId, 'deleteObject', {
      objectId: params.objectId,
    });
  }

  public async insertText(params: {
    presentationId: string;
    objectId: string;
    text: string;
    insertionIndex?: number;
  }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['presentationId', 'objectId', 'text']);
    const insertionIndex = this.toFiniteNumber(params.insertionIndex, 0);
    return this.executeSingleRequest(params.presentationId, 'insertText', {
      objectId: params.objectId,
      text: params.text,
      insertionIndex,
    });
  }

  public async replaceAllText(params: {
    presentationId: string;
    containsText: Record<string, any>;
    replaceText: string;
    pageObjectIds?: string[];
  }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['presentationId', 'containsText', 'replaceText']);
    return this.executeSingleRequest(params.presentationId, 'replaceAllText', this.compact({
      containsText: this.sanitizeObject(params.containsText),
      replaceText: params.replaceText,
      pageObjectIds: this.sanitizeStringArray(params.pageObjectIds),
    }));
  }

  public async createShape(params: {
    presentationId: string;
    pageId: string;
    objectId: string;
    shapeType: string;
    elementProperties?: Record<string, any>;
  }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['presentationId', 'pageId', 'objectId', 'shapeType']);
    const elementProperties = this.sanitizeObject(this.withPageObject(params.pageId, params.elementProperties));
    return this.executeSingleRequest(params.presentationId, 'createShape', this.compact({
      objectId: params.objectId,
      shapeType: params.shapeType,
      elementProperties,
    }));
  }

  public async createImage(params: {
    presentationId: string;
    pageId: string;
    objectId: string;
    url: string;
    elementProperties?: Record<string, any>;
  }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['presentationId', 'pageId', 'objectId', 'url']);
    const elementProperties = this.sanitizeObject(this.withPageObject(params.pageId, params.elementProperties));
    return this.executeSingleRequest(params.presentationId, 'createImage', this.compact({
      objectId: params.objectId,
      url: params.url,
      elementProperties,
    }));
  }

  private async executeBatchUpdate(
    presentationId: string,
    payload: { requests: any[]; writeControl?: Record<string, any> | undefined }
  ): Promise<APIResponse<any>> {
    if (!presentationId) {
      throw new Error('presentationId is required');
    }

    const safePayload: Record<string, any> = {
      requests: this.normalizeRequests(payload?.requests, { compactEntries: true }),
    };

    if (!safePayload.requests.length) {
      throw new Error('At least one request entry is required for batchUpdate');
    }

    const writeControl = this.sanitizeObject(payload?.writeControl);
    if (writeControl && Object.keys(writeControl).length > 0) {
      safePayload.writeControl = writeControl;
    }

    const encodedId = encodeURIComponent(presentationId);
    return this.post(`/presentations/${encodedId}:batchUpdate`, safePayload, this.getAuthHeaders());
  }

  private normalizeRequests(input: any, options?: { compactEntries?: boolean }): any[] {
    if (!Array.isArray(input)) {
      return [];
    }

    const compactEntries = options?.compactEntries ?? false;
    const result: any[] = [];

    for (const entry of input) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }

      if (compactEntries) {
        const sanitized = this.sanitizeObject(entry as Record<string, any>);
        if (sanitized && Object.keys(sanitized).length > 0) {
          result.push(sanitized);
        }
      } else {
        result.push(entry);
      }
    }

    return result;
  }

  private compact<T extends Record<string, any>>(value: T): T {
    const result: Record<string, any> = {};
    for (const [key, entry] of Object.entries(value ?? {})) {
      if (entry !== undefined && entry !== null) {
        result[key] = entry;
      }
    }
    return result as T;
  }

  private withPageObject(pageId: string, elementProperties?: Record<string, any>): Record<string, any> | undefined {
    const merged = { ...(elementProperties ?? {}) };
    if (pageId && !merged.pageObjectId) {
      merged.pageObjectId = pageId;
    }
    return Object.keys(merged).length > 0 ? merged : undefined;
  }

  private sanitizeObject<T extends Record<string, any>>(value?: T | null): T | undefined {
    if (!value || typeof value !== 'object') {
      return undefined;
    }

    const result: Record<string, any> = {};

    for (const [key, entry] of Object.entries(value)) {
      if (entry === undefined || entry === null) {
        continue;
      }

      if (Array.isArray(entry)) {
        if (entry.length > 0) {
          result[key] = entry;
        }
        continue;
      }

      if (typeof entry === 'object') {
        const nested = this.sanitizeObject(entry as Record<string, any>);
        if (nested && Object.keys(nested).length > 0) {
          result[key] = nested;
        }
        continue;
      }

      result[key] = entry;
    }

    return Object.keys(result).length > 0 ? (result as T) : undefined;
  }

  private sanitizeArrayOfObjects(input: any): Record<string, any>[] | undefined {
    if (!Array.isArray(input)) {
      return undefined;
    }

    const result: Record<string, any>[] = [];

    for (const entry of input) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }

      const sanitized = this.sanitizeObject(entry as Record<string, any>);
      if (sanitized && Object.keys(sanitized).length > 0) {
        result.push(sanitized);
      }
    }

    return result.length > 0 ? result : undefined;
  }

  private sanitizeStringArray(input: any): string[] | undefined {
    if (!Array.isArray(input)) {
      return undefined;
    }

    const result = input.filter(value => typeof value === 'string' && value.trim().length > 0);
    return result.length > 0 ? result : undefined;
  }

  private toFiniteNumber(value: any, fallback?: number): number | undefined {
    if (value === undefined || value === null || value === '') {
      return fallback;
    }

    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  private executeSingleRequest(
    presentationId: string,
    operation: string,
    payload: Record<string, any>
  ): Promise<APIResponse<any>> {
    const sanitizedPayload = this.sanitizeObject(payload) ?? {};
    const request = { [operation]: sanitizedPayload };
    return this.executeBatchUpdate(presentationId, { requests: [request] });
  }
}

