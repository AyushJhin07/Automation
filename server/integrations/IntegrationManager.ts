// INTEGRATION MANAGER - COORDINATES ALL API CLIENTS
// Provides unified interface for executing functions across all integrated applications

import { BaseAPIClient, APICredentials, APIResponse, DynamicOptionHandlerContext, DynamicOptionResult } from './BaseAPIClient';
import { AirtableAPIClient } from './AirtableAPIClient';
import { GmailAPIClient } from './GmailAPIClient';
import { NotionAPIClient } from './NotionAPIClient';
import { ShopifyAPIClient } from './ShopifyAPIClient';
import { SlackAPIClient } from './SlackAPIClient';
import { IMPLEMENTED_CONNECTOR_IDS } from './supportedApps';
import { connectorRegistry } from '../ConnectorRegistry';
import { genericExecutor } from './GenericExecutor';
import { env } from '../env';
import { LocalSheetsAPIClient, LocalTimeAPIClient } from './LocalCoreAPIClients';
import { getErrorMessage } from '../types/common';
import { ConnectorSimulator } from '../testing/ConnectorSimulator';

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

export interface DynamicOptionRequest {
  appName: string;
  handlerId: string;
  credentials: APICredentials;
  connectionId?: string;
  additionalConfig?: Record<string, any>;
  context?: DynamicOptionHandlerContext;
}

export interface IntegrationManagerOptions {
  simulator?: ConnectorSimulator | null;
  useSimulator?: boolean;
  simulatorFixturesDir?: string;
  simulatorStrict?: boolean;
}

export class IntegrationManager {
  private clients: Map<string, BaseAPIClient> = new Map();
  private supportedApps = new Set(IMPLEMENTED_CONNECTOR_IDS);
  private simulator?: ConnectorSimulator;

  constructor(options: IntegrationManagerOptions = {}) {
    const shouldUseSimulator = options.useSimulator ?? env.CONNECTOR_SIMULATOR_ENABLED;

    if (options.simulator) {
      this.simulator = options.simulator;
      if (shouldUseSimulator) {
        this.simulator.setEnabled(true);
      }
    } else if (shouldUseSimulator) {
      this.simulator = new ConnectorSimulator({
        fixturesDir: options.simulatorFixturesDir ?? env.CONNECTOR_SIMULATOR_FIXTURES_DIR,
        enabled: true,
        strict: options.simulatorStrict ?? false,
      });
    }
  }

  private buildClientKey(appKey: string, connectionId?: string): string {
    return connectionId ? `${appKey}::${connectionId}` : appKey;
  }

