// INTEGRATION MANAGER - COORDINATES ALL API CLIENTS
// Provides unified interface for executing functions across all integrated applications

import { BaseAPIClient, APICredentials, APIResponse } from './BaseAPIClient';
import { AirtableAPIClient } from './AirtableAPIClient';
import { GmailAPIClient } from './GmailAPIClient';
import { NotionAPIClient } from './NotionAPIClient';
import { ShopifyAPIClient } from './ShopifyAPIClient';
import { SlackAPIClient } from './SlackAPIClient';
import { IMPLEMENTED_CONNECTOR_IDS } from './supportedApps';
import { getErrorMessage } from '../types/common';

export const BUILDER_CORE_APP_IDS = ['sheets', 'time'] as const;

class SheetsCoreClient extends BaseAPIClient {
  private spreadsheets: Map<string, Map<string, any[][]>> = new Map();

  constructor(credentials: APICredentials) {
    super('local://sheets', credentials);
  }

  protected getAuthHeaders(): Record<string, string> {
    return {};
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return {
      success: true,
      data: {
        mode: 'local',
        app: 'sheets'
      }
    };
  }

  public async execute(
    functionId: string,
    parameters: Record<string, any>
  ): Promise<APIResponse<any>> {
    switch (functionId) {
      case 'append_row':
      case 'append_rows':
      case 'add_row':
        return this.appendRow(parameters);
      default:
        return {
          success: false,
          error: `Unknown Sheets function: ${functionId}`
        };
    }
  }

  private appendRow(parameters: Record<string, any>): APIResponse<any> {
    const spreadsheetId = this.resolveSpreadsheetId(parameters);
    if (!spreadsheetId) {
      return {
        success: false,
        error: 'Spreadsheet ID is required for append_row'
      };
    }

    const sheetName = this.resolveSheetName(parameters);
    if (!sheetName) {
      return {
        success: false,
        error: 'Sheet name is required for append_row'
      };
    }

    const rowValues = this.normalizeRowValues(parameters);
    if (rowValues.length === 0) {
      return {
        success: false,
        error: 'At least one value is required to append a row'
      };
    }

    const sheet = this.getSheet(spreadsheetId, sheetName);
    sheet.push(rowValues);

    const rowIndex = sheet.length;

    return {
      success: true,
      data: {
        spreadsheetId,
        sheetName,
        values: rowValues,
        rowIndex
      }
    };
  }

  private resolveSpreadsheetId(parameters: Record<string, any>): string | null {
    const candidates = [
      parameters.spreadsheetId,
      parameters.sheetId,
      parameters.id,
      parameters.spreadsheetID
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim();
      }
    }

    return null;
  }

  private resolveSheetName(parameters: Record<string, any>): string | null {
    const candidates = [parameters.sheetName, parameters.sheet, parameters.tab];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim();
      }
    }

    const range = parameters.range || parameters.sheetRange;
    if (typeof range === 'string' && range.includes('!')) {
      return range.split('!')[0]?.trim() || null;
    }

    return 'Sheet1';
  }

  private normalizeRowValues(parameters: Record<string, any>): any[] {
    const valueCandidates = [parameters.values, parameters.row, parameters.rowValues];
    for (const candidate of valueCandidates) {
      if (candidate == null) continue;
      if (Array.isArray(candidate)) {
        if (candidate.length > 0 && Array.isArray(candidate[0])) {
          return candidate[0];
        }
        return candidate;
      }
      if (typeof candidate === 'object') {
        return Object.values(candidate);
      }
      return [candidate];
    }
    return [];
  }

  private getSheet(spreadsheetId: string, sheetName: string): any[][] {
    let sheets = this.spreadsheets.get(spreadsheetId);
    if (!sheets) {
      sheets = new Map();
      this.spreadsheets.set(spreadsheetId, sheets);
    }

    let rows = sheets.get(sheetName);
    if (!rows) {
      rows = [];
      sheets.set(sheetName, rows);
    }

    return rows;
  }
}

class TimeCoreClient extends BaseAPIClient {
  private readonly maxImmediateDelayMs = 60_000;

  constructor(credentials: APICredentials) {
    super('local://time', credentials);
  }

