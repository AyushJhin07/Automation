import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { WorkflowGraph, WorkflowNode } from '../../common/workflow-types';

export type WorkflowNodeMetadata = {
  columns?: string[];
  sample?: Record<string, any> | any[];
  schema?: Record<string, any>;
  derivedFrom?: string[];
};

type ConnectorDefinition = {
  id?: string;
  name?: string;
  actions?: Array<{ id?: string; name?: string; title?: string; parameters?: { properties?: Record<string, any> } }>;
  triggers?: Array<{ id?: string; name?: string; title?: string; parameters?: { properties?: Record<string, any> } }>;
};

type MetadataSource = WorkflowNodeMetadata | undefined | null;

type EnrichContext = {
  answers?: Record<string, any>;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONNECTOR_DIR = path.resolve(__dirname, '../../connectors');

let connectorCache: Array<{ definition: ConnectorDefinition; tokens: Set<string> }> | null = null;

const canonicalize = (value: unknown): string => {
  if (value == null) return '';
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

const normalizeOperationId = (operation?: string): string => {
  if (!operation) return '';
  const cleaned = operation.split(/[.:]/).pop() ?? operation;
  return canonicalize(cleaned);
};

const unique = <T,>(values: Iterable<T>): T[] => {
  const seen = new Set<T>();
  const result: T[] = [];
  for (const value of values) {
    if (!seen.has(value) && value !== undefined && value !== null && (typeof value !== 'string' || value.trim() !== '')) {
      seen.add(value);
      result.push(value);
    }
  }
  return result;
};

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

const operationMatches = (candidate: any, target: string): boolean => {
  if (!candidate) return false;
  const id = canonicalize(candidate.id);
  const name = canonicalize(candidate.name ?? candidate.title);
  const candidateTokens = unique([
    id,
    name,
    id.replace(/-/g, ''),
    id.replace(/-/g, '_'),
    name.replace(/-/g, ''),
    name.replace(/-/g, '_'),
  ]);
  const targetTokens = unique([target, target.replace(/-/g, ''), target.replace(/-/g, '_')]);
  for (const token of candidateTokens) {
    if (!token) continue;
    if (targetTokens.includes(token)) return true;
  }
  return false;
};

const findOperation = (
  connector: ConnectorDefinition | undefined,
  nodeType: string,
  operationId: string
): { parameters?: { properties?: Record<string, any> } } | undefined => {
  if (!connector || !operationId) return undefined;
  const target = normalizeOperationId(operationId);
  if (!target) return undefined;
  const pools: Array<Array<any> | undefined> = [];
  if (nodeType.startsWith('trigger')) {
    pools.push(connector.triggers, connector.actions);
  } else {
    pools.push(connector.actions, connector.triggers);
  }
  for (const pool of pools) {
    if (!pool) continue;
    for (const candidate of pool) {
      if (operationMatches(candidate, target)) return candidate as any;
    }
  }
  return undefined;
};

const collectColumnsFromValue = (value: unknown): string[] => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === 'string' ? entry : typeof entry === 'object' && entry ? Object.keys(entry) : []))
      .flat()
      .map((entry) => (typeof entry === 'string' ? entry : ''))
      .filter((entry) => entry && entry.trim().length > 0);
  }
  if (typeof value === 'string') {
    return value
      .split(/[\n,|]/)
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
  }
  if (typeof value === 'object') {
    return Object.keys(value as Record<string, any>);
  }
  return [];
};

const collectColumnsFromSource = (source: unknown): string[] => {
  if (!source || typeof source !== 'object') return [];
  const result = new Set<string>();
  const entries = Object.entries(source as Record<string, any>);
  for (const [key, value] of entries) {
    const lowerKey = key.toLowerCase();
    if (['columns', 'headers', 'fields', 'fieldnames', 'selectedcolumns', 'columnnames'].some((token) => lowerKey.includes(token))) {
      collectColumnsFromValue(value).forEach((col) => result.add(col));
    } else if (typeof value === 'object' && value) {
      collectColumnsFromValue(value).forEach((col) => result.add(col));
    }
  }
  return Array.from(result);
};

