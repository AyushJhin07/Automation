import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { buildOperationKeyCandidates, getRuntimeOpHandlers } from '../workflow/compiler/op-map.js';
import { env } from '../env.js';

interface GenericConnectorOperation {
  type: 'action' | 'trigger';
  app: string;
  operation: string;
  endpoint: string;
  method: string;
}

export interface RuntimeAppOperations {
  actions: Record<string, unknown>;
  triggers: Record<string, unknown>;
}

export interface RuntimeCapabilitySummary {
  app: string;
  actions: string[];
  triggers: string[];
}

const BUILTIN_RUNTIME_OPERATIONS: Array<{
  type: 'action' | 'trigger';
  app: string;
  operation: string;
}> = [
  { type: 'action', app: 'http', operation: 'request' },
  { type: 'action', app: 'llm', operation: 'generate' },
  { type: 'action', app: 'llm', operation: 'extract' },
  { type: 'action', app: 'llm', operation: 'classify' },
  { type: 'action', app: 'llm', operation: 'tool_call' },
  { type: 'trigger', app: 'webhook', operation: 'inbound' },
  { type: 'trigger', app: 'time', operation: 'cron' },
  { type: 'trigger', app: 'time', operation: 'manual' },
];

function buildRegistry(): Record<string, RuntimeAppOperations> {
  const handlers = getRuntimeOpHandlers();
  const registry: Record<string, RuntimeAppOperations> = {};

  for (const [key, handler] of Object.entries(handlers)) {
    const match = key.match(/^(action|trigger)\.([^:.]+)[:.](.+)$/);
    if (!match) {
      continue;
    }

    const [, category, app, operation] = match;
    const bucket = (registry[app] ||= { actions: {}, triggers: {} });

    if (category === 'trigger') {
      bucket.triggers[operation] = handler;
    } else {
      bucket.actions[operation] = handler;
    }
  }

  return registry;
}

const RUNTIME_HANDLERS = getRuntimeOpHandlers();
const RUNTIME_HANDLER_KEYS = new Set(Object.keys(RUNTIME_HANDLERS));

const GENERIC_RUNTIME_HANDLER_KEYS = new Set<string>();

function injectBuiltinRuntimeEntries(
  registry: Record<string, RuntimeAppOperations>,
  handlerKeySet: Set<string>,
): void {
  for (const builtin of BUILTIN_RUNTIME_OPERATIONS) {
    const bucket = (registry[builtin.app] ||= { actions: {}, triggers: {} });
    if (builtin.type === 'action') {
      bucket.actions[builtin.operation] = true;
    } else {
      bucket.triggers[builtin.operation] = true;
    }

    const candidates = buildOperationKeyCandidates(builtin.app, builtin.operation, builtin.type);
    for (const candidate of candidates) {
      handlerKeySet.add(candidate);
    }
  }
}

const runtimeRegistry = buildRegistry();
injectBuiltinRuntimeEntries(runtimeRegistry, RUNTIME_HANDLER_KEYS);

let genericRuntimeRegistryCache: Record<string, RuntimeAppOperations> | null = null;
let mergedRuntimeRegistryCache: Record<string, RuntimeAppOperations> | null = null;