  protected getAuthHeaders(): Record<string, string> {
    return {};
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return {
      success: true,
      data: {
        mode: 'local',
        app: 'time'
      }
    };
  }

  public async execute(
    functionId: string,
    parameters: Record<string, any>
  ): Promise<APIResponse<any>> {
    switch (functionId) {
      case 'delay':
      case 'wait':
        return this.handleDelay(parameters);
      default:
        return {
          success: false,
          error: `Unknown Time function: ${functionId}`
        };
    }
  }

  private async handleDelay(parameters: Record<string, any>): Promise<APIResponse<any>> {
    const requestedDelay = this.calculateDelayMs(parameters);
    const delayMs = Math.max(0, requestedDelay);
    const executedDelay = Math.min(delayMs, this.maxImmediateDelayMs);

    if (executedDelay > 0) {
      await this.sleep(executedDelay);
    }

    return {
      success: true,
      data: {
        requestedDelayMs: delayMs,
        executedDelayMs: executedDelay,
        scheduledFor: delayMs > 0 ? new Date(Date.now() + delayMs).toISOString() : new Date().toISOString()
      }
    };
  }

  private calculateDelayMs(parameters: Record<string, any>): number {
    const readNumber = (value: unknown): number => {
      const num = Number(value);
      return Number.isFinite(num) ? num : 0;
    };

    let total = 0;
    total += readNumber(parameters.delayMs);
    total += readNumber(parameters.durationMs);
    total += readNumber(parameters.ms);

    const seconds =
      readNumber(parameters.delaySeconds) +
      readNumber(parameters.seconds) +
      readNumber(parameters.durationSeconds) +
      readNumber(parameters.sec);
    total += seconds * 1000;

    const minutes =
      readNumber(parameters.delayMinutes) +
      readNumber(parameters.minutes) +
      readNumber(parameters.durationMinutes) +
      readNumber(parameters.min);
    total += minutes * 60_000;

    const hours =
      readNumber(parameters.delayHours) +
      readNumber(parameters.hours) +
      readNumber(parameters.durationHours);
    total += hours * 3_600_000;

    const waitUntil = this.parseDate(parameters.waitUntil || parameters.until || parameters.resumeAt);
    if (waitUntil) {
      total = Math.max(total, waitUntil.getTime() - Date.now());
    }

    return total;
  }

  private parseDate(value: unknown): Date | null {
    if (typeof value === 'string' && value.trim()) {
      const timestamp = Date.parse(value);
      if (!Number.isNaN(timestamp)) {
        return new Date(timestamp);
      }
    }
    if (value instanceof Date) {
      return value;
    }
    return null;
  }
}

export interface IntegrationConfig {
  appName: string;
  credentials: APICredentials;
  additionalConfig?: Record<string, any>;
  connectionId?: string;
}

export interface FunctionExecutionParams {
  appName: string;
  functionId: string;
  parameters: Record<string, any>;
  credentials: APICredentials;
  additionalConfig?: Record<string, any>;
  connectionId?: string;
}

export interface FunctionExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
  executionTime?: number;
  appName: string;
  functionId: string;
}

export class IntegrationManager {
  private clients: Map<string, BaseAPIClient> = new Map();
  private supportedApps = new Set<string>([
    ...IMPLEMENTED_CONNECTOR_IDS,
    ...BUILDER_CORE_APP_IDS
  ]);

  private buildClientKey(appKey: string, connectionId?: string): string {
    return connectionId ? `${appKey}::${connectionId}` : appKey;
  }

  /**
   * Initialize integration for an application
   */
  public async initializeIntegration(config: IntegrationConfig): Promise<APIResponse<any>> {
    try {
      const appKey = config.appName.toLowerCase();
      const clientKey = this.buildClientKey(appKey, config.connectionId);

      if (!this.supportedApps.has(appKey)) {
        return {
          success: false,
          error: `Application ${config.appName} is not yet supported`
        };
      }

      const client = this.createAPIClient(appKey, config.credentials, config.additionalConfig);
      if (!client) {
        return {
          success: false,
          error: `Application ${config.appName} is not yet implemented`
        };
      }

      // Test the connection
      const testResult = await client.testConnection();
      if (!testResult.success) {
        return {
          success: false,
          error: `Connection test failed for ${config.appName}: ${testResult.error}`
        };
      }

      this.clients.set(clientKey, client);

      return {
        success: true,
        data: {
          appName: config.appName,
          status: 'connected',
          testResult: testResult.data
        }
      };

    } catch (error) {
      return {
        success: false,
        error: getErrorMessage(error)
      };
    }
  }

