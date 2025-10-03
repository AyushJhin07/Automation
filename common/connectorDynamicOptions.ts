export const DYNAMIC_OPTIONS_EXTENSION_KEY = 'x-dynamicOptions';

export type DynamicOptionOperationType = 'action' | 'trigger';

export interface ConnectorDynamicOptionExtension {
  handler: string;
  labelField?: string;
  valueField?: string;
  searchParam?: string;
  dependsOn?: string[];
  cache?: {
    ttlMs?: number;
    scope?: 'connection' | 'user' | 'organization';
  };
  [key: string]: any;
}

export interface ConnectorDynamicOptionConfig {
  operationType: DynamicOptionOperationType;
  operationId: string;
  parameterPath: string;
  schemaType?: string | string[];
  handler: string;
  labelField?: string;
  valueField?: string;
  searchParam?: string;
  dependsOn?: string[];
  cacheTtlMs?: number;
  extension: ConnectorDynamicOptionExtension;
}

type SchemaNode = Record<string, any> | undefined | null;

type TraverseCallback = (
  parameterPath: string,
  schema: Record<string, any>,
  extension: ConnectorDynamicOptionExtension
) => void;

function traverseSchema(schema: SchemaNode, basePath: string, callback: TraverseCallback): void {
  if (!schema || typeof schema !== 'object') {
    return;
  }

  const extension = schema[DYNAMIC_OPTIONS_EXTENSION_KEY];
  if (extension && typeof extension === 'object') {
    callback(basePath, schema as Record<string, any>, extension as ConnectorDynamicOptionExtension);
  }

  const properties = schema.properties;
  if (properties && typeof properties === 'object') {
    for (const [key, value] of Object.entries(properties)) {
      const nextPath = basePath ? `${basePath}.${key}` : key;
      traverseSchema(value as SchemaNode, nextPath, callback);
    }
  }

  const patternProperties = schema.patternProperties;
  if (patternProperties && typeof patternProperties === 'object') {
    for (const [pattern, value] of Object.entries(patternProperties)) {
      const nextPath = basePath ? `${basePath}.{${pattern}}` : `{${pattern}}`;
      traverseSchema(value as SchemaNode, nextPath, callback);
    }
  }

  const items = schema.items;
  if (Array.isArray(items)) {
    items.forEach((item, index) => {
      const nextPath = basePath ? `${basePath}[${index}]` : `[${index}]`;
      traverseSchema(item as SchemaNode, nextPath, callback);
    });
  } else if (items && typeof items === 'object') {
    const nextPath = basePath ? `${basePath}[]` : '[]';
    traverseSchema(items as SchemaNode, nextPath, callback);
  }

  const composites = ['oneOf', 'anyOf', 'allOf', 'then', 'else'];
  for (const composite of composites) {
    const value = (schema as Record<string, any>)[composite];
    if (Array.isArray(value)) {
      value.forEach((node, index) => {
        const nextPath = basePath ? `${basePath}<${composite}#${index}>` : `<${composite}#${index}>`;
        traverseSchema(node as SchemaNode, nextPath, callback);
      });
    } else if (value && typeof value === 'object') {
      const nextPath = basePath ? `${basePath}<${composite}>` : `<${composite}>`;
      traverseSchema(value as SchemaNode, nextPath, callback);
    }
  }
}

export function normalizeDynamicOptionPath(path: string): string {
  return path
    .replace(/\.<[^>]+>/g, '')
    .replace(/\[\d+\]/g, '[]')
    .replace(/\{([^}]+)\}/g, '{$1}')
    .replace(/\.+/g, '.');
}

export function extractDynamicOptionsFromConnector(definition: Record<string, any>): ConnectorDynamicOptionConfig[] {
  const results: ConnectorDynamicOptionConfig[] = [];
  if (!definition || typeof definition !== 'object') {
    return results;
  }

  const processCollection = (collection: any[], operationType: DynamicOptionOperationType) => {
    if (!Array.isArray(collection)) {
      return;
    }

    for (const entry of collection) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }

      const operationId = entry.id;
      if (typeof operationId !== 'string' || operationId.trim() === '') {
        continue;
      }

      const schema = entry.parameters || entry.params || null;
      if (!schema || typeof schema !== 'object') {
        continue;
      }

      traverseSchema(schema, '', (parameterPath, nodeSchema, extension) => {
        if (!extension || typeof extension.handler !== 'string') {
          return;
        }

        const normalizedPath = normalizeDynamicOptionPath(parameterPath);
        const dependsOn = Array.isArray(extension.dependsOn)
          ? extension.dependsOn.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
          : undefined;

        const cacheTtlMs = typeof extension.cache?.ttlMs === 'number' && Number.isFinite(extension.cache.ttlMs)
          ? Math.max(0, extension.cache.ttlMs)
          : undefined;

        results.push({
          operationType,
          operationId,
          parameterPath: normalizedPath,
          schemaType: nodeSchema.type,
          handler: extension.handler,
          labelField: typeof extension.labelField === 'string' ? extension.labelField : undefined,
          valueField: typeof extension.valueField === 'string' ? extension.valueField : undefined,
          searchParam: typeof extension.searchParam === 'string' ? extension.searchParam : undefined,
          dependsOn,
          cacheTtlMs,
          extension,
        });
      });
    }
  };

  processCollection(definition.actions, 'action');
  processCollection(definition.triggers, 'trigger');

  return results;
}
