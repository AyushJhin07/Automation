export type WorkflowMetadataFieldType = 'string' | 'number' | 'boolean' | 'object' | 'array';

export type WorkflowMetadataPrimitive = string | number | boolean | null;

export type WorkflowMetadataValue =
  | Record<string, WorkflowMetadataValue>
  | WorkflowMetadataValue[]
  | WorkflowMetadataPrimitive;

export interface WorkflowMetadataSample {
  data: WorkflowMetadataValue;
  description?: string;
  source?: 'connector' | 'runtime' | 'user' | 'inferred';
}

/** Describes a single field in workflow metadata schema definitions. */
export interface WorkflowMetadataFieldSchema {
  type?: WorkflowMetadataFieldType | string;
  description?: string;
  example?: WorkflowMetadataValue;
  enum?: WorkflowMetadataValue[];
  format?: string;
  default?: WorkflowMetadataValue;
  nullable?: boolean;
  required?: boolean;
  items?: WorkflowMetadataFieldSchema;
  properties?: Record<string, WorkflowMetadataFieldSchema>;
  samples?: WorkflowMetadataSample[];
  [key: string]: unknown;
}

export type WorkflowMetadataSchema = Record<string, WorkflowMetadataFieldSchema>;

export interface WorkflowMetadataNullability {
  path: string;
  nullable: boolean;
}

/**
 * Canonical metadata shape exchanged between the server enrichment pipeline
 * and UI helpers. Connector authors should provide at least `columns` and
 * either a representative `sample` or `schema` when returning metadata.
 */
export interface WorkflowMetadata {
  columns?: string[];
  headers?: string[];
  sample?: WorkflowMetadataValue;
  sampleRow?: WorkflowMetadataValue;
  outputSample?: WorkflowMetadataValue;
  schema?: WorkflowMetadataSchema;
  outputSchema?: WorkflowMetadataSchema;
  derivedFrom?: string[];
  samples?: WorkflowMetadataSample[];
  nullability?: WorkflowMetadataNullability[];
  [key: string]: unknown;
}

export type WorkflowMetadataSource = WorkflowMetadata | null | undefined;

export interface WorkflowNodeMetadataSnapshot {
  nodeId?: string;
  collectedAt: string;
  inputs?: WorkflowMetadata;
  outputs?: WorkflowMetadata;
  nullability?: WorkflowMetadataNullability[];
  samples?: WorkflowMetadataSample[];
}

