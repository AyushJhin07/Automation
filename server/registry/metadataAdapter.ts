import { DEFAULT_NODE_IO_CHANNEL, NODE_IO_METADATA_SCHEMA_VERSION, type NodeIOChannelMetadata, type NodeIOMetadata, type NodeIOMetadataSample } from '../../shared/metadata';

interface ConnectorOperationDefinition {
  id?: string;
  name?: string;
  description?: string;
  params?: unknown;
  parameters?: unknown;
  outputSchema?: unknown;
  sample?: unknown;
  outputSample?: unknown;
  inputSample?: unknown;
}

interface ConnectorDefinitionLike {
  actions?: ConnectorOperationDefinition[];
  triggers?: ConnectorOperationDefinition[];
  [key: string]: unknown;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
};

const normalizeSchema = (schema: unknown): Record<string, unknown> | undefined => {
  if (!isPlainObject(schema)) {
    return undefined;
  }
  return schema;
};

const asTypeArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry));
  }
  if (typeof value === 'string') {
    return [value];
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return [String(value)];
  }
  return [];
};

const collectColumnsFromSchema = (
  schema: Record<string, unknown> | undefined,
  prefix: string,
  columns: Set<string>,
): void => {
  if (!schema) {
    return;
  }

  const typeSet = new Set(asTypeArray(schema.type));
  const hasObjectShape = typeSet.has('object') || isPlainObject(schema.properties);
  const hasArrayShape = typeSet.has('array') && schema.items !== undefined;

  if (hasObjectShape) {
    const properties = (schema.properties as Record<string, unknown>) ?? {};
    for (const [key, definition] of Object.entries(properties)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (!path) continue;
      columns.add(path);
      if (isPlainObject(definition)) {
        collectColumnsFromSchema(definition, path, columns);
      }
    }
  }

  if (hasArrayShape) {
    const items = Array.isArray(schema.items) ? schema.items : [schema.items];
    for (const item of items) {
      if (isPlainObject(item)) {
        collectColumnsFromSchema(item, prefix, columns);
      }
    }
  }
};

const collectColumnsFromSample = (sample: unknown, prefix: string, columns: Set<string>): void => {
  if (sample === null || sample === undefined) {
    return;
  }

  if (Array.isArray(sample)) {
    for (const entry of sample) {
      collectColumnsFromSample(entry, prefix, columns);
    }
    return;
  }

  if (!isPlainObject(sample)) {
    if (prefix) {
      columns.add(prefix);
    }
    return;
  }

  const entries = Object.entries(sample);
  if (entries.length === 0) {
    if (prefix) {
      columns.add(prefix);
    }
    return;
  }

  for (const [key, value] of entries) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (!path) {
      continue;
    }
    if (value !== null && typeof value === 'object') {
      columns.add(path);
      collectColumnsFromSample(value, path, columns);
    } else {
      columns.add(path);
    }
  }
};

const buildSamples = (sample: unknown): NodeIOMetadataSample[] | undefined => {
  if (sample === undefined) {
    return undefined;
  }
  if (sample === null || typeof sample === 'string' || typeof sample === 'number' || typeof sample === 'boolean') {
    return [{ data: sample as NodeIOMetadataSample['data'], source: 'connector' }];
  }
  if (Array.isArray(sample)) {
    const sanitized = sample.filter((entry) => entry !== undefined);
    if (sanitized.length === 0) {
      return undefined;
    }
    return sanitized.map((entry) => ({
      data: entry as NodeIOMetadataSample['data'],
      source: 'connector',
    }));
  }
  if (isPlainObject(sample)) {
    return [{ data: sample as NodeIOMetadataSample['data'], source: 'connector' }];
  }
  return undefined;
};

const createChannelMetadata = (
  schema: Record<string, unknown> | undefined,
  sample: unknown,
): NodeIOChannelMetadata | undefined => {
  const normalizedSchema = normalizeSchema(schema);
  const columns = new Set<string>();
  if (normalizedSchema) {
    collectColumnsFromSchema(normalizedSchema, '', columns);
  }
  if (sample !== undefined) {
    collectColumnsFromSample(sample, '', columns);
  }

  const columnList = Array.from(columns).filter(Boolean).sort();
  const samples = buildSamples(sample);
  const payload: NodeIOChannelMetadata = {
    schemaVersion: NODE_IO_METADATA_SCHEMA_VERSION,
  };

  if (normalizedSchema) {
    payload.schema = normalizedSchema;
  }
  if (columnList.length > 0) {
    payload.columns = columnList;
  }
  if (sample !== undefined) {
    payload.sample = sample as NodeIOChannelMetadata['sample'];
  }
  if (samples) {
    payload.samples = samples;
  }

  if (!payload.schema && (!payload.columns || payload.columns.length === 0) && payload.sample === undefined) {
    return undefined;
  }

  return payload;
};

export const buildOperationMetadata = (
  operation: ConnectorOperationDefinition,
): NodeIOMetadata | undefined => {
  if (!operation || typeof operation !== 'object') {
    return undefined;
  }

  const inputs: Record<string, NodeIOChannelMetadata> = {};
  const outputs: Record<string, NodeIOChannelMetadata> = {};

  const parameterSchema = normalizeSchema(operation.parameters ?? operation.params);
  const inputSample = operation.inputSample;
  const inputChannel = createChannelMetadata(parameterSchema, inputSample);
  if (inputChannel) {
    inputs[DEFAULT_NODE_IO_CHANNEL] = inputChannel;
  }

  const outputSchema = normalizeSchema(operation.outputSchema);
  const outputSample = operation.sample ?? operation.outputSample;
  const outputChannel = createChannelMetadata(outputSchema, outputSample);
  if (outputChannel) {
    outputs[DEFAULT_NODE_IO_CHANNEL] = outputChannel;
  }

  if (Object.keys(inputs).length === 0 && Object.keys(outputs).length === 0) {
    return undefined;
  }

  return {
    schemaVersion: NODE_IO_METADATA_SCHEMA_VERSION,
    inputs,
    outputs,
  };
};

export const attachConnectorMetadata = <T extends ConnectorDefinitionLike>(definition: T): T => {
  if (!definition || typeof definition !== 'object') {
    return definition;
  }

  const clone: T = { ...definition };

  if (Array.isArray(definition.actions)) {
    clone.actions = definition.actions.map((action) => {
      const enriched = { ...action } as ConnectorOperationDefinition & { io?: NodeIOMetadata };
      const metadata = buildOperationMetadata(action);
      if (metadata) {
        enriched.io = metadata;
      } else {
        delete enriched.io;
      }
      return enriched;
    });
  }

  if (Array.isArray(definition.triggers)) {
    clone.triggers = definition.triggers.map((trigger) => {
      const enriched = { ...trigger } as ConnectorOperationDefinition & { io?: NodeIOMetadata };
      const metadata = buildOperationMetadata(trigger);
      if (metadata) {
        enriched.io = metadata;
      } else {
        delete enriched.io;
      }
      return enriched;
    });
  }

  return clone;
};
