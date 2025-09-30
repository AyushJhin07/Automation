import { BaseAPIClient, APICredentials, APIResponse } from './BaseAPIClient';
import { genericExecutor } from './GenericExecutor';

/**
 * GenericConnectorClient bridges catalog-defined connectors to the runtime generic executor.
 * It allows us to provide end-to-end wiring for connectors that rely on declarative
 * HTTP definitions instead of bespoke TypeScript clients.
 */
export class GenericConnectorClient extends BaseAPIClient {
  public static readonly GENERIC_EXECUTOR_WRAPPER = true;
  private readonly appId: string;

  constructor(appId: string, credentials: APICredentials) {
    super('', credentials);
    this.appId = appId;
  }

  protected getAuthHeaders(): Record<string, string> {
    // Authentication is handled by GenericExecutor based on connector definition metadata.
    return {};
  }

  public override updateCredentials(credentials: APICredentials): void {
    super.updateCredentials(credentials);
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return genericExecutor.testConnection(this.appId, this.credentials);
  }

  public async execute(functionId: string, parameters: Record<string, any>): Promise<APIResponse<any>> {
    return genericExecutor.execute({
      appId: this.appId,
      functionId,
      parameters,
      credentials: this.credentials,
    });
  }

  public async executePaginated(
    functionId: string,
    parameters: Record<string, any>,
    options?: { maxPages?: number }
  ): Promise<APIResponse<any>> {
    return genericExecutor.executePaginated({
      appId: this.appId,
      functionId,
      parameters,
      credentials: this.credentials,
      maxPages: options?.maxPages,
    });
  }
}
