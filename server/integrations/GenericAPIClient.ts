// GENERIC API CLIENT - CONCRETE IMPLEMENTATION
// A concrete implementation of BaseAPIClient for apps with real Apps Script implementations
// but no specific client-side API integration needed

import { BaseAPIClient, APICredentials, APIResponse } from './BaseAPIClient';
import { genericExecutor } from './GenericExecutor';

/**
 * Lightweight API client that proxies execution through the GenericExecutor.
 *
 * Connectors that have high-fidelity JSON definitions but no bespoke client
 * registered can rely on this class so they participate in the same
 * IntegrationManager flows (connection testing, execution, etc.).
 */
export class GenericAPIClient extends BaseAPIClient {
  private readonly appId: string;

  constructor(appId: string, credentials: APICredentials = {}) {
    super('', credentials);
    this.appId = appId;
  }

  protected getAuthHeaders(): Record<string, string> {
    // Generic execution handles auth injection based on connector definition.
    return {};
  }

  public async testConnection(): Promise<APIResponse> {
    return genericExecutor.testConnection(this.appId, this.credentials);
  }

  public async execute(functionId: string, params: Record<string, any> = {}): Promise<APIResponse<any>> {
    return genericExecutor.execute({
      appId: this.appId,
      functionId,
      parameters: params,
      credentials: this.credentials,
    });
  }

  public async executePaginated(
    functionId: string,
    params: Record<string, any> = {},
    maxPages?: number
  ): Promise<APIResponse<any>> {
    return genericExecutor.executePaginated({
      appId: this.appId,
      functionId,
      parameters: params,
      credentials: this.credentials,
      maxPages,
    });
  }
}

