import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  canonicalizeMetadataKey,
  mergeWorkflowMetadata,
  type WorkflowMetadata,
} from '@shared/workflow/metadata';
import type { WorkflowGraph, WorkflowNode } from '../../common/workflow-types';
import {
  resolveConnectorMetadata,
  type ConnectorDefinition,
} from './metadata-resolvers';

export type { WorkflowMetadata as WorkflowNodeMetadata } from '@shared/workflow/metadata';

const canonicalize = canonicalizeMetadataKey;

type EnrichContext = {
  answers?: Record<string, any>;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONNECTOR_DIR = path.resolve(__dirname, '../../connectors');

let connectorCache: Array<{ definition: ConnectorDefinition; tokens: Set<string> }> | null = null;

const ensureConnectorCache = () => {
  if (connectorCache) return connectorCache;
  try {
    const files = readdirSync(CONNECTOR_DIR).filter((file) => file.endsWith('.json'));
    connectorCache = files.map((file) => {
      try {
        const content = readFileSync(path.join(CONNECTOR_DIR, file), 'utf8');
        const definition = JSON.parse(content) as ConnectorDefinition;
        const tokens = new Set<string>();
        const id = canonicalize(definition.id ?? file.replace(/\.json$/i, ''));
        const name = canonicalize(definition.name ?? '');
        if (id) tokens.add(id);
        if (name) tokens.add(name);
        if (id) {
          tokens.add(id.replace(/-/g, ''));
          tokens.add(id.replace(/-/g, '_'));
        }
        if (name) {
          tokens.add(name.replace(/-/g, ''));
          tokens.add(name.replace(/-/g, '_'));
        }
        return { definition, tokens };
      } catch (error) {
        console.warn('Failed to load connector definition', file, error);
        return { definition: {}, tokens: new Set<string>() };
      }
    });
  } catch (error) {
    console.warn('Failed to index connector definitions', error);
    connectorCache = [];
  }
  return connectorCache;
};

const findConnector = (app?: string): ConnectorDefinition | undefined => {
  if (!app) return undefined;
  const target = canonicalize(app);
  if (!target) return undefined;
  const index = ensureConnectorCache();

  let fallback: ConnectorDefinition | undefined;
  for (const entry of index) {
    if (entry.tokens.has(target)) return entry.definition;
    if (!fallback) {
      for (const token of entry.tokens) {
        if (token && (token.includes(target) || target.includes(token))) {
          fallback = entry.definition;
          break;
        }
      }
    }
  }
  return fallback;
};

// Connector authors can pre-populate metadata by returning the shared
// `WorkflowMetadata` shape. A minimal example looks like:
// {
//   columns: ['id', 'email'],
//   sample: { id: '123', email: 'person@example.com' },
//   schema: {
//     id: { type: 'string', example: '123' },
//     email: { type: 'string', example: 'person@example.com' }
//   },
//   derivedFrom: ['connector:my-app']
// }
//
// The enrichment logic below merges connector-provided metadata with
// heuristics derived from params, answers and connector schemas.
export const enrichWorkflowNode = <T extends WorkflowNode>(
  node: T,
  context: EnrichContext = {}
): T & { metadata?: WorkflowMetadata; outputMetadata?: WorkflowMetadata } => {
  const params =
    node.params ??
    node.data?.config ??
    node.data?.parameters ??
    (typeof node.data === 'object' ? (node.data as any)?.params : undefined) ??
    {};
  const answers = context.answers ?? {};

  const nodeType =
    typeof node.type === 'string' ? node.type : (node?.data as any)?.nodeType ?? '';
  const app =
    node.app ??
    node.data?.app ??
    node.data?.connectorId ??
    (typeof nodeType === 'string' ? nodeType.split('.')?.[1] : '');
  const rawOperation =
    node.op ??
    node.data?.operation ??
    node.data?.actionId ??
    (typeof nodeType === 'string' ? nodeType.split('.').pop() : '');
  const operationName =
    typeof rawOperation === 'string'
      ? rawOperation.split('.').pop() ?? rawOperation
      : '';
  const connector = findConnector(app);
  const authCandidate =
    (node as any)?.auth ??
    node.data?.auth ??
    node.data?.authentication ??
    node.data?.credentials ??
    node.data?.authConfig;
  const auth =
    authCandidate && typeof authCandidate === 'object' ? (authCandidate as Record<string, any>) : undefined;

  const resolverResult = resolveConnectorMetadata(app, {
    node,
    params,
    answers,
    connector,
    operation: rawOperation,
    auth,
  });

  const metadata = mergeWorkflowMetadata(resolverResult.metadata);
  const outputMetadata = mergeWorkflowMetadata(
    resolverResult.outputMetadata ?? resolverResult.metadata
  );

  const lifecycle = resolverResult.connector?.lifecycle;

  const data = {
    ...(node.data || {}),
    app: node.data?.app ?? node.app ?? app,
    operation: node.data?.operation ?? (operationName || undefined) ?? node.data?.actionId,
    parameters: node.data?.parameters ?? params,
    config: node.data?.config ?? params,
    metadata,
    outputMetadata,
    lifecycle: lifecycle ?? node.data?.lifecycle,
    connectorMetadata: resolverResult.connector,
  };

  return {
    ...node,
    app: node.app ?? data.app,
    name: node.name ?? data.label,
    op: node.op ?? (data.app && data.operation ? `${data.app}.${data.operation}` : node.op),
    params: params,
    data,
    metadata,
    outputMetadata,
  } as T & { metadata?: WorkflowMetadata; outputMetadata?: WorkflowMetadata };
};

export const enrichWorkflowGraph = (
  graph: WorkflowGraph,
  context: EnrichContext = {}
): WorkflowGraph => {
  if (!graph?.nodes) return graph;
  const nodes = graph.nodes.map((node) => enrichWorkflowNode(node, context));
  return { ...graph, nodes };
};

