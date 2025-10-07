import type { ValidationError } from '@shared/nodeGraphSchema';

type NodeLike = {
  id: string | number;
  type?: string | null;
  data?: Record<string, any> | null;
};

type Options = {
  nodeRequiresConnection?: (node: NodeLike) => boolean;
};

const normalizeType = (node: NodeLike): string => {
  const data = node.data || {};
  const candidates: Array<unknown> = [
    node.type,
    data.nodeType,
    data.type,
    data.role,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.toLowerCase();
    }
  }
  return '';
};

const isTriggerNode = (node: NodeLike): boolean => {
  const type = normalizeType(node);
  return type.includes('trigger');
};

const isTransformNode = (node: NodeLike): boolean => {
  const type = normalizeType(node);
  return type.includes('transform') || type.includes('condition');
};

const collectFirstString = (candidates: Array<unknown>): string | undefined => {
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
};

export const collectNodeConfigurationErrors = (
  nodes: NodeLike[],
  options: Options = {}
): ValidationError[] => {
  const results: ValidationError[] = [];
  const requiresConnection = options.nodeRequiresConnection;

  nodes.forEach((node) => {
    const data = node.data || {};
    const nodeId = String(node.id);
    const isTrigger = isTriggerNode(node);
    const isTransform = isTransformNode(node);

    const connector = collectFirstString([
      data.app,
      data.application,
      data.appId,
      data.appName,
      data.connector,
      data.connectorId,
      data.integrationId,
      data.provider,
      data.service,
    ]);

    const functionId = collectFirstString([
      data.function,
      data.operation,
      data.selectedFunction,
      data.workflowFunctionId,
      data.actionId,
      data.triggerId,
    ]);

    const hasInlineCredentials = Boolean(data.credentials);
    const hasConnectionId = Boolean(
      data.connectionId ||
      data.auth?.connectionId ||
      data.params?.connectionId ||
      data.parameters?.connectionId
    );

    const nodeLabel = collectFirstString([
      data.label,
      data.name,
      connector,
      node.type,
      nodeId,
    ]) ?? nodeId;

    if (!isTrigger && !isTransform && !connector) {
      results.push({
        nodeId,
        path: `/nodes/${nodeId}/metadata/connector`,
        message: `Select a connector for "${nodeLabel}" before running.`,
        severity: 'error',
      });
    }

    if (!isTrigger && !functionId) {
      results.push({
        nodeId,
        path: `/nodes/${nodeId}/metadata/function`,
        message: `Choose an action for "${nodeLabel}" before running.`,
        severity: 'error',
      });
    }

    if (
      typeof requiresConnection === 'function'
        ? requiresConnection(node)
        : !isTrigger && !isTransform && !hasInlineCredentials && !hasConnectionId
    ) {
      results.push({
        nodeId,
        path: `/nodes/${nodeId}/metadata/connection`,
        message: `Connect an account for "${nodeLabel}" before running.`,
        severity: 'error',
      });
    }
  });

  return results;
};