const mergeMetadataSources = (...sources: MetadataSource[]): WorkflowNodeMetadata => {
  const columns = new Set<string>();
  const derivedFrom = new Set<string>();
  let sampleObject: Record<string, any> | null = null;
  let sampleArray: any[] | null = null;
  let scalarSample: any;
  let schema: Record<string, any> | null = null;

  for (const source of sources) {
    if (!source) continue;
    source.columns?.forEach((col) => {
      if (typeof col === 'string' && col.trim()) columns.add(col);
    });
    source.derivedFrom?.forEach((item) => {
      if (item) derivedFrom.add(item);
    });

    const sample = source.sample;
    if (Array.isArray(sample)) {
      if (!sampleArray) sampleArray = sample;
    } else if (sample && typeof sample === 'object') {
      sampleObject = { ...(sampleObject ?? {}), ...sample };
    } else if (sample !== undefined && scalarSample === undefined) {
      scalarSample = sample;
    }

    if (source.schema) {
      schema = { ...(schema ?? {}), ...source.schema };
    }
  }

  const result: WorkflowNodeMetadata = {};
  if (columns.size > 0) result.columns = Array.from(columns);
  if (derivedFrom.size > 0) result.derivedFrom = Array.from(derivedFrom);
  if (sampleArray) {
    result.sample = sampleArray;
  } else if (sampleObject) {
    result.sample = sampleObject;
  } else if (scalarSample !== undefined) {
    result.sample = scalarSample;
  }
  if (schema && Object.keys(schema).length > 0) {
    result.schema = schema;
  }
  return result;
};

const lookupValue = (source: unknown, key: string, depth = 0): any => {
  if (!source || depth > 3) return undefined;
  if (Array.isArray(source)) {
    for (const entry of source) {
      const value = lookupValue(entry, key, depth + 1);
      if (value !== undefined) return value;
    }
    return undefined;
  }
  if (typeof source !== 'object') return undefined;
  for (const [entryKey, entryValue] of Object.entries(source as Record<string, any>)) {
    const normalized = canonicalize(entryKey).replace(/-/g, '_');
    if (normalized === key || normalized.replace(/_/g, '') === key.replace(/_/g, '')) {
      return entryValue;
    }
    if (typeof entryValue === 'object' && entryValue !== null) {
      const nested = lookupValue(entryValue, key, depth + 1);
      if (nested !== undefined) return nested;
    }
  }
  return undefined;
};

const createPlaceholder = (column: string): string => {
  const key = canonicalize(column).replace(/-/g, '_') || 'value';
  return `{{${key}}}`;
};

const inferType = (value: any): string => {
  if (value === null || value === undefined) return 'string';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'string') {
    const numeric = Number(value);
    if (!Number.isNaN(numeric) && value.trim() !== '') {
      return 'number';
    }
  }
  return 'string';
};

const buildSampleRow = (
  columns: string[],
  params: Record<string, any>,
  answers: Record<string, any>,
  existingSample: any
): Record<string, any> => {
  const sample: Record<string, any> = {};
  const valuesArray = Array.isArray(params?.values) ? params.values : null;
  columns.forEach((column, index) => {
    const normalized = canonicalize(column).replace(/-/g, '_');
    const direct = lookupValue(params, normalized);
    if (direct !== undefined && direct !== null && direct !== '') {
      sample[column] = direct;
      return;
    }
    if (valuesArray && index < valuesArray.length) {
      sample[column] = valuesArray[index];
      return;
    }
    const fromAnswers = lookupValue(answers, normalized);
    if (fromAnswers !== undefined && fromAnswers !== null && fromAnswers !== '') {
      sample[column] = fromAnswers;
      return;
    }
    if (existingSample && typeof existingSample === 'object' && !Array.isArray(existingSample) && column in existingSample) {
      sample[column] = (existingSample as Record<string, any>)[column];
      return;
    }
    sample[column] = createPlaceholder(column);
  });
  return sample;
};

const buildSchemaFromConnector = (properties?: Record<string, any>): Record<string, any> | undefined => {
  if (!properties) return undefined;
  const schema: Record<string, any> = {};
  for (const [key, value] of Object.entries(properties)) {
    schema[key] = {
      type: value?.type ?? (value?.enum ? 'string' : inferType(value?.default)),
      description: value?.description,
      enum: value?.enum,
      format: value?.format,
      default: value?.default,
    };
  }
  return Object.keys(schema).length > 0 ? schema : undefined;
};

