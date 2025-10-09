import type { GraphNode, NodeGraph } from '../../shared/nodeGraphSchema';
import {
  resolveRuntime,
  type RuntimeAvailability,
  type RuntimeIdentifier,
  type RuntimeResolutionIssue,
} from '../runtime/registry.js';

export interface OperationRuntimeDefinition {
  kind: 'action' | 'trigger';
  appId: string;
  operationId: string;
}

export interface NodeRuntimePlanEntry {
  nodeId: string;
  definition: OperationRuntimeDefinition;
  availability: RuntimeAvailability;
  runtime: RuntimeIdentifier | null;
  issues: RuntimeResolutionIssue[];
  nativeRuntimes: RuntimeIdentifier[];
  fallbackRuntimes: RuntimeIdentifier[];
  capability?: {
    appId: string;
    operationId: string;
    kind: 'action' | 'trigger';
    normalizedAppId: string;
    normalizedOperationId: string;
  };
}

export type WorkflowRuntimePlan = Record<string, NodeRuntimePlanEntry>;

const NODE_RUNTIME_PATTERN = /^(action|trigger)\.([^.]+)\.(.+)$/;

const normalizeOperationId = (value: string): string => value.trim();

const deriveOperationDefinition = (node: GraphNode): OperationRuntimeDefinition | null => {
  const nodeType = typeof node?.type === 'string' ? node.type : '';
  if (!nodeType) {
    return null;
  }

  const match = nodeType.match(NODE_RUNTIME_PATTERN);
  if (!match) {
    return null;
  }

  const [, categoryRaw, appFromType, operationFromType] = match;
  if (categoryRaw !== 'action' && categoryRaw !== 'trigger') {
    return null;
  }

  const operationCandidate =
    (typeof node?.op === 'string' && node.op.trim()) || operationFromType;

  const operationId = normalizeOperationId(operationCandidate);
  if (!operationId) {
    return null;
  }

  return {
    kind: categoryRaw,
    appId: appFromType,
    operationId,
  };
};

export const resolveNodeRuntimePlan = (node: GraphNode): NodeRuntimePlanEntry | null => {
  const definition = deriveOperationDefinition(node);
  if (!definition) {
    return null;
  }

  const resolution = resolveRuntime(definition);

  return {
    nodeId: node.id,
    definition,
    availability: resolution.availability,
    runtime: resolution.runtime,
    issues: resolution.issues,
    nativeRuntimes: resolution.nativeRuntimes,
    fallbackRuntimes: resolution.fallbackRuntimes,
    capability: resolution.capability
      ? {
          appId: resolution.capability.appId,
          operationId: resolution.capability.operationId,
          kind: resolution.capability.kind,
          normalizedAppId: resolution.capability.normalizedAppId,
          normalizedOperationId: resolution.capability.normalizedOperationId,
        }
      : undefined,
  };
};

export const planWorkflowRuntimeSelections = (graph: NodeGraph): WorkflowRuntimePlan => {
  const plan: WorkflowRuntimePlan = {};
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];

  for (const node of nodes) {
    const entry = resolveNodeRuntimePlan(node);
    if (!entry) {
      continue;
    }
    plan[node.id] = entry;
  }

  return plan;
};

