// INTEGRATION MANAGER - COORDINATES ALL API CLIENTS
// Provides unified interface for executing functions across all integrated applications

import { BaseAPIClient, APICredentials, APIResponse } from './BaseAPIClient';
import { AirtableAPIClient } from './AirtableAPIClient';
import { GmailAPIClient } from './GmailAPIClient';
import { NotionAPIClient } from './NotionAPIClient';
import { ShopifyAPIClient } from './ShopifyAPIClient';
import { SlackAPIClient } from './SlackAPIClient';
import { TwilioAPIClient } from './TwilioAPIClient';
import { SendGridAPIClient } from './SendGridAPIClient';
import { MailgunAPIClient } from './MailgunAPIClient';
import { IMPLEMENTED_CONNECTOR_IDS, getImplementedConnector } from './supportedApps';
import { LocalSheetsAPIClient, LocalTimeAPIClient } from './LocalCoreAPIClients';
import { getErrorMessage } from '../types/common';

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
  private supportedApps = new Set(IMPLEMENTED_CONNECTOR_IDS);

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
  public async testConnection(
    appName: string,
    credentials: APICredentials,
    additionalConfig?: Record<string, any>
  ): Promise<APIResponse<any>> {
    const appKey = appName.toLowerCase();

    try {
      const client = this.createAPIClient(appKey, credentials, additionalConfig);
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
    const implementation = getImplementedConnector(appKey);
    if (!implementation) {
      return null;
    }

    if (appKey === 'slack') {
      const accessToken = credentials.accessToken ?? credentials.botToken;
      if (!accessToken) {
        throw new Error('Slack integration requires an access token');
      }
      return new SlackAPIClient({ ...credentials, accessToken });
    }

    if (appKey === 'notion') {
      const accessToken = credentials.accessToken ?? credentials.integrationToken;
      if (!accessToken) {
        throw new Error('Notion integration requires an access token');
      }
      return new NotionAPIClient({ ...credentials, accessToken });
    }

    if (appKey === 'airtable') {
      if (!credentials.apiKey) {
        throw new Error('Airtable integration requires an API key');
      }
      return new AirtableAPIClient(credentials);
    }

    if (appKey === 'twilio') {
      const accountSid = credentials.accountSid ?? credentials.account_id;
      const authToken = credentials.authToken ?? credentials.apiKey;
      if (!accountSid || !authToken) {
        throw new Error('Twilio integration requires accountSid and authToken');
      }
      return implementation.createClient({ ...credentials, accountSid, authToken }, additionalConfig);
    }

    if (appKey === 'sendgrid') {
      const apiKey = credentials.apiKey ?? credentials.accessToken;
      if (!apiKey) {
        throw new Error('SendGrid integration requires an API key');
      }
      return implementation.createClient({ ...credentials, apiKey }, additionalConfig);
    }

    if (appKey === 'mailgun') {
      const apiKey = credentials.apiKey ?? credentials.accessToken;
      if (!apiKey) {
        throw new Error('Mailgun integration requires an API key');
      }
      return implementation.createClient({ ...credentials, apiKey }, additionalConfig);
    }

    return implementation.createClient(credentials, additionalConfig);
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

    if (appKey === 'twilio' && client instanceof TwilioAPIClient) {
      return this.executeTwilioFunction(client, functionId, parameters);
    }

    if (appKey === 'sendgrid' && client instanceof SendGridAPIClient) {
      return this.executeSendGridFunction(client, functionId, parameters);
    }

    if (appKey === 'mailgun' && client instanceof MailgunAPIClient) {
      return this.executeMailgunFunction(client, functionId, parameters);
    }

    // Sheets functions
    if (appKey === 'sheets' && client instanceof LocalSheetsAPIClient) {
      return this.executeSheetsFunction(client, functionId, parameters);
    }

    // Time utility functions
    if (appKey === 'time' && client instanceof LocalTimeAPIClient) {
      return this.executeTimeFunction(client, functionId, parameters);
    }

    // TODO: Add other application function executions

    return {
      success: false,
      error: `Function ${functionId} not implemented for ${appKey}`
    };
  }

  private async executeTwilioFunction(
    client: TwilioAPIClient,
    functionId: string,
    parameters: Record<string, any>
  ): Promise<APIResponse<any>> {
    switch (functionId) {
      case 'test_connection':
        return client.testConnection();
      case 'send_sms':
        return client.sendSms(parameters);
      case 'send_mms':
        return client.sendMms(parameters);
      case 'make_call':
        return client.makeCall(parameters);
      case 'get_message':
        return client.getMessage(parameters);
      case 'list_messages':
        return client.listMessages(parameters);
      case 'get_call':
        return client.getCall(parameters);
      case 'list_calls':
        return client.listCalls(parameters);
      case 'update_call':
        return client.updateCall(parameters);
      case 'buy_phone_number':
        return client.buyPhoneNumber(parameters);
      case 'list_phone_numbers':
        return client.listPhoneNumbers(parameters);
      default:
        return {
          success: false,
          error: `Unknown Twilio function: ${functionId}`
        };
    }
  }

  private async executeSendGridFunction(
    client: SendGridAPIClient,
    functionId: string,
    parameters: Record<string, any>
  ): Promise<APIResponse<any>> {
    switch (functionId) {
      case 'test_connection':
        return client.testConnection();
      case 'send_email':
        return client.sendEmail(parameters);
      case 'get_email_stats':
        return client.getEmailStats(parameters);
      case 'create_contact':
        return client.createContact(parameters);
      case 'get_lists':
        return client.getLists(parameters);
      case 'create_list':
        return client.createList(parameters);
      case 'send_test_email':
        return client.sendTestEmail(parameters);
      default:
        return {
          success: false,
          error: `Unknown SendGrid function: ${functionId}`
        };
    }
  }

  private async executeMailgunFunction(
    client: MailgunAPIClient,
    functionId: string,
    parameters: Record<string, any>
  ): Promise<APIResponse<any>> {
    switch (functionId) {
      case 'test_connection':
        return client.testConnection();
      case 'send_email':
        return client.sendEmail(parameters);
      case 'get_domain':
        return client.getDomain(parameters);
      case 'list_domains':
        return client.listDomains(parameters);
      case 'verify_domain':
        return client.verifyDomain(parameters);
      case 'create_mailing_list':
        return client.createMailingList(parameters);
      case 'get_mailing_list':
        return client.getMailingList(parameters);
      case 'list_mailing_lists':
        return client.listMailingLists(parameters);
      case 'add_member':
        return client.addMember(parameters);
      case 'get_member':
        return client.getMember(parameters);
      case 'validate_email':
        return client.validateEmail(parameters);
      case 'get_stats':
        return client.getStats(parameters);
      case 'get_events':
        return client.getEvents(parameters);
      default:
        return {
          success: false,
          error: `Unknown Mailgun function: ${functionId}`
        };
    }
  }

  private async executeSheetsFunction(
    client: LocalSheetsAPIClient,
    functionId: string,
    parameters: Record<string, any>
  ): Promise<APIResponse<any>> {
    switch (functionId) {
      case 'append_row':
      case 'appendrow':
      case 'appendrows':
        return client.appendRow(parameters);

      case 'test_connection':
        return client.testConnection();

      default:
        return {
          success: false,
          error: `Unknown Sheets function: ${functionId}`
        };
    }
  }

  private async executeTimeFunction(
    client: LocalTimeAPIClient,
    functionId: string,
    parameters: Record<string, any>
  ): Promise<APIResponse<any>> {
    switch (functionId) {
      case 'delay':
      case 'wait':
      case 'sleep':
        return client.delay(parameters);

      case 'test_connection':
        return client.testConnection();

      default:
        return {
          success: false,
          error: `Unknown Time function: ${functionId}`
        };
    }
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
