export type WorkflowMetadata = {
  columns?: string[];
  sample?: Record<string, any> | any[];
  schema?: Record<string, any>;
  derivedFrom?: string[];
  [key: string]: any;
};

export const canonicalizeMetadataKey = (value: unknown): string => {
  if (value == null) return '';
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

export const mergeMetadataValues = (
  ...sources: Array<WorkflowMetadata | null | undefined>
): WorkflowMetadata => {
  const columns = new Set<string>();
  const derivedFrom = new Set<string>();
  let sampleObject: Record<string, any> | null = null;
  let sampleArray: any[] | null = null;
  let scalarSample: any;
  let schema: Record<string, any> = {};
  let hasSchema = false;

  sources.forEach((source) => {
    if (!source) return;
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
      schema = { ...schema, ...source.schema };
      hasSchema = true;
    }
  });

  const result: WorkflowMetadata = {};
  if (columns.size > 0) result.columns = Array.from(columns);
  if (derivedFrom.size > 0) result.derivedFrom = Array.from(derivedFrom);
  if (sampleObject) result.sample = sampleObject;
  else if (sampleArray) result.sample = sampleArray;
  else if (scalarSample !== undefined) result.sample = scalarSample;
  if (hasSchema) result.schema = schema;
  return result;
};

export const collectColumnsFromAny = (source: unknown): string[] => {
  const result = new Set<string>();
  const visit = (value: unknown, depth = 0) => {
    if (depth > 4 || value == null) return;
    if (Array.isArray(value)) {
      value.forEach((entry) => visit(entry, depth + 1));
      return;
    }
    if (typeof value === 'string') {
      value
        .split(/[\n,|,]/)
        .map((v) => v.trim())
        .filter(Boolean)
        .forEach((v) => result.add(v));
      return;
    }
    if (typeof value === 'object') {
      Object.entries(value as Record<string, any>).forEach(([key, val]) => {
        const lower = key.toLowerCase();
        if (
          ['columns', 'headers', 'fields', 'fieldnames', 'selectedcolumns', 'columnnames'].some((token) =>
            lower.includes(token)
          )
        ) {
          visit(val, depth + 1);
        } else if (depth === 0 && val && typeof val === 'object' && !Array.isArray(val)) {
          Object.keys(val as Record<string, any>).forEach((k) => {
            if (k) result.add(k);
          });
        }
      });
    }
  };
  visit(source);
  return Array.from(result);
};

export const lookupValueInSource = (source: unknown, key: string, depth = 0): any => {
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
    const normalized = canonicalizeMetadataKey(entryKey).replace(/-/g, '_');
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

export const inferValueType = (value: any): string => {
  if (value === null || value === undefined) return 'string';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'string') {
    const numeric = Number(value);
    if (!Number.isNaN(numeric) && value.trim() !== '') return 'number';
  }
  return 'string';
};

export const buildMetadataFromNode = (node: any): WorkflowMetadata => {
  const merged = mergeMetadataValues(
    node?.metadata,
    node?.data?.metadata,
    node?.data?.outputMetadata,
    node?.outputMetadata
  );

  const params =
    node?.data?.config ?? node?.data?.parameters ?? node?.params ?? node?.config ?? node?.data?.params ?? {};

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
    (!sample || (typeof sample === 'object' && !Array.isArray(sample) && Object.keys(sample as Record<string, any>).length === 0))
  ) {
    const generated: Record<string, any> = {};
    const valuesArray = Array.isArray(params?.values) ? params.values : null;
    columns.forEach((column, index) => {
      const normalized = canonicalizeMetadataKey(column).replace(/-/g, '_');
      const fromParams = lookupValueInSource(params, normalized);
      if (fromParams !== undefined && fromParams !== null && fromParams !== '') {
        generated[column] = fromParams;
        return;
      }
      if (valuesArray && index < valuesArray.length) {
        generated[column] = valuesArray[index];
        return;
      }
      if (merged.sample && typeof merged.sample === 'object' && !Array.isArray(merged.sample) && column in merged.sample) {
        generated[column] = (merged.sample as Record<string, any>)[column];
        return;
      }
      generated[column] = `{{${normalized}}}`;
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
      sample && typeof sample === 'object' && !Array.isArray(sample) ? (sample as Record<string, any>) : undefined;
    columns.forEach((column) => {
      const example = sampleObj?.[column];
      generatedSchema[column] = {
        type: inferValueType(example),
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

export const mergeMetadataShape = (
  existing: Record<string, any> | null | undefined,
  next: WorkflowMetadata
): Record<string, any> => {
  const base = existing && typeof existing === 'object' ? existing : {};
  const union = mergeMetadataValues(base as WorkflowMetadata, next);
  const result: Record<string, any> = {
    ...base,
    ...next,
  };

  if (union.columns) {
    result.columns = union.columns;
  }
  if (union.sample !== undefined) {
    result.sample = union.sample;
  }
  if (union.schema) {
    result.schema = union.schema;
  }
  if (union.derivedFrom) {
    result.derivedFrom = union.derivedFrom;
  }

  return result;
};