function loadConnectorDefinitionOperations(): GenericConnectorOperation[] {
  const operations: GenericConnectorOperation[] = [];

  try {
    const manifestPath = resolve(process.cwd(), 'server', 'connector-manifest.json');
    const manifestRaw = readFileSync(manifestPath, 'utf-8');
    const manifest = JSON.parse(manifestRaw) as {
      connectors?: Array<{ id?: string; normalizedId?: string; definitionPath?: string }>;
    };

    if (!Array.isArray(manifest.connectors)) {
      return operations;
    }

    for (const entry of manifest.connectors) {
      const connectorId = typeof entry?.normalizedId === 'string' && entry.normalizedId.trim() !== ''
        ? entry.normalizedId.trim()
        : typeof entry?.id === 'string'
          ? entry.id.trim()
          : '';

      const definitionPath = typeof entry?.definitionPath === 'string' ? entry.definitionPath : '';
      if (!connectorId || !definitionPath) {
        continue;
      }

      try {
        const resolved = resolve(process.cwd(), definitionPath);
        const rawDefinition = readFileSync(resolved, 'utf-8');
        const parsed = JSON.parse(rawDefinition) as {
          actions?: Array<{ id?: string | null; endpoint?: unknown; method?: unknown }>;
          triggers?: Array<{ id?: string | null; endpoint?: unknown; method?: unknown }>;
        };

        const actions = Array.isArray(parsed.actions) ? parsed.actions : [];
        const triggers = Array.isArray(parsed.triggers) ? parsed.triggers : [];

        for (const action of actions) {
          const operationId = typeof action?.id === 'string' ? action.id.trim() : '';
          const endpoint = typeof action?.endpoint === 'string' ? action.endpoint.trim() : '';
          const method = typeof action?.method === 'string' ? action.method.trim() : '';
          if (!operationId || !endpoint || !method) {
            continue;
          }
          operations.push({
            type: 'action',
            app: connectorId,
            operation: operationId,
            endpoint,
            method,
          });
        }

        for (const trigger of triggers) {
          const operationId = typeof trigger?.id === 'string' ? trigger.id.trim() : '';
          const endpoint = typeof trigger?.endpoint === 'string' ? trigger.endpoint.trim() : '';
          const method = typeof trigger?.method === 'string' ? trigger.method.trim() : '';
          if (!operationId || !endpoint || !method) {
            continue;
          }
          operations.push({
            type: 'trigger',
            app: connectorId,
            operation: operationId,
            endpoint,
            method,
          });
        }
      } catch (error) {
        console.warn(
          `[RuntimeRegistry] Failed to load connector definition for ${connectorId}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }
  } catch (error) {
    console.warn(
      `[RuntimeRegistry] Failed to load connector manifest: ${error instanceof Error ? error.message : error}`,
    );
  }

  return operations;
}

function buildGenericRuntimeRegistry(): Record<string, RuntimeAppOperations> {
  const registry: Record<string, RuntimeAppOperations> = {};
  const seen = new Set<string>();

  for (const operation of loadConnectorDefinitionOperations()) {
    const key = `${operation.type}.${operation.app}:${operation.operation}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    const bucket = (registry[operation.app] ||= { actions: {}, triggers: {} });
    const target = operation.type === 'trigger' ? bucket.triggers : bucket.actions;

    if (target[operation.operation]) {
      continue;
    }

    target[operation.operation] = {
      endpoint: operation.endpoint,
      method: operation.method,
    };

    const candidates = buildOperationKeyCandidates(operation.app, operation.operation, operation.type);
    for (const candidate of candidates) {
      GENERIC_RUNTIME_HANDLER_KEYS.add(candidate);
    }
  }

  return registry;
}

function ensureGenericRuntimeRegistry(): Record<string, RuntimeAppOperations> {
  if (!genericRuntimeRegistryCache) {
    genericRuntimeRegistryCache = buildGenericRuntimeRegistry();
  }
  return genericRuntimeRegistryCache;
}

function cloneRegistry(source: Record<string, RuntimeAppOperations>): Record<string, RuntimeAppOperations> {
  const clone: Record<string, RuntimeAppOperations> = {};
  for (const [app, ops] of Object.entries(source)) {
    clone[app] = {
      actions: { ...ops.actions },
      triggers: { ...ops.triggers },
    };
  }
  return clone;
}

function mergeRegistries(
  base: Record<string, RuntimeAppOperations>,
  addition: Record<string, RuntimeAppOperations>,
): Record<string, RuntimeAppOperations> {
  const merged = cloneRegistry(base);

  for (const [app, ops] of Object.entries(addition)) {
    const bucket = (merged[app] ||= { actions: {}, triggers: {} });

    for (const [operation, handler] of Object.entries(ops.actions)) {
      if (!(operation in bucket.actions)) {
        bucket.actions[operation] = handler;
      }
    }

    for (const [operation, handler] of Object.entries(ops.triggers)) {
      if (!(operation in bucket.triggers)) {
        bucket.triggers[operation] = handler;
      }
    }
  }

  return merged;
}

function isGenericExecutorEnabled(): boolean {
  if (process.env.GENERIC_EXECUTOR_ENABLED === 'true') {
    return true;
  }
  if (process.env.GENERIC_EXECUTOR_ENABLED === 'false') {
    return false;
  }
  return env.GENERIC_EXECUTOR_ENABLED;
}

function getRuntimeRegistryInternal(): Record<string, RuntimeAppOperations> {
  if (!isGenericExecutorEnabled()) {
    return runtimeRegistry;
  }

  if (!mergedRuntimeRegistryCache) {
    const genericRegistry = ensureGenericRuntimeRegistry();
    mergedRuntimeRegistryCache = mergeRegistries(runtimeRegistry, genericRegistry);
  }

  return mergedRuntimeRegistryCache;
}

export function getRuntimeRegistry(): Record<string, RuntimeAppOperations> {
  return getRuntimeRegistryInternal();
}

export const RUNTIME_REGISTRY: Record<string, RuntimeAppOperations> = getRuntimeRegistryInternal();

export function getRuntimeCapabilities(): RuntimeCapabilitySummary[] {
  const registry = getRuntimeRegistryInternal();
  return Object.entries(registry)
    .map(([app, ops]) => ({
      app,
      actions: Object.keys(ops.actions).sort(),
      triggers: Object.keys(ops.triggers).sort(),
    }))
    .sort((a, b) => a.app.localeCompare(b.app));
}

export function hasRuntimeImplementation(
  type: 'action' | 'trigger',
  app: string,
  operation: string,
): boolean {
  if (!app || !operation) {
    return false;
  }

  const candidates = buildOperationKeyCandidates(app, operation, type);
  if (candidates.some(candidate => RUNTIME_HANDLER_KEYS.has(candidate))) {
    return true;
  }

  if (isGenericExecutorEnabled()) {
    ensureGenericRuntimeRegistry();
    if (candidates.some(candidate => GENERIC_RUNTIME_HANDLER_KEYS.has(candidate))) {
      return true;
    }
  }

  return false;
}