  /**
   * Execute a function on an integrated application
   */
  public async executeFunction(params: FunctionExecutionParams): Promise<FunctionExecutionResult> {
    const startTime = Date.now();
    const appKey = params.appName.toLowerCase();
    const clientKey = this.buildClientKey(appKey, params.connectionId);

    try {
      // Check if app is supported
      if (!this.supportedApps.has(appKey)) {
        return {
          success: false,
          error: `Application ${params.appName} is not supported`,
          appName: params.appName,
          functionId: params.functionId,
          executionTime: Date.now() - startTime
        };
      }

      // Get or create client
      let client = this.clients.get(clientKey);
      if (!client) {
        // Try to initialize the integration
        const initResult = await this.initializeIntegration({
          appName: params.appName,
          credentials: params.credentials,
          additionalConfig: params.additionalConfig,
          connectionId: params.connectionId
        });

        if (!initResult.success) {
          return {
            success: false,
            error: `Failed to initialize ${params.appName}: ${initResult.error}`,
            appName: params.appName,
            functionId: params.functionId,
            executionTime: Date.now() - startTime
          };
        }

        client = this.clients.get(clientKey);
      }

      if (!client) {
        return {
          success: false,
          error: `Application ${params.appName} is not yet implemented`,
          appName: params.appName,
          functionId: params.functionId,
          executionTime: Date.now() - startTime
        };
      }

      if (typeof client.updateCredentials === 'function') {
        client.updateCredentials(params.credentials);
      }

      // Execute the function
      const result = await this.executeFunctionOnClient(
        client,
        appKey,
        params.functionId,
        params.parameters
      );

      return {
        success: result.success,
        data: result.data,
        error: result.error,
        appName: params.appName,
        functionId: params.functionId,
        executionTime: Date.now() - startTime
      };

    } catch (error) {
      return {
        success: false,
        error: getErrorMessage(error),
        appName: params.appName,
        functionId: params.functionId,
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * Test connection for an application
   */
  public async testConnection(appName: string, credentials: APICredentials): Promise<APIResponse<any>> {
    const appKey = appName.toLowerCase();

    try {
      const client = this.createAPIClient(appKey, credentials);
      if (!client) {
        return {
          success: false,
          error: `Unsupported application: ${appName}`
        };
      }

      return await client.testConnection();

    } catch (error) {
      return {
        success: false,
        error: getErrorMessage(error)
      };
    }
  }

  /**
   * Get list of supported applications
   */
  public getSupportedApplications(): string[] {
    return Array.from(this.supportedApps);
  }

  /**
   * Check if an application is supported
   */
  public isApplicationSupported(appName: string): boolean {
    return this.supportedApps.has(appName.toLowerCase());
  }

  /**
   * Remove integration for an application
   */
  public removeIntegration(appName: string): boolean {
    const appKey = appName.toLowerCase();
    let removed = false;
    for (const key of Array.from(this.clients.keys())) {
      if (key === appKey || key.startsWith(`${appKey}::`)) {
        this.clients.delete(key);
        removed = true;
      }
    }
    return removed;
  }

  /**
   * Get integration status for an application
   */
  public getIntegrationStatus(appName: string): { connected: boolean; client?: BaseAPIClient } {
    const appKey = appName.toLowerCase();
    const client = this.clients.get(appKey) || Array.from(this.clients.entries())
      .find(([key]) => key.startsWith(`${appKey}::`))?.[1];

    return {
      connected: !!client,
      client
    };
  }

  // ===== PRIVATE METHODS =====

  /**
   * Create API client for specific application
   */
  private createAPIClient(
    appKey: string, 
    credentials: APICredentials, 
    additionalConfig?: Record<string, any>
  ): BaseAPIClient | null {
    switch (appKey) {
      case 'sheets':
        return new SheetsCoreClient(credentials);

      case 'time':
        return new TimeCoreClient(credentials);

      case 'gmail':
        return new GmailAPIClient(credentials);
      
      case 'shopify':
        if (!additionalConfig?.shopDomain) {
          throw new Error('Shopify integration requires shopDomain in additionalConfig');
        }
        return new ShopifyAPIClient({ ...credentials, shopDomain: additionalConfig.shopDomain });

      case 'slack': {
        const accessToken = credentials.accessToken ?? credentials.botToken;
        if (!accessToken) {
          throw new Error('Slack integration requires an access token');
        }
        return new SlackAPIClient({ ...credentials, accessToken });
      }

      case 'notion': {
        const accessToken = credentials.accessToken ?? credentials.integrationToken;
        if (!accessToken) {
          throw new Error('Notion integration requires an access token');
        }
        return new NotionAPIClient({ ...credentials, accessToken });
      }

      case 'airtable': {
        if (!credentials.apiKey) {
          throw new Error('Airtable integration requires an API key');
        }
        return new AirtableAPIClient(credentials);
      }
      
        // TODO: Add other API clients as they are implemented
        case 'stripe':
        case 'mailchimp':
        case 'twilio':
        case 'dropbox':
        case 'github':
        case 'trello':
        case 'asana':
        case 'hubspot':
        case 'salesforce':
        case 'zoom':
        // For now, return null for unimplemented clients
        // These will be implemented in subsequent iterations
        return null;
      
      default:
        return null;
    }
  }

  /**
   * Execute function on specific API client
   */
  private async executeFunctionOnClient(
    client: BaseAPIClient,
    appKey: string,
    functionId: string,
    parameters: Record<string, any>
  ): Promise<APIResponse<any>> {
    
    // Sheets functions
    if (appKey === 'sheets' && client instanceof SheetsCoreClient) {
      return client.execute(functionId, parameters);
    }

    // Time functions
    if (appKey === 'time' && client instanceof TimeCoreClient) {
      return client.execute(functionId, parameters);
    }

    // Gmail functions
    if (appKey === 'gmail' && client instanceof GmailAPIClient) {
      return this.executeGmailFunction(client, functionId, parameters);
    }

    // Shopify functions
    if (appKey === 'shopify' && client instanceof ShopifyAPIClient) {
      return this.executeShopifyFunction(client, functionId, parameters);
    }

    // Slack functions
    if (appKey === 'slack' && client instanceof SlackAPIClient) {
      return this.executeSlackFunction(client, functionId, parameters);
    }

    // Notion functions
    if (appKey === 'notion' && client instanceof NotionAPIClient) {
      return this.executeNotionFunction(client, functionId, parameters);
    }

    // Airtable functions
    if (appKey === 'airtable' && client instanceof AirtableAPIClient) {
      return this.executeAirtableFunction(client, functionId, parameters);
    }

    // TODO: Add other application function executions

    return {
      success: false,
      error: `Function ${functionId} not implemented for ${appKey}`
    };
  }

  /**
   * Execute Gmail-specific functions
   */
  private async executeGmailFunction(
    client: GmailAPIClient,
    functionId: string,
    parameters: Record<string, any>
  ): Promise<APIResponse<any>> {
    switch (functionId) {
      case 'send_email':
        return client.sendEmail(parameters);
      case 'reply_to_email':
        return client.replyToEmail(parameters);
      case 'forward_email':
        return client.forwardEmail(parameters);
      case 'search_emails':
        return client.searchEmails(parameters);
      case 'get_emails_by_label':
        return client.getEmailsByLabel(parameters);
      case 'get_unread_emails':
        return client.getUnreadEmails(parameters);
      case 'add_label':
        return client.addLabel(parameters);
      case 'remove_label':
        return client.removeLabel(parameters);
      case 'create_label':
        return client.createLabel(parameters);
      case 'mark_as_read':
        return client.markAsRead(parameters);
      case 'mark_as_unread':
        return client.markAsUnread(parameters);
      case 'archive_email':
        return client.archiveEmail(parameters);
      case 'delete_email':
        return client.deleteEmail(parameters);
      default:
        return {
          success: false,
          error: `Unknown Gmail function: ${functionId}`
        };
    }
  }

  /**
   * Execute Shopify-specific functions
   */
  private async executeShopifyFunction(
    client: ShopifyAPIClient,
    functionId: string,
    parameters: Record<string, any>
  ): Promise<APIResponse<any>> {
    switch (functionId) {
      case 'create_product':
        return client.createProduct(parameters);
      case 'update_product':
        return client.updateProduct(parameters);
      case 'get_products':
        return client.getProducts(parameters);
      case 'delete_product':
        return client.deleteProduct(parameters);
      case 'get_orders':
        return client.getOrders(parameters);
      case 'update_order':
        return client.updateOrder(parameters);
      case 'fulfill_order':
        return client.fulfillOrder(parameters);
      case 'create_customer':
        return client.createCustomer(parameters);
      case 'update_customer':
        return client.updateCustomer(parameters);
      case 'search_customers':
        return client.searchCustomers(parameters);
      case 'update_inventory':
        return client.updateInventory(parameters);
      default:
        return {
          success: false,
          error: `Unknown Shopify function: ${functionId}`
        };
    }
  }

  private async executeSlackFunction(
    client: SlackAPIClient,
    functionId: string,
    parameters: Record<string, any>
  ): Promise<APIResponse<any>> {
    switch (functionId) {
      case 'test_connection':
        return client.testConnection();
      case 'send_message':
        return client.sendMessage(parameters);
      case 'create_channel':
        return client.createChannel(parameters);
      case 'invite_to_channel': {
        const users = Array.isArray(parameters.users)
          ? parameters.users.join(',')
          : parameters.users;
        return client.inviteToChannel({ ...parameters, users });
      }
      case 'upload_file':
        return client.uploadFile(parameters);
      case 'get_channel_info':
        return client.getChannelInfo(parameters);
      case 'list_channels':
        return client.listChannels(parameters);
      case 'get_user_info':
        return client.getUserInfo(parameters);
      case 'list_users':
        return client.listUsers(parameters);
      case 'add_reaction':
        return client.addReaction(parameters);
      case 'remove_reaction':
        return client.removeReaction(parameters);
      case 'schedule_message':
        return client.scheduleMessage(parameters);
      default:
        return {
          success: false,
          error: `Unknown Slack function: ${functionId}`
        };
    }
  }

  private async executeNotionFunction(
    client: NotionAPIClient,
    functionId: string,
    parameters: Record<string, any>
  ): Promise<APIResponse<any>> {
    switch (functionId) {
      case 'test_connection':
        return client.testConnection();
      case 'create_page':
        return client.createPage(parameters);
      case 'update_page':
        return client.updatePage(parameters);
      case 'get_page':
        return client.getPage(parameters);
      case 'create_database_entry':
        return client.createDatabaseEntry(parameters);
      case 'query_database':
        return client.queryDatabase(parameters);
      case 'append_block_children':
        return client.appendBlockChildren(parameters);
      case 'update_block':
        return client.updateBlock(parameters);
      case 'get_block_children':
        return client.getBlockChildren(parameters);
      default:
        return {
          success: false,
          error: `Unknown Notion function: ${functionId}`
        };
    }
  }

  private async executeAirtableFunction(
    client: AirtableAPIClient,
    functionId: string,
    parameters: Record<string, any>
  ): Promise<APIResponse<any>> {
    switch (functionId) {
      case 'test_connection':
        return client.testConnection();
      case 'create_record':
        return client.createRecord(parameters);
      case 'update_record':
        return client.updateRecord(parameters);
      case 'get_record':
        return client.getRecord(parameters);
      case 'delete_record':
        return client.deleteRecord(parameters);
      case 'list_records':
        return client.listRecords(parameters);
      default:
        return {
          success: false,
          error: `Unknown Airtable function: ${functionId}`
        };
    }
  }

  // TODO: Add execution methods for other applications as they are implemented
}

// Export singleton instance
export const integrationManager = new IntegrationManager();