  private normalizeAppId(id: string): string {
    const v = String(id || '').toLowerCase();
    const map: Record<string, string> = {
      'google-sheets': 'sheets',
      'google-sheets-enhanced': 'sheets',
      'gmail-enhanced': 'gmail',
      'slack-enhanced': 'slack',
      'shopify-enhanced': 'shopify',
      'airtable-enhanced': 'airtable',
      'github-enhanced': 'github',
      'stripe-enhanced': 'stripe',
      'trello-enhanced': 'trello',
      'asana-enhanced': 'asana',
      'dropbox-enhanced': 'dropbox',
      'google-drive-enhanced': 'google-drive',
      'google-calendar-enhanced': 'google-calendar',
      'mailchimp-enhanced': 'mailchimp',
      'mailgun-enhanced': 'mailgun',
      'sendgrid-enhanced': 'sendgrid',
      'zendesk-enhanced': 'zendesk',
      'pipedrive-enhanced': 'pipedrive',
      'twilio-enhanced': 'twilio',
      'hubspot-enhanced': 'hubspot',
      'salesforce-enhanced': 'salesforce',
      'bigcommerce-enhanced': 'bigcommerce',
      'magento-enhanced': 'magento',
      'woocommerce-enhanced': 'woocommerce',
      'square-enhanced': 'square',
      'jira-service-management': 'jira',
      'jira-cloud': 'jira',
      'box': 'box',
      'box-enhanced': 'box',
      'onedrive': 'onedrive',
      'onedrive-enhanced': 'onedrive',
      'sharepoint': 'sharepoint',
      'sharepoint-enhanced': 'sharepoint',
      'smartsheet': 'smartsheet',
      'smartsheet-enhanced': 'smartsheet',
      'google-docs': 'google-docs',
      'google-docs-enhanced': 'google-docs',
      'google-slides': 'google-slides',
      'google-slides-enhanced': 'google-slides',
      'google-forms': 'google-forms',
      'google-forms-enhanced': 'google-forms',
      'googleadmin': 'google-admin',
      'google-admin-console': 'google-admin',
      'google-workspace-admin': 'google-admin',
      'googleworkspaceadmin': 'google-admin',
      'microsoft-teams': 'microsoft-teams',
      'microsoft-teams-enhanced': 'microsoft-teams',
      'outlook': 'outlook',
      'outlook-enhanced': 'outlook',
      'google-chat': 'google-chat',
      'google-chat-enhanced': 'google-chat',
      'zoom': 'zoom',
      'zoom-enhanced': 'zoom',
      'calendly': 'calendly',
      'calendly-enhanced': 'calendly',
      'intercom': 'intercom',
      'intercom-enhanced': 'intercom',
      'okta-preview': 'okta',
      'okta-dev': 'okta',
      'oktadev': 'okta',
      'monday': 'monday',
      'monday-enhanced': 'monday',
      'servicenow': 'servicenow',
      'servicenow-enhanced': 'servicenow',
      'freshdesk': 'freshdesk',
      'freshdesk-enhanced': 'freshdesk',
      'gitlab': 'gitlab',
      'gitlab-enhanced': 'gitlab',
      'bitbucket': 'bitbucket',
      'bitbucket-enhanced': 'bitbucket',
      'confluence': 'confluence',
      'confluence-enhanced': 'confluence',
      'jira-service-management-enhanced': 'jira-service-management',
      'azure_devops': 'azure-devops',
      'azuredevops': 'azure-devops',
      'circle-ci': 'circleci',
      'circle_ci': 'circleci',
      'jenkins-ci': 'jenkins',
      'jenkins_ci': 'jenkins',
      'k8s': 'kubernetes',
      'kube': 'kubernetes',
      'kubernetes-cluster': 'kubernetes',
      'argo': 'argocd',
      'argo-cd': 'argocd',
      'argo_cd': 'argocd',
      'terraform': 'terraform-cloud',
      'terraformcloud': 'terraform-cloud',
      'terraform_cloud': 'terraform-cloud',
      'hashicorp': 'hashicorp-vault',
      'vault': 'hashicorp-vault',
      'helmfile': 'helm',
      'ansible-tower': 'ansible',
      'awx': 'ansible',
      'cloudformation': 'aws-cloudformation',
      'aws_cloudformation': 'aws-cloudformation',
      'awscloudformation': 'aws-cloudformation',
      'codepipeline': 'aws-codepipeline',
      'aws_codepipeline': 'aws-codepipeline',
      'aws-code-pipeline': 'aws-codepipeline',
      'datadoghq': 'datadog',
      'datadog-us': 'datadog',
      'datadog_eu': 'datadog',
      'grafana-cloud': 'grafana',
      'grafana_enterprise': 'grafana',
      'prometheus-stack': 'prometheus',
      'prometheus_server': 'prometheus',
      'new-relic': 'newrelic',
      'newrelic-one': 'newrelic',
      'sentry-onprem': 'sentry',
      'sentry_self_hosted': 'sentry',
      'docu-sign': 'docusign',
      'dropbox-sign': 'hellosign',
      'dropboxsign': 'hellosign',
      'adobe-sign': 'adobesign',
      'acrobat-sign': 'adobesign',
      'acrobat-signature': 'adobesign',
      'egnyte-connect': 'egnyte',
      'egnyte-content': 'egnyte',
    };
    return map[v] || v;
  }