export const canonicalizeMetadataKey = (value: unknown): string => {
  if (value == null) return '';
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

export const toMetadataLookupKey = (value: unknown): string =>
  canonicalizeMetadataKey(value).replace(/-/g, '_');

export const createMetadataPlaceholder = (value: string, fallback = 'value'): string => {
  const normalized = toMetadataLookupKey(value);
  return `{{${normalized || fallback}}}`;
};

export const inferWorkflowValueType = (value: unknown): WorkflowMetadataFieldType => {
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

const mergeNullableSets = (
  current: WorkflowMetadataNullability[] | undefined,
  next: WorkflowMetadataNullability[] | undefined
): WorkflowMetadataNullability[] | undefined => {
  if (!current && !next) return undefined;
  const map = new Map<string, WorkflowMetadataNullability>();
  (current ?? []).forEach((entry) => {
    if (!entry?.path) return;
    map.set(entry.path, entry);
  });
  (next ?? []).forEach((entry) => {
    if (!entry?.path) return;
    map.set(entry.path, entry);
  });
  return map.size > 0 ? Array.from(map.values()) : undefined;
};

const coerceMetadata = (value: WorkflowMetadataSource): WorkflowMetadata | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as WorkflowMetadata;
};

const mergeSamples = (
  current: WorkflowMetadataSample[] | undefined,
  next: WorkflowMetadataSample[] | undefined
): WorkflowMetadataSample[] | undefined => {
  if (!current && !next) return undefined;
  const combined = [...(current ?? []), ...(next ?? [])].filter((entry) => entry && typeof entry === 'object');
  if (combined.length === 0) {
    return undefined;
  }
  const deduped: WorkflowMetadataSample[] = [];
  const seen = new Set<string>();
  for (const sample of combined) {
    const key = JSON.stringify(sample.data ?? sample);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(sample);
  }
  return deduped;
};

const mergeSchema = (
  target: WorkflowMetadataSchema | undefined,
  source: WorkflowMetadataSchema | undefined
): WorkflowMetadataSchema | undefined => {
  if (!source || Object.keys(source).length === 0) {
    return target && Object.keys(target).length > 0 ? target : undefined;
  }
  const merged: WorkflowMetadataSchema = { ...(target ?? {}) };
  for (const [key, definition] of Object.entries(source)) {
    if (!definition) continue;
    const existing = merged[key];
    merged[key] = existing ? { ...existing, ...definition } : definition;
  }
  return merged;
};

export const mergeWorkflowMetadata = (...sources: WorkflowMetadataSource[]): WorkflowMetadata => {
  const columns = new Set<string>();
  const headers = new Set<string>();
  const derivedFrom = new Set<string>();
  let sample: WorkflowMetadataValue | undefined;
  let sampleRow: WorkflowMetadataValue | undefined;
  let outputSample: WorkflowMetadataValue | undefined;
  let schema: WorkflowMetadataSchema | undefined;
  let outputSchema: WorkflowMetadataSchema | undefined;
  let nullability: WorkflowMetadataNullability[] | undefined;
  let samples: WorkflowMetadataSample[] | undefined;

  const assignSample = (
    current: WorkflowMetadataValue | undefined,
    candidate: WorkflowMetadataValue | undefined
  ): WorkflowMetadataValue | undefined => {
    if (candidate === undefined) return current;
    if (current === undefined) return candidate;
    if (Array.isArray(current) && Array.isArray(candidate)) {
      return current.length > 0 ? current : candidate;
    }
    if (typeof current === 'object' && current && typeof candidate === 'object' && !Array.isArray(candidate)) {
      return { ...(current as Record<string, WorkflowMetadataValue>), ...(candidate as Record<string, WorkflowMetadataValue>) };
    }
    return current;
  };

  for (const source of sources) {
    const metadata = coerceMetadata(source);
    if (!metadata) continue;
    (metadata.columns ?? []).forEach((value) => {
      if (typeof value === 'string' && value.trim()) {
        columns.add(value);
      }
    });
    (metadata.headers ?? []).forEach((value) => {
      if (typeof value === 'string' && value.trim()) {
        headers.add(value);
      }
    });
    (metadata.derivedFrom ?? []).forEach((value) => {
      if (typeof value === 'string' && value.trim()) {
        derivedFrom.add(value);
      }
    });
    sample = assignSample(sample, metadata.sample);
    sampleRow = assignSample(sampleRow, metadata.sampleRow);
    outputSample = assignSample(outputSample, metadata.outputSample);
    schema = mergeSchema(schema, metadata.schema);
    outputSchema = mergeSchema(outputSchema, metadata.outputSchema);
    nullability = mergeNullableSets(nullability, metadata.nullability);
    samples = mergeSamples(samples, metadata.samples);
  }

  const result: WorkflowMetadata = {};
  if (columns.size > 0) {
    result.columns = Array.from(columns);
  }
  if (headers.size > 0) {
    const mergedHeaders = new Set<string>();
    headers.forEach((value) => mergedHeaders.add(value));
    columns.forEach((value) => mergedHeaders.add(value));
    result.headers = Array.from(mergedHeaders);
  }
  if (derivedFrom.size > 0) {
    result.derivedFrom = Array.from(derivedFrom);
  }
  if (sample !== undefined) {
    result.sample = sample;
  }
  if (sampleRow !== undefined) {
    result.sampleRow = sampleRow;
  }
  if (outputSample !== undefined) {
    result.outputSample = outputSample;
  }
  if (schema && Object.keys(schema).length > 0) {
    result.schema = schema;
  }
  if (outputSchema && Object.keys(outputSchema).length > 0) {
    result.outputSchema = outputSchema;
  }
  if (nullability && nullability.length > 0) {
    result.nullability = nullability;
  }
  if (samples && samples.length > 0) {
    result.samples = samples;
  }
  return result;
};

export const isWorkflowMetadataEmpty = (metadata?: WorkflowMetadataSource): boolean => {
  const value = coerceMetadata(metadata);
  if (!value) return true;
  if (value.columns?.length) return false;
  if (value.headers?.length) return false;
  if (value.derivedFrom?.length) return false;
  if (value.sample && typeof value.sample === 'object') {
    if (Array.isArray(value.sample)) {
      if (value.sample.length > 0) return false;
    } else if (Object.keys(value.sample as Record<string, unknown>).length > 0) {
      return false;
    }
  } else if (value.sample !== undefined) {
    return false;
  }
  if (value.schema && Object.keys(value.schema).length > 0) return false;
  if (value.outputSchema && Object.keys(value.outputSchema).length > 0) return false;
  if (value.outputSample !== undefined) return false;
  if (value.sampleRow !== undefined) return false;
  if (value.samples?.length) return false;
  if (value.nullability?.length) return false;
  return true;
};

const inferNullableForValue = (
  path: string,
  value: WorkflowMetadataValue | undefined
): WorkflowMetadataNullability | undefined => {
  if (value === null) {
    return { path, nullable: true };
  }
  return undefined;
};

const inferSchemaFromObject = (value: Record<string, any>): WorkflowMetadataSchema => {
  const schema: WorkflowMetadataSchema = {};

  for (const [key, entry] of Object.entries(value)) {
    const field: WorkflowMetadataFieldSchema = {};
    const type = inferWorkflowValueType(entry);
    field.type = type;
    if (entry === null) {
      field.nullable = true;
    }
    if (type === 'object' && entry && typeof entry === 'object' && !Array.isArray(entry)) {
      field.properties = inferSchemaFromObject(entry as Record<string, any>);
    }
    if (type === 'array' && Array.isArray(entry)) {
      const first = entry.find((item) => item != null);
      if (first && typeof first === 'object' && !Array.isArray(first)) {
        field.items = { type: 'object', properties: inferSchemaFromObject(first as Record<string, any>) };
      } else if (first !== undefined) {
        field.items = { type: inferWorkflowValueType(first) };
      }
    }
    field.example = entry as WorkflowMetadataValue;
    schema[key] = field;
  }
  return schema;
};

export const inferWorkflowMetadataFromValue = (value: unknown): WorkflowMetadata | undefined => {
  if (value === undefined) return undefined;
  if (value === null) {
    return { sample: null, nullability: [{ path: '', nullable: true }] };
  }

  if (Array.isArray(value)) {
    const arraySample = value.slice(0, 5) as WorkflowMetadataValue[];
    const metadata: WorkflowMetadata = { sample: arraySample };
    const firstObject = value.find((entry) => entry && typeof entry === 'object' && !Array.isArray(entry));
    if (firstObject && typeof firstObject === 'object') {
      const columns = Object.keys(firstObject as Record<string, any>);
      if (columns.length > 0) {
        metadata.columns = columns;
        metadata.headers = columns;
      }
      metadata.sampleRow = firstObject as WorkflowMetadataValue;
      metadata.schema = inferSchemaFromObject(firstObject as Record<string, any>);
    }
    return metadata;
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, any>;
    const metadata: WorkflowMetadata = {
      sample: obj as WorkflowMetadataValue,
      columns: Object.keys(obj),
      headers: Object.keys(obj),
      schema: inferSchemaFromObject(obj),
    };

    const nullability = Object.entries(obj)
      .map(([key, entry]) => inferNullableForValue(key, entry as WorkflowMetadataValue))
      .filter((entry): entry is WorkflowMetadataNullability => Boolean(entry));

    if (nullability.length > 0) {
      metadata.nullability = nullability;
    }

    return metadata;
  }

  return { sample: value as WorkflowMetadataValue };
};

export const createWorkflowNodeMetadataSnapshot = ({
  nodeId,
  inputs = [],
  outputs = [],
  runtimeOutput,
  timestamp = new Date(),
}: {
  nodeId?: string;
  inputs?: WorkflowMetadataSource[];
  outputs?: WorkflowMetadataSource[];
  runtimeOutput?: unknown;
  timestamp?: Date | string;
}): WorkflowNodeMetadataSnapshot | undefined => {
  const inputMetadata = mergeWorkflowMetadata(...inputs);
  const runtimeMetadata = runtimeOutput !== undefined ? inferWorkflowMetadataFromValue(runtimeOutput) : undefined;
  const outputMetadata = mergeWorkflowMetadata(...outputs, runtimeMetadata);

  if (isWorkflowMetadataEmpty(inputMetadata) && isWorkflowMetadataEmpty(outputMetadata)) {
    return undefined;
  }

  const collectedAt = typeof timestamp === 'string' ? timestamp : timestamp.toISOString();

  const snapshot: WorkflowNodeMetadataSnapshot = {
    nodeId,
    collectedAt,
  };

  if (!isWorkflowMetadataEmpty(inputMetadata)) {
    snapshot.inputs = inputMetadata;
  }

  if (!isWorkflowMetadataEmpty(outputMetadata)) {
    snapshot.outputs = outputMetadata;
  }

  const nullability = mergeNullableSets(inputMetadata.nullability, outputMetadata.nullability);
  if (nullability && nullability.length > 0) {
    snapshot.nullability = nullability;
  }

  const samples = mergeSamples(inputMetadata.samples, outputMetadata.samples);
  if (samples && samples.length > 0) {
    snapshot.samples = samples;
  }

  return snapshot;
};
