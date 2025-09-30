import type { WorkflowNodeMetadata } from '../../../common/workflow-types';
import { getErrorMessage } from '../../types/common';

type MetadataMap = WorkflowNodeMetadata & {
  [key: string]: any;
};

export interface MetadataResolutionInput {
  credentials: Record<string, any>;
  params?: Record<string, any>;
  options?: Record<string, any>;
}

export interface MetadataResolutionResult {
  success: boolean;
  metadata?: MetadataMap;
  extras?: Record<string, any>;
  warnings?: string[];
  error?: string;
  status?: number;
}

type ResolverFn = (input: MetadataResolutionInput) => Promise<MetadataResolutionResult>;

const SHEETS_API = 'https://sheets.googleapis.com/v4';
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1';
const HUBSPOT_API = 'https://api.hubspot.com';
const AIRTABLE_META_API = 'https://api.airtable.com/v0/meta';

const SALESFORCE_VERSION = 'v58.0';

const normalize = (value: unknown): string => {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');
};

const decodeBase64Url = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  try {
    return Buffer.from(value, 'base64').toString('utf-8');
  } catch (error) {
    console.warn('Failed to decode base64 payload:', error);
    return undefined;
  }
};

const toHeadersObject = (headers: Array<{ name?: string; value?: string }> | undefined): Record<string, string> => {
  const result: Record<string, string> = {};
  if (!Array.isArray(headers)) return result;
  headers.forEach((header) => {
    const key = header?.name?.trim();
    if (!key) return;
    result[key] = header?.value ?? '';
  });
  return result;
};

const buildSampleFromColumns = (columns: string[]): Record<string, any> => {
  const sample: Record<string, any> = {};
  columns.forEach((column) => {
    const key = normalize(column).replace(/-/g, '_') || 'value';
    sample[column] = `{{${key}}}`;
  });
  return sample;
};

export class ConnectorMetadataService {
  private resolvers: Map<string, ResolverFn>;
  private aliasCache: Map<string, string>;

  constructor() {
    this.aliasCache = new Map();
    this.resolvers = new Map<string, ResolverFn>([
      ['google-sheets', this.resolveGoogleSheets.bind(this)],
      ['google-sheets-enhanced', this.resolveGoogleSheets.bind(this)],
      ['sheets', this.resolveGoogleSheets.bind(this)],
      ['gmail', this.resolveGmail.bind(this)],
      ['gmail-enhanced', this.resolveGmail.bind(this)],
      ['google-mail', this.resolveGmail.bind(this)],
      ['salesforce', this.resolveSalesforce.bind(this)],
      ['salesforce-enhanced', this.resolveSalesforce.bind(this)],
      ['hubspot', this.resolveHubspot.bind(this)],
      ['hubspot-enhanced', this.resolveHubspot.bind(this)],
      ['airtable', this.resolveAirtable.bind(this)],
      ['airtable-enhanced', this.resolveAirtable.bind(this)],
    ]);
  }

  public async resolve(connector: string, input: MetadataResolutionInput): Promise<MetadataResolutionResult> {
    const key = this.normalizeConnector(connector);
    const resolver = this.resolvers.get(key);

    if (!resolver) {
      return {
        success: false,
        error: `Unsupported connector: ${connector}`,
        status: 404,
      };
    }

    try {
      return await resolver(input);
    } catch (error) {
      console.error(`Metadata resolver for ${connector} failed:`, error);
      return {
        success: false,
        error: getErrorMessage(error) || 'METADATA_RESOLUTION_FAILED',
        status: 500,
      };
    }
  }