  /**
   * Initialize integration for an application
   */
  public async initializeIntegration(config: IntegrationConfig): Promise<APIResponse<any>> {
    try {
      const appKey = this.normalizeAppId(config.appName);
      const clientKey = this.buildClientKey(appKey, config.connectionId);

      if (this.simulator?.isEnabled()) {
        const simulated = await this.simulator.initializeIntegration(appKey, config);
        if (simulated) {
          return simulated;
        }
      }

      if (!this.supportedApps.has(appKey)) {
        if (env.GENERIC_EXECUTOR_ENABLED) {
          // Try a generic test connection; if passes, mark as connected in memory-less mode
          const result = await genericExecutor.testConnection(appKey, config.credentials);
          return result.success
            ? { success: true, data: { appName: config.appName, status: 'connected', testResult: result.data } }
            : { success: false, error: `Connection test failed for ${config.appName}: ${result.error}` };
        }
        return {
          success: false,
          error: `Application ${config.appName} is not yet supported`
        };
      }

      const definition = connectorRegistry.getConnectorDefinition(appKey);
      const client = this.createAPIClient(appKey, config.credentials, config.additionalConfig);
      if (!client) {
        return {
          success: false,
          error: `Application ${config.appName} is not yet implemented`
        };
      }

      client.setConnectorContext(appKey, config.connectionId, definition?.rateLimits);

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
    const appKey = this.normalizeAppId(params.appName);
    const clientKey = this.buildClientKey(appKey, params.connectionId);

    try {
      if (this.simulator?.isEnabled()) {
        const simulated = await this.simulator.executeFunction({
          appName: params.appName,
          appKey,
          functionId: params.functionId,
          parameters: params.parameters,
        });

        if (simulated) {
          return {
            success: simulated.success,
            data: simulated.data,
            error: simulated.error,
            appName: params.appName,
            functionId: params.functionId,
            executionTime: Date.now() - startTime,
          };
        }
      }

      // Check if app is supported; if not, try generic executor when enabled
      if (!this.supportedApps.has(appKey)) {
        if (env.GENERIC_EXECUTOR_ENABLED) {
          const genericResult = await genericExecutor.execute({
            appId: appKey,
            functionId: params.functionId,
            parameters: params.parameters,
            credentials: params.credentials,
          });
          return {
            success: genericResult.success,
            data: genericResult.data,
            error: genericResult.error,
            appName: params.appName,
            functionId: params.functionId,
            executionTime: Date.now() - startTime
          };
        }
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
        // Fallback to generic executor if enabled
        if (env.GENERIC_EXECUTOR_ENABLED) {
          const genericResult = await genericExecutor.execute({
            appId: appKey,
            functionId: params.functionId,
            parameters: params.parameters,
            credentials: params.credentials,
          });
          return {
            success: genericResult.success,
            data: genericResult.data,
            error: genericResult.error,
            appName: params.appName,
            functionId: params.functionId,
            executionTime: Date.now() - startTime
          };
        }
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
    const appKey = this.normalizeAppId(appName);

    try {
      if (this.simulator?.isEnabled()) {
        const simulated = await this.simulator.initializeIntegration(appKey, {
          appName,
          credentials,
        });
        if (simulated) {
          return simulated;
        }
      }

      const client = this.createAPIClient(appKey, credentials);
      if (client) {
        return await client.testConnection();
      }
      if (env.GENERIC_EXECUTOR_ENABLED) {
        return await genericExecutor.testConnection(appKey, credentials);
      }
      return { success: false, error: `Unsupported application: ${appName}` };

    } catch (error) {
      return {
        success: false,
        error: getErrorMessage(error)
      };
    }
  }

  public async getDynamicOptions(request: DynamicOptionRequest): Promise<DynamicOptionResult> {
    const appKey = this.normalizeAppId(request.appName);
    const clientKey = this.buildClientKey(appKey, request.connectionId);

    try {
      if (!this.supportedApps.has(appKey)) {
        return {
          success: false,
          options: [],
          error: `Application ${request.appName} does not support dynamic options`,
        };
      }

      let client = this.clients.get(clientKey);
      if (!client) {
        const initResult = await this.initializeIntegration({
          appName: request.appName,
          credentials: request.credentials,
          additionalConfig: request.additionalConfig,
          connectionId: request.connectionId,
        });

        if (!initResult.success) {
          return {
            success: false,
            options: [],
            error: `Failed to initialize ${request.appName}: ${initResult.error}`,
          };
        }

        client = this.clients.get(clientKey);
      }

      if (!client) {
        return {
          success: false,
          options: [],
          error: `Application ${request.appName} is not yet implemented`,
        };
      }

      if (typeof client.updateCredentials === 'function') {
        client.updateCredentials(request.credentials);
      }

      const dynamicGetter = (client as any).getDynamicOptions as
        | ((handlerId: string, context?: DynamicOptionHandlerContext) => Promise<DynamicOptionResult>)
        | undefined;

      if (typeof dynamicGetter !== 'function') {
        return {
          success: false,
          options: [],
          error: `Dynamic options not supported for ${request.appName}`,
        };
      }

      const result = await dynamicGetter.call(client, request.handlerId, request.context ?? {});
      if (!result || typeof result !== 'object') {
        return {
          success: false,
          options: [],
          error: `Dynamic option handler ${request.handlerId} returned an invalid result`,
        };
      }

      return {
        success: result.success !== false,
        options: Array.isArray(result.options) ? result.options : [],
        nextCursor: result.nextCursor ?? undefined,
        totalCount: result.totalCount ?? undefined,
        error: result.success === false ? (result.error || `Dynamic option handler ${request.handlerId} failed`) : result.error,
        raw: result.raw,
      };
    } catch (error) {
      return {
        success: false,
        options: [],
        error: getErrorMessage(error),
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
    return this.supportedApps.has(this.normalizeAppId(appName));
  }

  /**
   * Remove integration for an application
   */
  public removeIntegration(appName: string): boolean {
    const appKey = this.normalizeAppId(appName);
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
    const appKey = this.normalizeAppId(appName);
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
    const enrichedCredentials: APICredentials = { ...credentials };
    (enrichedCredentials as Record<string, any>).__connectorId = appKey;

    switch (appKey) {
      case 'gmail':
        return new GmailAPIClient(enrichedCredentials);

      case 'shopify':
        if (!additionalConfig?.shopDomain) {
          throw new Error('Shopify integration requires shopDomain in additionalConfig');
        }
        return new ShopifyAPIClient({ ...enrichedCredentials, shopDomain: additionalConfig.shopDomain });

      case 'slack': {
        const accessToken = enrichedCredentials.accessToken ?? enrichedCredentials.botToken;
        if (!accessToken) {
          throw new Error('Slack integration requires an access token');
        }
        return new SlackAPIClient({ ...enrichedCredentials, accessToken });
      }

      case 'notion': {
        const accessToken = enrichedCredentials.accessToken ?? enrichedCredentials.integrationToken;
        if (!accessToken) {
          throw new Error('Notion integration requires an access token');
        }
        return new NotionAPIClient({ ...enrichedCredentials, accessToken });
      }

      case 'airtable': {
        if (!enrichedCredentials.apiKey) {
          throw new Error('Airtable integration requires an API key');
        }
        return new AirtableAPIClient(enrichedCredentials);
      }

      case 'sheets':
        return new LocalSheetsAPIClient(enrichedCredentials);

      case 'time':
        return new LocalTimeAPIClient(enrichedCredentials);

      default:
        break;
    }

    // Registry-backed client constructor fallback
    try {
      const ctor = connectorRegistry.getAPIClient(appKey);
      if (ctor) {
        const config = { ...enrichedCredentials, ...(additionalConfig ?? {}) };
        return new ctor(config as any);
      }
    } catch {
      // ignore
    }
    return null;
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
    // Try generic client-side execution first if available
    const maybeExec = (client as any).execute as (id: string, params: any) => Promise<APIResponse<any>>;
    if (typeof maybeExec === 'function') {
      try {
        const genericResult = await maybeExec.call(client, functionId, parameters);
        if (genericResult && genericResult.success !== undefined) {
          // Fallback only when the handler is unknown; otherwise honor generic result
          if (!(genericResult.success === false && typeof genericResult.error === 'string' && genericResult.error.startsWith('Unknown function handler:'))) {
            return genericResult;
          }
        }
      } catch (_err) {
        // ignore and fall through to specific app handlers
      }
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
export const integrationManager = new IntegrationManager({
  useSimulator: env.CONNECTOR_SIMULATOR_ENABLED,
  simulatorFixturesDir: env.CONNECTOR_SIMULATOR_FIXTURES_DIR,
});

// Convenience method for routes needing an API client instance
export type { BaseAPIClient } from './BaseAPIClient';
export interface APIClientProvider {
  getAPIClient: (appName: string, credentials?: APICredentials, additionalConfig?: Record<string, any>) => BaseAPIClient | undefined;
}

// Backwards-compatible instance method for direct API client access
(IntegrationManager as any).prototype.getAPIClient = function(this: IntegrationManager, appName: string, credentials?: APICredentials, additionalConfig?: Record<string, any>) {
  const appKey = (this as any).normalizeAppId(appName);
  const existing = (this as any).clients.get(appKey) || Array.from((this as any).clients.entries()).find(([k]: any[]) => k.startsWith(`${appKey}::`))?.[1];
  if (existing) return existing;
  if (!credentials) return undefined;
  return (this as any).createAPIClient(appKey, credentials, additionalConfig) ?? undefined;
};
