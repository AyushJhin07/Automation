/**
 * Minimal JSON schema representation used by the connector module contract.
 */
export type ConnectorJSONSchema = Record<string, any>;

/**
 * Supported authentication strategies for connector modules.
 */
export type ConnectorAuthType =
  | 'oauth2'
  | 'api_key'
  | 'basic'
  | 'bearer'
  | 'custom'
  | string;

export interface ConnectorAuthContract {
  type: ConnectorAuthType;
  /**
   * Optional JSON schema describing the expected authentication payload.
   */
  schema?: ConnectorJSONSchema;
  /**
   * Provider specific metadata (token URLs, scopes, header names, etc).
   */
  metadata?: Record<string, any>;
}

export type ConnectorOperationType = 'action' | 'trigger';

export interface ConnectorOperationContract {
  id: string;
  type: ConnectorOperationType;
  name?: string;
  description?: string;
  /**
   * JSON schema describing the expected input payload.
   */
  inputSchema?: ConnectorJSONSchema;
  /**
   * JSON schema describing the output payload when known.
   */
  outputSchema?: ConnectorJSONSchema;
  /**
   * Additional metadata surfaced to tooling (rate limits, categories, etc).
   */
  metadata?: Record<string, any>;
}

export interface ConnectorExecutionMetadata {
  executionId?: string;
  nodeId?: string;
  idempotencyKey?: string;
}

export interface ConnectorExecuteInput {
  operationId: string;
  /**
   * Operation specific payload supplied by workflow nodes or APIs.
   */
  input: Record<string, any>;
  /**
   * Raw credential payload. Consumers may choose to omit this when the
   * module instance is already bound to a specific credential set.
   */
  credentials?: Record<string, any>;
  /**
   * Optional connection level configuration (shop domain, region, etc).
   */
  additionalConfig?: Record<string, any>;
  connectionId?: string;
  metadata?: ConnectorExecutionMetadata;
}

export interface ConnectorExecuteOutput {
  success: boolean;
  data?: any;
  error?: string;
  meta?: Record<string, any>;
}

export interface ConnectorModule {
  id: string;
  name?: string;
  description?: string;
  auth: ConnectorAuthContract;
  /**
   * Top-level schema describing the connector level configuration payload.
   */
  inputSchema: ConnectorJSONSchema;
  operations: Record<string, ConnectorOperationContract>;
  execute(request: ConnectorExecuteInput): Promise<ConnectorExecuteOutput>;
}
