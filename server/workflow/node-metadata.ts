import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  canonicalizeMetadataKey,
  createMetadataPlaceholder,
  inferWorkflowValueType,
  toMetadataLookupKey,
  type WorkflowMetadata,
  type WorkflowMetadataSource,
} from '@shared/workflow/metadata';
import type { WorkflowGraph, WorkflowNode } from '../../common/workflow-types';
import {
  resolveConnectorMetadata,
  type ConnectorDefinition,
} from './metadata-resolvers';

export type { WorkflowMetadata as WorkflowNodeMetadata } from '@shared/workflow/metadata';

type MetadataSource = WorkflowMetadataSource;

const canonicalize = canonicalizeMetadataKey;

type EnrichContext = {
  answers?: Record<string, any>;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONNECTOR_DIR = path.resolve(__dirname, '../../connectors');

let connectorCache: Array<{ definition: ConnectorDefinition; tokens: Set<string> }> | null = null;

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
const mergeMetadataSources = (...sources: MetadataSource[]): WorkflowMetadata => {
  const columns = new Set<string>();
  const headers = new Set<string>();
  const derivedFrom = new Set<string>();
  let sampleObject: Record<string, any> | null = null;
  let sampleArray: any[] | null = null;
  let scalarSample: any;
  let sampleRow: Record<string, any> | null = null;
  let outputSampleObject: Record<string, any> | null = null;
  let outputSampleArray: any[] | null = null;
  let outputSampleScalar: any;
  let schema: Record<string, any> | null = null;
  let outputSchema: Record<string, any> | null = null;

  const mergeObject = (
    target: Record<string, any> | null,
    candidate: Record<string, any> | null | undefined
  ): Record<string, any> | null => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return target;
    return { ...(target ?? {}), ...candidate };
  };

  const handleSampleCandidate = (
    value: any,
    {
      onObject,
      onArray,
      onScalar,
    }: {
      onObject?: (next: Record<string, any>) => void;
      onArray?: (next: any[]) => void;
      onScalar?: (next: any) => void;
    }
  ) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      onArray?.(value);
      return;
    }
    if (typeof value === 'object') {
      onObject?.(value as Record<string, any>);
      return;
    }
    onScalar?.(value);
  };

  for (const source of sources) {
    if (!source) continue;
    source.columns?.forEach((col) => {
      if (typeof col === 'string' && col.trim()) {
        columns.add(col);
        headers.add(col);
      }
    });
    source.headers?.forEach((header) => {
      if (typeof header === 'string' && header.trim()) {
        headers.add(header);
        columns.add(header);
      }
    });
    source.derivedFrom?.forEach((item) => {
      if (item) derivedFrom.add(item);
    });

    handleSampleCandidate(source.sample, {
      onObject: (next) => {
        sampleObject = mergeObject(sampleObject, next);
      },
      onArray: (next) => {
        if (!sampleArray) sampleArray = next;
      },
      onScalar: (next) => {
        if (scalarSample === undefined) scalarSample = next;
      },
    });

    handleSampleCandidate(source.sampleRow, {
      onObject: (next) => {
        sampleRow = mergeObject(sampleRow, next);
        sampleObject = mergeObject(sampleObject, next);
      },
      onArray: (next) => {
        if (!sampleArray) sampleArray = next;
      },
      onScalar: (next) => {
        if (scalarSample === undefined) scalarSample = next;
      },
    });

    handleSampleCandidate(source.outputSample, {
      onObject: (next) => {
        outputSampleObject = mergeObject(outputSampleObject, next);
        sampleObject = mergeObject(sampleObject, next);
      },
      onArray: (next) => {
        if (!outputSampleArray) outputSampleArray = next;
        if (!sampleArray) sampleArray = next;
      },
      onScalar: (next) => {
        if (outputSampleScalar === undefined) outputSampleScalar = next;
        if (scalarSample === undefined) scalarSample = next;
      },
    });

    if (source.schema) {
      schema = { ...(schema ?? {}), ...source.schema };
    }
    if (source.outputSchema) {
      outputSchema = { ...(outputSchema ?? {}), ...source.outputSchema };
    }
  }

  const result: WorkflowMetadata = {};
  if (columns.size > 0) result.columns = Array.from(columns);
  if (headers.size > 0) {
    const normalizedHeaders = new Set<string>();
    headers.forEach((header) => {
      if (header) normalizedHeaders.add(header);
    });
    columns.forEach((col) => normalizedHeaders.add(col));
    if (normalizedHeaders.size > 0) result.headers = Array.from(normalizedHeaders);
  }
  if (derivedFrom.size > 0) result.derivedFrom = Array.from(derivedFrom);
  if (sampleObject && Object.keys(sampleObject).length > 0) {
    result.sample = sampleObject;
  } else if (sampleArray) {
    result.sample = sampleArray;
  } else if (scalarSample !== undefined) {
    result.sample = scalarSample;
  }
  if (sampleRow && Object.keys(sampleRow).length > 0) {
    result.sampleRow = sampleRow;
  }
  if (outputSampleObject && Object.keys(outputSampleObject).length > 0) {
    result.outputSample = outputSampleObject;
  } else if (outputSampleArray) {
    result.outputSample = outputSampleArray;
  } else if (outputSampleScalar !== undefined) {
    result.outputSample = outputSampleScalar;
  }
  if (schema && Object.keys(schema).length > 0) {
    result.schema = schema;
  }
  if (outputSchema && Object.keys(outputSchema).length > 0) {
    result.outputSchema = outputSchema;
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
    const normalized = toMetadataLookupKey(entryKey);
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

const createPlaceholder = (column: string): string => createMetadataPlaceholder(column);

const inferType = (value: any): string => inferWorkflowValueType(value);

const buildSampleRow = (
  columns: string[],
  params: Record<string, any>,
  answers: Record<string, any>,
  existingSample: any
): Record<string, any> => {
  const sample: Record<string, any> = {};
  const valuesArray = Array.isArray(params?.values) ? params.values : null;
  columns.forEach((column, index) => {
    const normalized = toMetadataLookupKey(column);
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
  connector: ConnectorDefinition | undefined,
  params: Record<string, any>,
  answers: Record<string, any>,
  existing: WorkflowMetadata
): WorkflowMetadata => {
  const metadata: WorkflowMetadata = {};
  const derivedFrom: string[] = [];
  const existingColumns = unique([...(existing.columns ?? []), ...(existing.headers ?? [])]);

  const nodeType = typeof node.type === 'string' ? node.type : node?.data?.nodeType ?? '';
  const app = node.app ?? node.data?.app ?? node.data?.connectorId ?? '';
  const op = node.op ?? node.data?.operation ?? node.data?.actionId ?? '';
  const operationId = normalizeOperationId(op);

  const connectorDefinition = connector;
  const opDefinition = findOperation(connectorDefinition, nodeType ?? '', operationId);
  const schemaFromConnector = buildSchemaFromConnector(opDefinition?.parameters?.properties);

  if (schemaFromConnector) {
    metadata.schema = schemaFromConnector;
    metadata.outputSchema = schemaFromConnector;
    derivedFrom.push(`connector:${canonicalize(connectorDefinition?.id ?? app)}`);
    const schemaColumns = Object.keys(schemaFromConnector);
    if (schemaColumns.length > 0) {
      metadata.columns = unique([...(metadata.columns ?? existingColumns), ...schemaColumns]);
    }
  }

  const configColumns = collectColumnsFromSource(params);
  if (configColumns.length > 0) {
    metadata.columns = unique([...(metadata.columns ?? existingColumns), ...configColumns]);
    derivedFrom.push('config');
  }

  const answerColumns = collectColumnsFromSource(answers);
  if (answerColumns.length > 0) {
    metadata.columns = unique([...(metadata.columns ?? existingColumns), ...answerColumns]);
    derivedFrom.push('answers');
  }

  const columns = metadata.columns ?? existingColumns;
  if (columns.length > 0) {
    const existingSample = existing.sample ?? existing.sampleRow ?? existing.outputSample;
    const sampleRow = buildSampleRow(columns, params, answers, existingSample);
    if (Object.keys(sampleRow).length > 0) {
      metadata.sample = sampleRow;
      metadata.sampleRow = sampleRow;
      metadata.outputSample = sampleRow;
    }
    if (!metadata.schema) {
      const schema: Record<string, any> = {};
      columns.forEach((column) => {
        const normalized = toMetadataLookupKey(column);
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
      metadata.outputSchema = { ...(metadata.outputSchema ?? {}), ...schema };
    }
  }

  const headerValues = unique([...(metadata.headers ?? existing.headers ?? []), ...(metadata.columns ?? [])]);
  if (headerValues.length > 0) {
    metadata.headers = headerValues;
  }

  if (derivedFrom.length > 0) {
    metadata.derivedFrom = unique([...(existing.derivedFrom ?? []), ...derivedFrom]);
  }

  return metadata;
};

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
  const resolverMetadata = resolverResult.metadata;
  const resolverOutputMetadata = resolverResult.outputMetadata ?? resolverResult.metadata;

  const existingOutput = mergeMetadataSources(
    node.data?.outputMetadata as any,
    (node as any)?.outputMetadata,
    resolverOutputMetadata
  );
  const combinedExisting = mergeMetadataSources(
    node.metadata as any,
    node.data?.metadata as any,
    resolverMetadata,
    existingOutput
  );
  const derived = deriveMetadata(node, connector, params, answers, combinedExisting);
  const metadata = mergeMetadataSources(combinedExisting, derived);
  const outputMetadata = mergeMetadataSources(existingOutput, metadata);

  const data = {
    ...(node.data || {}),
    app: node.data?.app ?? node.app ?? app,
    operation: node.data?.operation ?? (operationName || undefined) ?? node.data?.actionId,
    parameters: node.data?.parameters ?? params,
    config: node.data?.config ?? params,
    metadata,
    outputMetadata,
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

