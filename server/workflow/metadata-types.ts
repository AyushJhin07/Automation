import type { WorkflowNode, WorkflowNodeMetadata } from '../../common/workflow-types';

export type ConnectorOperationDefinition = {
  id?: string;
  name?: string;
  title?: string;
  parameters?: { properties?: Record<string, any> };
};

export type ConnectorDefinition = {
  id?: string;
  name?: string;
  actions?: ConnectorOperationDefinition[];
  triggers?: ConnectorOperationDefinition[];
};

export type MetadataSource = Partial<WorkflowNodeMetadata> | null | undefined;

export type MetadataResolverAuth = Record<string, unknown>;

export type MetadataResolverAuthProvider =
  | MetadataResolverAuth
  | ((connectorId: string) => MetadataResolverAuth | undefined)
  | undefined;

export type EnrichContext = {
  answers?: Record<string, any>;
  auth?: MetadataResolverAuthProvider;
};

export type ResolverInvocationContext = {
  node: Partial<WorkflowNode>;
  params: Record<string, any>;
  connector?: ConnectorDefinition;
  operationId?: string;
  nodeType?: string;
  existingMetadata: WorkflowNodeMetadata;
  context: EnrichContext;
};
