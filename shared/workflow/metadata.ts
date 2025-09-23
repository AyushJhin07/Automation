export type WorkflowMetadataFieldType = 'string' | 'number' | 'boolean' | 'object' | 'array';

/** Describes a single field in workflow metadata schema definitions. */
export interface WorkflowMetadataFieldSchema {
  type?: WorkflowMetadataFieldType | string;
  description?: string;
  example?: unknown;
  enum?: unknown[];
  format?: string;
  default?: unknown;
  [key: string]: unknown;
}

export type WorkflowMetadataSchema = Record<string, WorkflowMetadataFieldSchema>;

export type WorkflowMetadataValue =
  | Record<string, unknown>
  | unknown[]
  | string
  | number
  | boolean
  | null;

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
  [key: string]: unknown;
}

export type WorkflowMetadataSource = WorkflowMetadata | null | undefined;

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