  private normalizeConnector(connector: string): string {
    const cached = this.aliasCache.get(connector);
    if (cached) return cached;

    const value = normalize(connector);
    const aliases: Record<string, string[]> = {
      'google-sheets': ['google-sheets', 'google-sheet', 'sheets', 'sheet', 'googlesheets'],
      'gmail': ['gmail', 'gmail-enhanced', 'google-mail', 'googlemail'],
      'salesforce': ['salesforce', 'salesforce-enhanced', 'sf'],
      'hubspot': ['hubspot', 'hubspot-enhanced'],
      'airtable': ['airtable', 'airtable-enhanced'],
      'slack': ['slack', 'slack-enhanced'],
      'shopify': ['shopify', 'shopify-enhanced'],
      'github': ['github', 'github-enhanced'],
      'google-drive': ['google-drive', 'drive'],
      'google-calendar': ['google-calendar', 'calendar'],
      'trello': ['trello', 'trello-enhanced'],
      'typeform': ['typeform'],
      'stripe': ['stripe', 'stripe-enhanced'],
      'dropbox': ['dropbox', 'dropbox-enhanced'],
      'jira': ['jira', 'jira-cloud', 'jira-software', 'jira-service-management'],
      'asana': ['asana', 'asana-enhanced'],
      'mailchimp': ['mailchimp', 'mailchimp-enhanced'],
      'sendgrid': ['sendgrid', 'sendgrid-enhanced'],
      'mailgun': ['mailgun', 'mailgun-enhanced'],
      'zendesk': ['zendesk', 'zendesk-enhanced'],
      'pipedrive': ['pipedrive', 'pipedrive-enhanced'],
      'twilio': ['twilio', 'twilio-enhanced'],
      'box': ['box'],
      'onedrive': ['onedrive', 'one-drive'],
      'sharepoint': ['sharepoint'],
      'smartsheet': ['smartsheet'],
      'google-docs': ['google-docs', 'docs'],
      'google-slides': ['google-slides', 'slides'],
      'google-forms': ['google-forms', 'forms'],
      'microsoft-teams': ['microsoft-teams', 'teams'],
      'outlook': ['outlook', 'microsoft-outlook'],
      'google-chat': ['google-chat', 'chat'],
      'zoom': ['zoom', 'zoom-enhanced'],
      'calendly': ['calendly'],
      'intercom': ['intercom'],
      'monday': ['monday', 'monday-com', 'monday-enhanced'],
      'servicenow': ['servicenow'],
      'freshdesk': ['freshdesk'],
      'gitlab': ['gitlab'],
      'bitbucket': ['bitbucket'],
      'confluence': ['confluence'],
      'jira-service-management': ['jira-service-management', 'jira service management'],
    };

    for (const [key, list] of Object.entries(aliases)) {
      if (list.some((entry) => normalize(entry) === value)) {
        this.aliasCache.set(connector, key);
        return key;
      }
    }

    this.aliasCache.set(connector, value);
    return value;
  }

  private extractAccessToken(credentials: Record<string, any>): string | undefined {
    return (
      credentials?.accessToken ||
      credentials?.token ||
      credentials?.oauthToken ||
      credentials?.bearerToken ||
      credentials?.bearer
    );
  }

