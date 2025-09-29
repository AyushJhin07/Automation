import { buildMetadataFromNode } from './metadata';
import { syncNodeParameters } from './SmartParametersPanel';

export type NodeRole = 'trigger' | 'action' | 'transform' | 'condition';

export type NormalizedWorkflowNode = {
  id: string;
  role: NodeRole;
  app: string;
  operation: string;
  position: { x: number; y: number };
  data: Record<string, any>;
};

type NormalizeOptions = {
  index?: number;
  loadSource?: string | null;
};

type NodeLike = {
  id?: string | number;
  role?: string;
  type?: string;
  nodeType?: string;
  op?: string;
  app?: string;
  function?: string;
  functionName?: string;
  operation?: string;
  connectorId?: string;
  actionId?: string;
  position?: { x?: number | string; y?: number | string } | null;
  params?: Record<string, any> | null;
  parameters?: Record<string, any> | null;
  config?: Record<string, any> | null;
  metadata?: Record<string, any> | null;
  outputMetadata?: Record<string, any> | null;
  icon?: string;
  color?: string;
  aiReason?: string;
  loadSource?: string;
  data?: Record<string, any> | null;
  [key: string]: any;
};

const roleFromString = (value?: string | null): NodeRole | null => {
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (normalized.includes('trigger')) return 'trigger';
  if (normalized.includes('transform')) return 'transform';
  if (normalized.includes('condition')) return 'condition';
  if (normalized.includes('action')) return 'action';
  return null;
};

export const inferNodeRole = (node: NodeLike): NodeRole => {
  const candidates = [
    node.role,
    node.type,
    node.nodeType,
    node.data?.nodeType,
    typeof node.op === 'string' ? node.op.split(':')[0] : undefined,
    typeof node.op === 'string' ? node.op.split('.')[0] : undefined,
  ];

  for (const candidate of candidates) {
    const role = roleFromString(candidate);
    if (role) return role;
  }

  return 'action';
};

const parseAppFromComposite = (value?: string | null): string | null => {
  if (!value) return null;
  const normalized = value.toLowerCase();
  const segments = normalized
    .split(/[\s:]/)
    .flatMap((chunk) => chunk.split('.'))
    .filter(Boolean);
  if (segments.length < 2) {
    return segments.length === 1 ? segments[0] : null;
  }
  return segments[1];
};

const selectString = (...values: Array<string | null | undefined>): string | undefined => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
};

const mergeRecords = (
  ...sources: Array<Record<string, any> | null | undefined>
): Record<string, any> => {
  return sources.reduce<Record<string, any>>((acc, source) => {
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      return acc;
    }
    return { ...acc, ...source };
  }, {});
};

const mergeParams = (...sources: Array<Record<string, any> | null | undefined>): Record<string, any> => {
  const result: Record<string, any> = {};
  sources.forEach((source) => {
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      return;
    }
    Object.entries(source).forEach(([key, value]) => {
      result[key] = value;
    });
  });
  return result;
};

const toNumber = (value: unknown, fallback: number): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const DEFAULT_POSITION = (index: number) => ({
  x: 100 + (index % 6) * 260,
  y: 120 + Math.floor(index / 6) * 180,
});

export const normalizeWorkflowNode = (
  node: NodeLike,
  options: NormalizeOptions = {}
): NormalizedWorkflowNode => {
  const index = options.index ?? 0;
  const role = inferNodeRole(node);

  const compositeType = selectString(node.type, node.nodeType, node.data?.nodeType, node.op);

  const app = selectString(
    node.app,
    node.data?.app,
    node.connectorId,
    node.data?.connectorId,
    parseAppFromComposite(compositeType),
    parseAppFromComposite(node.op)
  ) || 'core';

  const operation = selectString(
    node.function,
    node.functionName,
    node.operation,
    node.data?.function,
    node.data?.operation,
    node.actionId,
    node.data?.actionId,
    typeof node.op === 'string' ? node.op.split(':')[1] : undefined
  ) || 'run';

  const params = mergeParams(
    node.data?.config,
    node.config,
    node.params,
    node.parameters,
    node.data?.params,
    node.data?.parameters
  );

  const existingData = (node.data && typeof node.data === 'object' && !Array.isArray(node.data))
    ? { ...node.data }
    : {};

  const label = selectString(existingData.label, node.label, node.name, `${app}.${operation}`) || 'Step';
  const description = selectString(existingData.description, node.description, node.aiReason, '') || '';

  const nodeType = selectString(
    existingData.nodeType,
    node.nodeType,
    node.type,
    `${role}.${app}`
  );

  const paramColumns = Object.keys(params).filter((key) => typeof key === 'string' && key.trim().length > 0);
  const metadataSeed = paramColumns.length ? { columns: paramColumns } : undefined;

  const baseData = {
    ...existingData,
    label,
    description,
    app,
    function: operation,
    operation,
    nodeType,
    type: nodeType,
    role,
    connectorId: selectString(existingData.connectorId, node.connectorId, app) || app,
    actionId: selectString(existingData.actionId, node.actionId, operation) || operation,
    icon: existingData.icon ?? node.icon,
    color: existingData.color ?? node.color,
    loadSource: options.loadSource ?? node.loadSource ?? existingData.loadSource,
    metadata: mergeRecords(metadataSeed, node.metadata, existingData.metadata),
    outputMetadata: mergeRecords(metadataSeed, node.outputMetadata, existingData.outputMetadata),
    op: node.op ?? existingData.op ?? `${role}.${app}:${operation}`,
    displayName: existingData.displayName ?? node.displayName,
  };

  const dataWithParams = syncNodeParameters(baseData, params);

  const metadataSource = {
    ...node,
    data: dataWithParams,
    params,
    parameters: params,
  };

  const derivedMetadata = buildMetadataFromNode(metadataSource);
  dataWithParams.metadata = mergeRecords(baseData.metadata, derivedMetadata);
  dataWithParams.outputMetadata = mergeRecords(baseData.outputMetadata, derivedMetadata);

  const position = node.position || null;
  const normalizedPosition = position && typeof position === 'object'
    ? {
        x: toNumber((position as any).x, DEFAULT_POSITION(index).x),
        y: toNumber((position as any).y, DEFAULT_POSITION(index).y),
      }
    : DEFAULT_POSITION(index);

  return {
    id: String(node.id ?? `node_${index}`),
    role,
    app,
    operation,
    position: normalizedPosition,
    data: dataWithParams,
  };
};
