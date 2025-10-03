import {
  createMetadataPlaceholder,
  inferWorkflowValueType,
  mergeWorkflowMetadata,
  toMetadataLookupKey,
  type WorkflowMetadata,
  type WorkflowMetadataSource,
} from '@shared/workflow/metadata';

const mergeMetadataValues = (...sources: WorkflowMetadataSource[]): WorkflowMetadata =>
  mergeWorkflowMetadata(...sources);

const collectColumnsFromAny = (source: unknown): string[] => {
  if (!source) return [];
  const result = new Set<string>();
  const visit = (value: unknown, depth = 0) => {
    if (value == null || depth > 2) return;
    if (Array.isArray(value)) {
      value.forEach((entry) => {
        if (typeof entry === 'string' && entry.trim()) {
          result.add(entry);
        } else {
          visit(entry, depth + 1);
        }
      });
      return;
    }
    if (typeof value === 'object') {
      Object.entries(value as Record<string, any>).forEach(([key, val]) => {
        if (typeof val === 'string' && val.trim()) {
          result.add(val);
          return;
        }
        if (Array.isArray(val) || (val && typeof val === 'object')) {
          visit(val, depth + 1);
        }
        if (
          depth === 0 &&
          val &&
          typeof val === 'object' &&
          !Array.isArray(val)
        ) {
          Object.keys(val as Record<string, any>).forEach((k) => {
            if (k) result.add(k);
          });
        }
      });
      return;
    }
  };
  visit(source);
  return Array.from(result);
};

const lookupValueInSource = (source: unknown, key: string, depth = 0): any => {
  if (!source || depth > 3) return undefined;
  if (Array.isArray(source)) {
    for (const entry of source) {
      const val = lookupValueInSource(entry, key, depth + 1);
      if (val !== undefined) return val;
    }
    return undefined;
  }
  if (typeof source !== 'object') return undefined;
  for (const [entryKey, entryValue] of Object.entries(source as Record<string, any>)) {
    const normalized = toMetadataLookupKey(entryKey);
    if (normalized === key || normalized.replace(/_/g, '') === key.replace(/_/g, '')) {
      return entryValue;
    }
    if (entryValue && typeof entryValue === 'object') {
      const nested = lookupValueInSource(entryValue, key, depth + 1);
      if (nested !== undefined) return nested;
    }
  }
  return undefined;
};

/**
 * Connectors that publish `metadata`/`outputMetadata` should populate at least:
 * - `columns`: ordered list of fields returned by the operation.
 * - `schema` or a representative `sample` object: used to render previews.
 *
 * The UI will fall back to inference when values are missing, but explicit
 * metadata from connectors produces the most accurate representation.
 */
export const buildMetadataFromNode = (node: any): WorkflowMetadata => {
  const merged = mergeMetadataValues(
    node?.metadata,
    node?.data?.metadata,
    node?.data?.outputMetadata,
    node?.outputMetadata
  );

  const params =
    node?.data?.config ??
    node?.data?.parameters ??
    node?.params ??
    node?.config ??
    node?.data?.params ??
    {};

  const configColumns = collectColumnsFromAny(params);
  const schemaColumns = merged.schema ? Object.keys(merged.schema) : [];
  const combinedColumns = Array.from(
    new Set([...(merged.columns || []), ...configColumns, ...schemaColumns])
  ).filter((col): col is string => typeof col === 'string' && col.trim().length > 0);

  let metadata = mergeMetadataValues(merged, {
    columns: combinedColumns.length ? combinedColumns : undefined,
  });

  const columns = metadata.columns || [];

  let sample = metadata.sample;
  if (
    columns.length > 0 &&
    (!sample ||
      (typeof sample === 'object' &&
        !Array.isArray(sample) &&
        Object.keys(sample as Record<string, any>).length === 0))
  ) {
    const generated: Record<string, any> = {};
    const valuesArray = Array.isArray(params?.values) ? params.values : null;
    columns.forEach((column, index) => {
      const normalized = toMetadataLookupKey(column);
      const fromParams = lookupValueInSource(params, normalized);
      if (fromParams !== undefined && fromParams !== null && fromParams !== '') {
        generated[column] = fromParams;
        return;
      }
      if (valuesArray && index < valuesArray.length) {
        generated[column] = valuesArray[index];
        return;
      }
      if (
        merged.sample &&
        typeof merged.sample === 'object' &&
        !Array.isArray(merged.sample) &&
        column in merged.sample
      ) {
        generated[column] = (merged.sample as Record<string, any>)[column];
        return;
      }
      generated[column] = createMetadataPlaceholder(column);
    });
    sample = generated;
  }

  if (sample) {
    metadata = mergeMetadataValues(metadata, { sample });
  }

  let schema = metadata.schema;
  if ((!schema || Object.keys(schema).length === 0) && columns.length > 0) {
    const generatedSchema: Record<string, any> = {};
    const sampleObj =
      sample && typeof sample === 'object' && !Array.isArray(sample)
        ? (sample as Record<string, any>)
        : undefined;
    columns.forEach((column) => {
      const example = sampleObj?.[column];
      generatedSchema[column] = {
        type: inferWorkflowValueType(example),
        example,
      };
      if (schema && schema[column]) {
        generatedSchema[column] = { ...schema[column], ...generatedSchema[column] };
      }
    });
    schema = generatedSchema;
  }

  if (schema && Object.keys(schema).length > 0) {
    metadata = mergeMetadataValues(metadata, { schema });
  }

  return metadata;
};