  private async request(
    url: string,
    init: RequestInit,
    parseJson = true
  ): Promise<{ success: boolean; status: number; data?: any; text?: string; headers: Headers; }> {
    const requestInit: RequestInit = {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init.headers || {}),
      },
    };

    try {
      const response = await fetch(url, requestInit);
      const text = await response.text();
      let data: any = undefined;
      if (parseJson && text) {
        try {
          data = JSON.parse(text);
        } catch (error) {
          console.warn('Failed to parse JSON response for', url, error);
        }
      }

      return {
        success: response.ok,
        status: response.status,
        data,
        text,
        headers: response.headers,
      };
    } catch (error) {
      return {
        success: false,
        status: 0,
        text: getErrorMessage(error),
        headers: new Headers(),
      };
    }
  }

  // --- Google Sheets ----------------------------------------------------

  private extractSpreadsheetId(params: Record<string, any> | undefined): string | undefined {
    if (!params) return undefined;
    const direct =
      params.spreadsheetId ||
      params.spreadsheetID ||
      params.sheetId ||
      params.sheetID ||
      params.sheet_id ||
      params.spreadsheet_id;
    if (direct && typeof direct === 'string') {
      return direct.trim();
    }

    const urlCandidate = params.spreadsheetUrl || params.sheetUrl || params.url;
    if (typeof urlCandidate === 'string' && urlCandidate.includes('/spreadsheets/')) {
      const match = urlCandidate.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
      if (match) return match[1];
    }
    return undefined;
  }

  private extractSheetName(params: Record<string, any> | undefined): string | undefined {
    if (!params) return undefined;
    const candidate =
      params.sheetName ||
      params.sheet ||
      params.worksheet ||
      params.tab ||
      params.tabName ||
      params.sheet_title ||
      params.sheetTitle;
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
    return undefined;
  }

  private async resolveGoogleSheets(input: MetadataResolutionInput): Promise<MetadataResolutionResult> {
    const accessToken = this.extractAccessToken(input.credentials);
    if (!accessToken) {
      return { success: false, error: 'Missing Sheets access token', status: 400 };
    }

    const spreadsheetId = this.extractSpreadsheetId(input.params);
    if (!spreadsheetId) {
      return { success: false, error: 'Missing spreadsheetId', status: 400 };
    }

    const sheetNamePreference = this.extractSheetName(input.params);

    const tabUrl = `${SHEETS_API}/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties.title`;
    const tabsResponse = await this.request(tabUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!tabsResponse.success) {
      const status = tabsResponse.status || 500;
      const error = status === 401 || status === 403 ? 'Sheets authentication failed' : 'Failed to load sheet metadata';
      return { success: false, error, status };
    }

    const tabs = Array.isArray(tabsResponse.data?.sheets)
      ? tabsResponse.data.sheets
          .map((sheet: any) => sheet?.properties?.title)
          .filter((title: any) => typeof title === 'string' && title.trim().length > 0)
          .map((title: string) => title.trim())
      : [];

    const targetSheet = sheetNamePreference && tabs.includes(sheetNamePreference)
      ? sheetNamePreference
      : tabs[0];

    let headers: string[] = [];
    let sampleRow: Record<string, any> | undefined;
    const warnings: string[] = [];

    if (targetSheet) {
      const headerUrl = `${SHEETS_API}/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(targetSheet)}!1:1`;
      const headerResponse = await this.request(headerUrl, {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (headerResponse.success) {
        const values = headerResponse.data?.values?.[0];
        if (Array.isArray(values)) {
          headers = values
            .map((value: any) => (typeof value === 'string' ? value.trim() : ''))
            .filter((value: string) => value.length > 0);
        }
      } else if (headerResponse.status === 401 || headerResponse.status === 403) {
        return { success: false, error: 'Sheets authentication failed', status: headerResponse.status };
      } else if (headerResponse.status && headerResponse.status >= 400) {
        warnings.push(`Failed to fetch header row (${headerResponse.status})`);
      }

      if (headers.length) {
        const sampleUrl = `${SHEETS_API}/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(targetSheet)}!2:2`;
        const sampleResponse = await this.request(sampleUrl, {
          method: 'GET',
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (sampleResponse.success) {
          const row = sampleResponse.data?.values?.[0];
          if (Array.isArray(row)) {
            sampleRow = {};
            headers.forEach((header, index) => {
              const value = row[index];
              if (value !== undefined) sampleRow![header] = value;
            });
          }
        }
      }
    }

    const metadata: MetadataMap = { derivedFrom: ['api:google-sheets'] };
    if (headers.length) {
      metadata.columns = headers;
      metadata.headers = headers;
    }
    if (sampleRow && Object.keys(sampleRow).length > 0) {
      metadata.sample = sampleRow;
      metadata.sampleRow = sampleRow;
    } else if (headers.length) {
      metadata.sample = buildSampleFromColumns(headers);
    }

    return {
      success: true,
      metadata,
      extras: {
        tabs,
        sheetName: targetSheet,
      },
      warnings,
    };
  }

  // --- Gmail ------------------------------------------------------------

  private async resolveGmail(input: MetadataResolutionInput): Promise<MetadataResolutionResult> {
    const accessToken = this.extractAccessToken(input.credentials);
    if (!accessToken) {
      return { success: false, error: 'Missing Gmail access token', status: 400 };
    }

    const headers = { Authorization: `Bearer ${accessToken}` };

    const labelsResponse = await this.request(`${GMAIL_API}/users/me/labels`, { method: 'GET', headers });
    if (!labelsResponse.success) {
      const status = labelsResponse.status || 500;
      const error = status === 401 || status === 403 ? 'Gmail authentication failed' : 'Failed to load Gmail labels';
      return { success: false, error, status };
    }

    const labels: string[] = Array.isArray(labelsResponse.data?.labels)
      ? labelsResponse.data.labels
          .map((label: any) => label?.name)
          .filter((name: any) => typeof name === 'string' && name.trim().length > 0)
      : [];

    const query =
      input.params?.query ||
      input.params?.search ||
      input.params?.gmailQuery ||
      input.params?.filter ||
      '';

    const messageListResponse = await this.request(
      `${GMAIL_API}/users/me/messages?maxResults=5${query ? `&q=${encodeURIComponent(String(query))}` : ''}`,
      { method: 'GET', headers }
    );

    if (messageListResponse.status === 401 || messageListResponse.status === 403) {
      return { success: false, error: 'Gmail authentication failed', status: messageListResponse.status };
    }

    let sampleMetadata: Record<string, any> | undefined;

    const messageId = messageListResponse.data?.messages?.[0]?.id;
    if (messageId) {
      const messageResponse = await this.request(
        `${GMAIL_API}/users/me/messages/${encodeURIComponent(messageId)}?format=full`,
        { method: 'GET', headers }
      );
      if (messageResponse.success) {
        sampleMetadata = this.buildGmailSample(messageResponse.data);
      }
    }

    const columns = ['From', 'To', 'Subject', 'Date', 'Snippet', 'Body'];

    const metadata: MetadataMap = {
      columns,
      headers: columns,
      derivedFrom: ['api:gmail'],
      sample: sampleMetadata ?? buildSampleFromColumns(columns),
    };

    return {
      success: true,
      metadata,
      extras: {
        labels,
        query: query || undefined,
      },
      warnings: sampleMetadata ? undefined : ['Fell back to generic email sample'],
    };
  }

  private buildGmailSample(message: any): Record<string, any> | undefined {
    if (!message) return undefined;
    const payload = message.payload;
    const headers = toHeadersObject(payload?.headers);
    const snippet = message.snippet;

    let body: string | undefined;
    if (payload?.body?.data) {
      body = decodeBase64Url(payload.body.data);
    }

    if (!body && Array.isArray(payload?.parts)) {
      for (const part of payload.parts) {
        if (part?.mimeType?.startsWith('text/') && part?.body?.data) {
          body = decodeBase64Url(part.body.data);
          if (body) break;
        }
      }
    }

    const normalized: Record<string, any> = {
      From: headers['From'] || headers['from'] || '',
      To: headers['To'] || headers['to'] || '',
      Subject: headers['Subject'] || headers['subject'] || '',
      Date: headers['Date'] || headers['date'] || '',
      Snippet: snippet || (body ? body.slice(0, 120) : ''),
      Body: body || snippet || '',
    };

    return normalized;
  }

  // --- Salesforce -------------------------------------------------------

  private async resolveSalesforce(input: MetadataResolutionInput): Promise<MetadataResolutionResult> {
    const accessToken = this.extractAccessToken(input.credentials);
    const instanceUrl: string | undefined = input.credentials?.instanceUrl || input.credentials?.instance_url;

    if (!accessToken || !instanceUrl) {
      return {
        success: false,
        error: 'Missing Salesforce access token or instanceUrl',
        status: 400,
      };
    }

    const objectName =
      input.params?.object ||
      input.params?.sobject ||
      input.params?.objectName ||
      'Lead';

    const describeUrl = `${instanceUrl.replace(/\/$/, '')}/services/data/${SALESFORCE_VERSION}/sobjects/${encodeURIComponent(
      objectName
    )}/describe`;

    const response = await this.request(describeUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.success) {
      const status = response.status || 500;
      const error = status === 401 || status === 403 ? 'Salesforce authentication failed' : 'Failed to load Salesforce metadata';
      return { success: false, error, status };
    }

    const fields = Array.isArray(response.data?.fields) ? response.data.fields : [];
    const columns = fields.map((field: any) => field?.name).filter((name: any) => typeof name === 'string');

    const sample = buildSampleFromColumns(columns.slice(0, 25));

    const metadata: MetadataMap = {
      columns,
      headers: columns,
      sample,
      derivedFrom: ['api:salesforce'],
      schema: columns.reduce<Record<string, any>>((acc, column) => {
        const field = fields.find((item: any) => item?.name === column);
        if (field) {
          acc[column] = {
            type: field.type || 'string',
            label: field.label,
            updateable: field.updateable,
            creatable: field.createable,
            required: field.nillable === false,
          };
        }
        return acc;
      }, {}),
    };

    return {
      success: true,
      metadata,
      extras: {
        object: objectName,
        fields: fields.map((field: any) => ({
          name: field?.name,
          label: field?.label,
          type: field?.type,
        })),
      },
    };
  }

  // --- HubSpot ----------------------------------------------------------

  private async resolveHubspot(input: MetadataResolutionInput): Promise<MetadataResolutionResult> {
    const accessToken = this.extractAccessToken(input.credentials);
    const apiKey = input.credentials?.apiKey || input.credentials?.hapikey;

    if (!accessToken && !apiKey) {
      return { success: false, error: 'Missing HubSpot credentials', status: 400 };
    }

    const objectType =
      input.params?.objectType ||
      input.params?.object ||
      input.params?.entity ||
      'contacts';

    const url = `${HUBSPOT_API}/crm/v3/properties/${encodeURIComponent(objectType)}`;
    const headers: Record<string, string> = accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
    const query = apiKey ? `?hapikey=${encodeURIComponent(apiKey)}` : '';

    const response = await this.request(url + query, { method: 'GET', headers });

    if (!response.success) {
      const status = response.status || 500;
      const error = status === 401 || status === 403 ? 'HubSpot authentication failed' : 'Failed to load HubSpot metadata';
      return { success: false, error, status };
    }

    const properties = Array.isArray(response.data?.results) ? response.data.results : [];
    const columns = properties
      .map((prop: any) => prop?.name)
      .filter((name: any) => typeof name === 'string');

    const metadata: MetadataMap = {
      columns,
      headers: columns,
      sample: buildSampleFromColumns(columns.slice(0, 25)),
      derivedFrom: ['api:hubspot'],
      schema: columns.reduce<Record<string, any>>((acc, column) => {
        const property = properties.find((prop: any) => prop?.name === column);
        if (property) {
          acc[column] = {
            type: property.type || property.fieldType || 'string',
            label: property.label,
            description: property.description,
          };
        }
        return acc;
      }, {}),
    };

    return {
      success: true,
      metadata,
      extras: {
        objectType,
        properties: properties.map((prop: any) => ({
          name: prop?.name,
          label: prop?.label,
          type: prop?.type || prop?.fieldType,
        })),
      },
    };
  }

  // --- Airtable ---------------------------------------------------------

  private async resolveAirtable(input: MetadataResolutionInput): Promise<MetadataResolutionResult> {
    const accessToken = this.extractAccessToken(input.credentials) || input.credentials?.apiKey;
    if (!accessToken) {
      return { success: false, error: 'Missing Airtable access token', status: 400 };
    }

    const baseId = input.params?.baseId || input.params?.base || input.params?.base_id;
    if (!baseId) {
      return { success: false, error: 'Missing Airtable baseId', status: 400 };
    }

    const tablesResponse = await this.request(`${AIRTABLE_META_API}/bases/${encodeURIComponent(baseId)}/tables`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!tablesResponse.success) {
      const status = tablesResponse.status || 500;
      const error = status === 401 || status === 403 ? 'Airtable authentication failed' : 'Failed to load Airtable metadata';
      return { success: false, error, status };
    }

    const tables: any[] = Array.isArray(tablesResponse.data?.tables) ? tablesResponse.data.tables : [];
    let table = tables[0];

    const tableName =
      input.params?.tableName ||
      input.params?.table ||
      input.params?.tableId ||
      input.params?.table_id;

    if (tableName) {
      table = tables.find((entry) => entry?.name === tableName || entry?.id === tableName) || table;
    }

    if (!table) {
      return { success: false, error: 'No tables available in Airtable base', status: 404 };
    }

    const fields = Array.isArray(table.fields) ? table.fields : [];
    const columns = fields
      .map((field: any) => field?.name)
      .filter((name: any) => typeof name === 'string');

    const metadata: MetadataMap = {
      columns,
      headers: columns,
      sample: buildSampleFromColumns(columns),
      derivedFrom: ['api:airtable'],
      schema: columns.reduce<Record<string, any>>((acc, column) => {
        const field = fields.find((entry: any) => entry?.name === column);
        if (field) {
          acc[column] = {
            type: field.type,
            description: field.description,
            options: field.options,
          };
        }
        return acc;
      }, {}),
    };

    return {
      success: true,
      metadata,
      extras: {
        baseId,
        table: { id: table.id, name: table.name, primaryFieldId: table.primaryFieldId },
        fields: fields.map((field: any) => ({
          id: field?.id,
          name: field?.name,
          type: field?.type,
        })),
      },
    };
  }
}

export const connectorMetadataService = new ConnectorMetadataService();
