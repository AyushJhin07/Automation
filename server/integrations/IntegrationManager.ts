// INTEGRATION MANAGER - COORDINATES ALL API CLIENTS
// Provides unified interface for executing functions across all integrated applications

import { BaseAPIClient, APICredentials, APIResponse, DynamicOptionHandlerContext, DynamicOptionResult } from './BaseAPIClient';
import Ajv, { ValidateFunction } from 'ajv';
import { AirtableAPIClient } from './AirtableAPIClient';
import { GmailAPIClient } from './GmailAPIClient';
import { NotionAPIClient } from './NotionAPIClient';
import { ShopifyAPIClient } from './ShopifyAPIClient';
import { SlackAPIClient } from './SlackAPIClient';
import { getImplementedConnectorIds } from './supportedApps';
import { connectorRegistry } from '../ConnectorRegistry';
import { genericExecutor } from './GenericExecutor';
import { env } from '../env';
import { LocalSheetsAPIClient, LocalTimeAPIClient } from './LocalCoreAPIClients';
import { getErrorMessage } from '../types/common';
import { ConnectorSimulator } from '../testing/ConnectorSimulator';
import { connectorFramework } from '../connectors/ConnectorFramework';
import type { RateLimitRules } from './RateLimiter';
import type { ConnectorModule, ConnectorOperationContract, ConnectorJSONSchema } from '../../shared/connectors/module';

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
  executionId?: string;
  nodeId?: string;
  idempotencyKey?: string;
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
  private supportedApps = new Set(getImplementedConnectorIds());
  private simulator?: ConnectorSimulator;
  private connectorModules: Map<string, ConnectorModule> = new Map();
  private moduleValidators: Map<string, ValidateFunction> = new Map();
  private readonly moduleSchemaValidator = new Ajv({ allErrors: true, strict: false, coerceTypes: true });

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

      let moduleBuild: { module: ConnectorModule; rateLimits: RateLimitRules | null } | null = null;
      try {
        moduleBuild = await connectorFramework.buildConnectorModule({
          connectorId: appKey,
          client,
          definition,
        });
      } catch (frameworkError) {
        console.warn('[IntegrationManager] Failed to build connector module from framework:', frameworkError);
      }

      const rateLimitRules = moduleBuild?.rateLimits ?? this.normalizeRegistryRateLimits(definition?.rateLimits);

      client.setConnectorContext(appKey, config.connectionId, rateLimitRules);

      // Test the connection
      const testResult = await client.testConnection();
      if (!testResult.success) {
        return {
          success: false,
          error: `Connection test failed for ${config.appName}: ${testResult.error}`
        };
      }

      this.clients.set(clientKey, client);
      const module = moduleBuild?.module ?? this.createConnectorModule(appKey, client, definition);
      this.setConnectorModule(clientKey, module);

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

      const module = await this.getOrCreateConnectorModule(appKey, clientKey, client);
      const validation = this.validateModuleOperation(
        clientKey,
        module,
        params.functionId,
        params.parameters
      );

      if (!validation.valid) {
        return {
          success: false,
          error: validation.error,
          appName: params.appName,
          functionId: params.functionId,
          executionTime: Date.now() - startTime,
        };
      }

      const moduleResult = await module.execute({
        operationId: params.functionId,
        input: params.parameters,
        credentials: params.credentials,
        additionalConfig: params.additionalConfig,
        connectionId: params.connectionId,
        metadata: this.buildClientRequestContext(params),
      });

      if (!moduleResult.success) {
        if (
          env.GENERIC_EXECUTOR_ENABLED &&
          typeof moduleResult.error === 'string' &&
          moduleResult.error.startsWith('Function ')
        ) {
          const fallback = await genericExecutor.execute({
            appId: appKey,
            functionId: params.functionId,
            parameters: params.parameters,
            credentials: params.credentials,
          });
          return {
            success: fallback.success,
            data: fallback.data,
            error: fallback.error,
            appName: params.appName,
            functionId: params.functionId,
            executionTime: Date.now() - startTime,
          };
        }

        return {
          success: false,
          error: moduleResult.error,
          appName: params.appName,
          functionId: params.functionId,
          executionTime: Date.now() - startTime,
        };
      }

      return {
        success: true,
        data: moduleResult.data,
        error: moduleResult.error,
        appName: params.appName,
        functionId: params.functionId,
        executionTime: Date.now() - startTime,
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
        this.connectorModules.delete(key);
        this.purgeValidatorsForModule(key);
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

  private async getOrCreateConnectorModule(
    appKey: string,
    clientKey: string,
    client: BaseAPIClient,
  ): Promise<ConnectorModule> {
    const cached = this.connectorModules.get(clientKey);
    if (cached) {
      return cached;
    }

    const definition = connectorRegistry.getConnectorDefinition(appKey);
    let moduleBuild: { module: ConnectorModule; rateLimits: RateLimitRules | null } | null = null;

    try {
      moduleBuild = await connectorFramework.buildConnectorModule({
        connectorId: appKey,
        client,
        definition,
      });
    } catch (error) {
      console.warn('[IntegrationManager] Failed to build connector module:', error);
    }

    const module = moduleBuild?.module ?? this.createConnectorModule(appKey, client, definition);
    this.setConnectorModule(clientKey, module);
    return module;
  }

  private createConnectorModule(
    appKey: string,
    client: BaseAPIClient,
    definition?: any,
  ): ConnectorModule {
    const operations = this.buildOperationsFromDefinition(definition);
    const auth = definition?.authentication
      ? {
          type: definition.authentication.type ?? 'custom',
          metadata: definition.authentication.config ?? {},
        }
      : { type: 'custom' };

    const module = client.toConnectorModule({
      id: appKey,
      name: definition?.name ?? appKey,
      description: definition?.description,
      auth,
      inputSchema: this.buildModuleInputSchema(operations),
      operations,
      executor: async (input) => {
        const executeOnClient = () => client.execute(input.operationId, input.input ?? {});

        const context = input.metadata;
        const response = context
          ? await client.withRequestContext(context, executeOnClient)
          : await executeOnClient();

        return {
          success: response.success !== false,
          data: response.data,
          error: response.error,
          meta: {
            statusCode: response.statusCode,
            headers: response.headers,
          },
        };
      },
    });

    return module;
  }

  private buildOperationsFromDefinition(definition?: any): Record<string, ConnectorOperationContract> {
    const operations: Record<string, ConnectorOperationContract> = {};
    if (!definition) {
      return operations;
    }

    const addOperations = (items: any, type: ConnectorOperationContract['type']) => {
      if (!Array.isArray(items)) {
        return;
      }

      for (const item of items) {
        if (!item || typeof item !== 'object' || !item.id) {
          continue;
        }
        const id = String(item.id);
        operations[id] = {
          id,
          type,
          name: typeof item.name === 'string' ? item.name : undefined,
          description: typeof item.description === 'string' ? item.description : undefined,
          inputSchema: (item.parameters ?? item.requestSchema) as ConnectorJSONSchema | undefined,
          outputSchema: (item.responseSchema ?? item.outputSchema) as ConnectorJSONSchema | undefined,
          metadata: this.buildOperationMetadata(item),
        };
      }
    };

    addOperations(definition.actions, 'action');
    addOperations(definition.triggers, 'trigger');

    return operations;
  }

  private buildOperationMetadata(operation: any): Record<string, any> | undefined {
    if (!operation || typeof operation !== 'object') {
      return undefined;
    }

    const metadata: Record<string, any> = {};

    if (operation.endpoint) metadata.endpoint = operation.endpoint;
    if (operation.method) metadata.method = operation.method;
    if (operation.examples) metadata.examples = operation.examples;
    if (operation.rateLimits) metadata.rateLimits = operation.rateLimits;

    return Object.keys(metadata).length > 0 ? metadata : undefined;
  }

  private buildModuleInputSchema(
    operations: Record<string, ConnectorOperationContract>
  ): ConnectorJSONSchema {
    const operationIds = Object.keys(operations);
    return {
      type: 'object',
      properties: {
        operationId: operationIds.length
          ? { type: 'string', enum: operationIds }
          : { type: 'string' },
        parameters: { type: 'object', additionalProperties: true },
      },
      required: ['operationId', 'parameters'],
      additionalProperties: true,
    };
  }

  private setConnectorModule(clientKey: string, module: ConnectorModule): void {
    this.connectorModules.set(clientKey, module);
    this.purgeValidatorsForModule(clientKey);
  }

  private purgeValidatorsForModule(clientKey: string): void {
    for (const key of Array.from(this.moduleValidators.keys())) {
      if (key.startsWith(`${clientKey}::`)) {
        this.moduleValidators.delete(key);
      }
    }
  }

  private validateModuleOperation(
    clientKey: string,
    module: ConnectorModule,
    operationId: string,
    parameters: Record<string, any>,
  ): { valid: boolean; error?: string } {
    const op = module.operations[operationId]
      ?? module.operations[operationId?.toLowerCase?.() ?? ''];

    if (!op?.inputSchema || typeof op.inputSchema !== 'object') {
      return { valid: true };
    }

    const validatorKey = `${clientKey}::${op.id}`;
    let validator = this.moduleValidators.get(validatorKey);
    if (!validator) {
      try {
        validator = this.moduleSchemaValidator.compile(op.inputSchema);
        this.moduleValidators.set(validatorKey, validator);
      } catch (error) {
        console.warn(
          `[IntegrationManager] Failed to compile schema for ${validatorKey}:`,
          getErrorMessage(error)
        );
        return { valid: true };
      }
    }

    const payload = parameters ?? {};
    if (validator(payload)) {
      return { valid: true };
    }

    const issues = (validator.errors ?? [])
      .map(err => `${err.instancePath || '/'} ${err.message}`)
      .join('; ');

    return {
      valid: false,
      error: `Validation failed for ${op.id}: ${issues || 'unknown validation error'}`,
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

  private normalizeRegistryRateLimits(rateLimits?: any): RateLimitRules | null {
    if (!rateLimits) {
      return null;
    }

    const result: RateLimitRules = {};
    const secondCandidates: number[] = [];

    if (typeof rateLimits.requestsPerSecond === 'number' && rateLimits.requestsPerSecond > 0) {
      secondCandidates.push(rateLimits.requestsPerSecond);
    }

    if (typeof rateLimits.requestsPerMinute === 'number' && rateLimits.requestsPerMinute > 0) {
      result.requestsPerMinute = rateLimits.requestsPerMinute;
      secondCandidates.push(rateLimits.requestsPerMinute / 60);
    }

    if (typeof rateLimits.requestsPerHour === 'number' && rateLimits.requestsPerHour > 0) {
      secondCandidates.push(rateLimits.requestsPerHour / 3600);
    }

    const perDay = rateLimits.requestsPerDay ?? rateLimits.dailyLimit;
    if (typeof perDay === 'number' && perDay > 0) {
      secondCandidates.push(perDay / 86_400);
    }

    if (secondCandidates.length > 0) {
      result.requestsPerSecond = Math.min(...secondCandidates);
    }

    const burstCandidate = rateLimits.burst ?? rateLimits.burstLimit;
    if (typeof burstCandidate === 'number' && burstCandidate > 0) {
      result.burst = burstCandidate;
    }

    const concurrency = rateLimits.concurrency;
    if (concurrency) {
      const maxConcurrent =
        concurrency.maxConcurrent ?? concurrency.maxConcurrentRequests;
      if (typeof maxConcurrent === 'number' && maxConcurrent > 0) {
        result.concurrency = {
          maxConcurrent,
          scope: concurrency.scope ?? 'connection',
        };
      }
    }

    const headers = rateLimits.rateHeaders ?? rateLimits.headers;
    if (headers) {
      const hasHeaders = Object.values(headers).some(value =>
        Array.isArray(value) ? value.length > 0 : Boolean(value)
      );
      if (hasHeaders) {
        result.rateHeaders = { ...headers };
      }
    }

    return Object.keys(result).length > 0 ? result : null;
  }

  /**
   * Execute function on specific API client
   */
  private buildClientRequestContext(
    params: FunctionExecutionParams
  ): { executionId?: string; nodeId?: string; idempotencyKey?: string } | undefined {
    const executionId = params.executionId != null ? String(params.executionId).trim() : '';
    const nodeId = params.nodeId != null ? String(params.nodeId).trim() : '';
    const idempotencyKey = params.idempotencyKey != null ? String(params.idempotencyKey).trim() : '';

    if (!executionId && !nodeId && !idempotencyKey) {
      return undefined;
    }

    return {
      executionId: executionId || undefined,
      nodeId: nodeId || undefined,
      idempotencyKey: idempotencyKey || undefined,
    };
  }

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
