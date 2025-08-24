// INTEGRATION MANAGER - COORDINATES ALL API CLIENTS
// Provides unified interface for executing functions across all integrated applications

import { BaseAPIClient, APICredentials, APIResponse } from './BaseAPIClient';
import { GmailAPIClient } from './GmailAPIClient';
import { ShopifyAPIClient } from './ShopifyAPIClient';
import { getErrorMessage } from '../types/common';

export interface IntegrationConfig {
  appName: string;
  credentials: APICredentials;
  additionalConfig?: Record<string, any>;
}

export interface FunctionExecutionParams {
  appName: string;
  functionId: string;
  parameters: Record<string, any>;
  credentials: APICredentials;
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
  private supportedApps = new Set([
    'gmail',
    'shopify',
    'stripe',
    'mailchimp',
    'twilio',
    'airtable',
    'dropbox',
    'github',
    'slack',
    'notion',
    'trello',
    'asana',
    'hubspot',
    'salesforce',
    'zoom'
  ]);

  /**
   * Initialize integration for an application
   */
  public async initializeIntegration(config: IntegrationConfig): Promise<APIResponse<any>> {
    try {
      const appKey = config.appName.toLowerCase();
      
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
          error: `Failed to create API client for ${config.appName}`
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

      this.clients.set(appKey, client);

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
      let client = this.clients.get(appKey);
      if (!client) {
        // Try to initialize the integration
        const initResult = await this.initializeIntegration({
          appName: params.appName,
          credentials: params.credentials
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

        client = this.clients.get(appKey);
      }

      if (!client) {
        return {
          success: false,
          error: `No client available for ${params.appName}`,
          appName: params.appName,
          functionId: params.functionId,
          executionTime: Date.now() - startTime
        };
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
    return this.clients.delete(appKey);
  }

  /**
   * Get integration status for an application
   */
  public getIntegrationStatus(appName: string): { connected: boolean; client?: BaseAPIClient } {
    const appKey = appName.toLowerCase();
    const client = this.clients.get(appKey);
    
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
      case 'gmail':
        return new GmailAPIClient(credentials);
      
      case 'shopify':
        if (!additionalConfig?.shopDomain) {
          throw new Error('Shopify integration requires shopDomain in additionalConfig');
        }
        return new ShopifyAPIClient({ ...credentials, shopDomain: additionalConfig.shopDomain });
      
      // TODO: Add other API clients as they are implemented
      case 'stripe':
      case 'mailchimp':
      case 'twilio':
      case 'airtable':
      case 'dropbox':
      case 'github':
      case 'slack':
      case 'notion':
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
    
    // Gmail functions
    if (appKey === 'gmail' && client instanceof GmailAPIClient) {
      return this.executeGmailFunction(client, functionId, parameters);
    }
    
    // Shopify functions
    if (appKey === 'shopify' && client instanceof ShopifyAPIClient) {
      return this.executeShopifyFunction(client, functionId, parameters);
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

  // TODO: Add execution methods for other applications as they are implemented
}

// Export singleton instance
export const integrationManager = new IntegrationManager();