const deriveMetadata = (
  node: Partial<WorkflowNode>,
  params: Record<string, any>,
  answers: Record<string, any>,
  existing: WorkflowNodeMetadata
): WorkflowNodeMetadata => {
  const metadata: WorkflowNodeMetadata = {};
  const derivedFrom: string[] = [];

  const nodeType = typeof node.type === 'string' ? node.type : node?.data?.nodeType ?? '';
  const app = node.app ?? node.data?.app ?? node.data?.connectorId ?? '';
  const op = node.op ?? node.data?.operation ?? node.data?.actionId ?? '';
  const operationId = normalizeOperationId(op);

  const connector = findConnector(app);
  const opDefinition = findOperation(connector, nodeType ?? '', operationId);
  const schemaFromConnector = buildSchemaFromConnector(opDefinition?.parameters?.properties);

  if (schemaFromConnector) {
    metadata.schema = schemaFromConnector;
    derivedFrom.push(`connector:${canonicalize(connector?.id ?? app)}`);
    const schemaColumns = Object.keys(schemaFromConnector);
    if (schemaColumns.length > 0) {
      metadata.columns = unique([...(existing.columns ?? []), ...schemaColumns]);
    }
  }

  const configColumns = collectColumnsFromSource(params);
  if (configColumns.length > 0) {
    metadata.columns = unique([...(metadata.columns ?? existing.columns ?? []), ...configColumns]);
    derivedFrom.push('config');
  }

  const answerColumns = collectColumnsFromSource(answers);
  if (answerColumns.length > 0) {
    metadata.columns = unique([...(metadata.columns ?? existing.columns ?? []), ...answerColumns]);
    derivedFrom.push('answers');
  }

  const columns = metadata.columns ?? existing.columns ?? [];
  if (columns.length > 0) {
    const sampleRow = buildSampleRow(columns, params, answers, existing.sample);
    if (Object.keys(sampleRow).length > 0) {
      metadata.sample = sampleRow;
    }
    if (!metadata.schema) {
      const schema: Record<string, any> = {};
      columns.forEach((column) => {
        const normalized = canonicalize(column).replace(/-/g, '_');
        const fromSample = sampleRow[column];
        schema[column] = {
          type: inferType(fromSample),
          example: fromSample,
        };
        const existingSchema = existing.schema?.[column];
        if (existingSchema) {
          schema[column] = { ...existingSchema, ...schema[column] };
        }
      });
      metadata.schema = schema;
    }
  }

  if (derivedFrom.length > 0) {
    metadata.derivedFrom = unique([...(existing.derivedFrom ?? []), ...derivedFrom]);
  }

  return metadata;
};

export const enrichWorkflowNode = <T extends WorkflowNode>(
  node: T,
  context: EnrichContext = {}
): T & { metadata?: WorkflowNodeMetadata } => {
  const params =
    node.params ??
    node.data?.config ??
    node.data?.parameters ??
    (typeof node.data === 'object' ? (node.data as any)?.params : undefined) ??
    {};
  const answers = context.answers ?? {};

  const combinedExisting = mergeMetadataSources(node.metadata as any, node.data?.metadata as any);
  const derived = deriveMetadata(node, params, answers, combinedExisting);
  const metadata = mergeMetadataSources(combinedExisting, derived);

  const data = {
    ...(node.data || {}),
    app: node.data?.app ?? node.app,
    operation: node.data?.operation ?? node.op?.split('.').pop() ?? node.data?.actionId,
    parameters: node.data?.parameters ?? params,
    config: node.data?.config ?? params,
    metadata,
  };

  return {
    ...node,
    app: node.app ?? data.app,
    name: node.name ?? data.label,
    op: node.op ?? (data.app && data.operation ? `${data.app}.${data.operation}` : node.op),
    params: params,
    data,
    metadata,
  } as T & { metadata?: WorkflowNodeMetadata };
};

export const enrichWorkflowGraph = (
  graph: WorkflowGraph,
  context: EnrichContext = {}
): WorkflowGraph => {
  if (!graph?.nodes) return graph;
  const nodes = graph.nodes.map((node) => enrichWorkflowNode(node, context));
  return { ...graph, nodes };
};

