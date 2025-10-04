import {
  canonicalizeMetadataKey,
  createMetadataPlaceholder,
  inferWorkflowValueType,
  mergeWorkflowMetadata,
  toMetadataLookupKey,
  type WorkflowMetadata,
  type WorkflowMetadataSample,
} from '@shared/workflow/metadata';
import type { WorkflowNode } from '../../../common/workflow-types';
import type { ConnectorDefinition, MetadataResolverContext, MetadataResolverResult } from './index';

const canonicalize = canonicalizeMetadataKey;

const normalizeOperationId = (operation?: string): string => {
  if (!operation) return '';
  const cleaned = operation.split(/[.:]/).pop() ?? operation;
  return canonicalize(cleaned);
};

const unique = <T,>(values: Iterable<T>): T[] => {
  const seen = new Set<T>();
  const result: T[] = [];
  for (const value of values) {
    if (
      !seen.has(value) &&
      value !== undefined &&
      value !== null &&
      (typeof value !== 'string' || value.trim() !== '')
    ) {
      seen.add(value);
      result.push(value);
    }
  }
  return result;
};

const collectColumnsFromValue = (value: unknown): string[] => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((entry) =>
        typeof entry === 'string'
          ? entry
          : typeof entry === 'object' && entry
            ? Object.keys(entry)
            : []
      )
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
    if (
      ['columns', 'headers', 'fields', 'fieldnames', 'selectedcolumns', 'columnnames'].some(
        (token) => lowerKey.includes(token)
      )
    ) {
      collectColumnsFromValue(value).forEach((col) => result.add(col));
    } else if (typeof value === 'object' && value) {
      collectColumnsFromValue(value).forEach((col) => result.add(col));
    }
  }
  return Array.from(result);
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

const buildSchemaFromConnector = (
  properties?: Record<string, any>
): Record<string, any> | undefined => {
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
  existing: WorkflowMetadata,
  operationName?: string
): WorkflowMetadata => {
  const metadata: WorkflowMetadata = {};
  const derivedFrom: string[] = [];
  const existingColumns = unique([...(existing.columns ?? []), ...(existing.headers ?? [])]);

  const nodeType = typeof node.type === 'string' ? node.type : (node?.data as any)?.nodeType ?? '';
  const app = node.app ?? (node.data as any)?.app ?? (node.data as any)?.connectorId ?? '';
  const op = operationName ?? node.op ?? (node.data as any)?.operation ?? (node.data as any)?.actionId ?? '';
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

  const headerValues = unique([
    ...(metadata.headers ?? existing.headers ?? []),
    ...(metadata.columns ?? []),
  ]);
  if (headerValues.length > 0) {
    metadata.headers = headerValues;
  }

  if (derivedFrom.length > 0) {
    metadata.derivedFrom = unique([...(existing.derivedFrom ?? []), ...derivedFrom]);
  }

  return metadata;
};

const coerceSamples = (metadata: WorkflowMetadata): WorkflowMetadataSample[] | undefined => {
  if (Array.isArray(metadata.samples) && metadata.samples.length > 0) {
    return metadata.samples;
  }
  if (metadata.sample && typeof metadata.sample === 'object') {
    return [{ data: metadata.sample }];
  }
  if (metadata.sampleRow && typeof metadata.sampleRow === 'object') {
    return [{ data: metadata.sampleRow }];
  }
  if (metadata.outputSample && typeof metadata.outputSample === 'object') {
    return [{ data: metadata.outputSample }];
  }
  return undefined;
};

const normalizeLifecycle = (value: any):
  | {
      status?: string;
      badges: Array<{ id: string; label: string; tone: 'neutral' | 'success' | 'warning' | 'critical' }>;
      raw?: any;
    }
  | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const status: string | undefined = typeof value.status === 'string' ? value.status : undefined;
  const badges: Array<{ id: string; label: string; tone: 'neutral' | 'success' | 'warning' | 'critical' }> = [];

  const flags = {
    alpha: Boolean((value as any).alpha),
    beta: Boolean((value as any).beta),
    deprecated: Boolean((value as any).deprecated),
    stable: (value as any).stable !== false,
    privatePreview: Boolean((value as any).privatePreview),
    sunset: Boolean((value as any).sunset),
  };

  if (flags.alpha) {
    badges.push({ id: 'alpha', label: 'Alpha', tone: 'warning' });
  }
  if (flags.beta) {
    badges.push({ id: 'beta', label: 'Beta', tone: 'warning' });
  }
  if (flags.privatePreview && !flags.alpha && !flags.beta) {
    badges.push({ id: 'preview', label: 'Preview', tone: 'warning' });
  }
  if (flags.deprecated) {
    badges.push({ id: 'deprecated', label: 'Deprecated', tone: 'critical' });
  }
  if ((value as any).sunset || status === 'sunset') {
    badges.push({ id: 'sunset', label: 'Sunset', tone: 'critical' });
  }
  if (!status && badges.length === 0 && flags.stable) {
    badges.push({ id: 'stable', label: 'Stable', tone: 'success' });
  }

  return {
    status: status ?? (flags.beta ? 'beta' : flags.alpha ? 'alpha' : flags.deprecated ? 'deprecated' : undefined),
    badges,
    raw: value,
  };
};

export const runDefaultMetadataResolution = (
  context: MetadataResolverContext
): MetadataResolverResult => {
  const params = context.params ?? {};
  const answers = context.answers ?? {};

  const existingMetadata = mergeWorkflowMetadata(
    (context.node as any)?.metadata,
    (context.node?.data as any)?.metadata
  );
  const existingOutput = mergeWorkflowMetadata(
    (context.node as any)?.outputMetadata,
    (context.node?.data as any)?.outputMetadata
  );
  const combinedExisting = mergeWorkflowMetadata(existingMetadata, existingOutput);

  const derived = deriveMetadata(
    context.node,
    context.connector,
    params,
    answers,
    combinedExisting,
    context.operation
  );
  const metadata = mergeWorkflowMetadata(combinedExisting, derived);
  const outputMetadata = mergeWorkflowMetadata(existingOutput, metadata);

  return {
    metadata,
    outputMetadata,
    connector: {
      inputs: metadata,
      outputs: outputMetadata,
      samples: coerceSamples(metadata),
      lifecycle: normalizeLifecycle(
        context.node?.data?.lifecycle ?? (context.connector as any)?.lifecycle
      ),
    },
  };
};
