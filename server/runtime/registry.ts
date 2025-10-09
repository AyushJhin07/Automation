import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { buildOperationKeyCandidates, getRuntimeOpHandlers } from '../workflow/compiler/op-map.js';
import { env } from '../env.js';
import { enabledRuntimes, type EnabledRuntimeSet, type RuntimeIdentifier } from './capabilities.js';

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

export type RuntimeAvailability = 'native' | 'fallback' | 'unavailable';

export interface RuntimeCapabilityOperationSummary {
  id: string;
  normalizedId: string;
  kind: 'action' | 'trigger';
  nativeRuntimes: RuntimeIdentifier[];
  fallbackRuntimes: RuntimeIdentifier[];
  resolvedRuntime: RuntimeIdentifier | null;
  availability: RuntimeAvailability;
  enabledNativeRuntimes: RuntimeIdentifier[];
  enabledFallbackRuntimes: RuntimeIdentifier[];
  disabledNativeRuntimes: RuntimeIdentifier[];
  disabledFallbackRuntimes: RuntimeIdentifier[];
  issues: RuntimeResolutionIssue[];
}

export interface RuntimeCapabilitySummary {
  app: string;
  normalizedAppId: string;
  actions: string[];
  triggers: string[];
  actionDetails: Record<string, RuntimeCapabilityOperationSummary>;
  triggerDetails: Record<string, RuntimeCapabilityOperationSummary>;
}

const RUNTIME_PRIORITY: RuntimeIdentifier[] = ['node', 'apps_script', 'cloud_worker'];

type CapabilitySource = 'native' | 'fallback';

interface OperationCapability {
  key: string;
  kind: 'action' | 'trigger';
  appId: string;
  normalizedAppId: string;
  operationId: string;
  normalizedOperationId: string;
  nativeRuntimes: Set<RuntimeIdentifier>;
  fallbackRuntimes: Set<RuntimeIdentifier>;
  displayAppId: string;
  displayOperationId: string;
}

interface OperationRuntimeConfig {
  native: RuntimeIdentifier[];
  fallback: RuntimeIdentifier[];
}

interface ConnectorRuntimeConfigNormalized {
  appId: string;
  normalizedAppId: string;
  defaults: OperationRuntimeConfig;
  actions: Record<string, OperationRuntimeConfig>;
  triggers: Record<string, OperationRuntimeConfig>;
}

export interface RuntimeOperationDefinition {
  kind: 'action' | 'trigger';
  appId: string;
  operationId: string;
}

export interface RuntimeOperationCapability {
  appId: string;
  normalizedAppId: string;
  operationId: string;
  normalizedOperationId: string;
  kind: 'action' | 'trigger';
  nativeRuntimes: RuntimeIdentifier[];
  fallbackRuntimes: RuntimeIdentifier[];
}

export interface RuntimeResolutionIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
}

export interface RuntimeResolutionResult {
  runtime: RuntimeIdentifier | null;
  availability: RuntimeAvailability;
  issues: RuntimeResolutionIssue[];
  capability?: RuntimeOperationCapability;
  nativeRuntimes: RuntimeIdentifier[];
  fallbackRuntimes: RuntimeIdentifier[];
  enabledNativeRuntimes: RuntimeIdentifier[];
  enabledFallbackRuntimes: RuntimeIdentifier[];
  disabledNativeRuntimes: RuntimeIdentifier[];
  disabledFallbackRuntimes: RuntimeIdentifier[];
  enabledRuntimes: EnabledRuntimeSet;
}

const operationCapabilities = new Map<string, OperationCapability>();

const normalizeAppId = (value: string): string => value.trim().toLowerCase();

const normalizeOperationId = (value: string): string =>
  value.trim().replace(/\./g, '_').replace(/\s+/g, '_').toLowerCase();

const buildCapabilityKey = (kind: 'action' | 'trigger', appId: string, operationId: string): string =>
  `${kind}:${appId}:${operationId}`;

const runtimeIsEnabled = (runtime: RuntimeIdentifier, flags: EnabledRuntimeSet): boolean => {
  switch (runtime) {
    case 'node':
      return flags.node;
    case 'apps_script':
      return flags.appsScript;
    case 'cloud_worker':
      return flags.cloudWorker;
    default:
      return false;
  }
};

const sortRuntimes = (collection: Iterable<RuntimeIdentifier>): RuntimeIdentifier[] => {
  const entries = new Set(collection);
  return RUNTIME_PRIORITY.filter(runtime => entries.has(runtime));
};

const ensureOperationCapability = (
  kind: 'action' | 'trigger',
  appIdRaw: string,
  operationIdRaw: string,
): OperationCapability | null => {
  const normalizedAppId = normalizeAppId(appIdRaw);
  const normalizedOperationId = normalizeOperationId(operationIdRaw);

  if (!normalizedAppId || !normalizedOperationId) {
    return null;
  }

  const key = buildCapabilityKey(kind, normalizedAppId, normalizedOperationId);
  let entry = operationCapabilities.get(key);
  if (!entry) {
    entry = {
      key,
      kind,
      appId: normalizedAppId,
      normalizedAppId,
      operationId: normalizedOperationId,
      normalizedOperationId,
      nativeRuntimes: new Set<RuntimeIdentifier>(),
      fallbackRuntimes: new Set<RuntimeIdentifier>(),
      displayAppId: appIdRaw,
      displayOperationId: operationIdRaw,
    };
    operationCapabilities.set(key, entry);
  } else {
    if (!entry.displayAppId) {
      entry.displayAppId = appIdRaw;
    }
    if (!entry.displayOperationId) {
      entry.displayOperationId = operationIdRaw;
    }
  }

  return entry;
};

const recordRuntimeCapability = (
  kind: 'action' | 'trigger',
  appId: string,
  operationId: string,
  runtime: RuntimeIdentifier,
  source: CapabilitySource,
): void => {
  const entry = ensureOperationCapability(kind, appId, operationId);
  if (!entry) {
    return;
  }

  if (source === 'native') {
    entry.nativeRuntimes.add(runtime);
  } else {
    entry.fallbackRuntimes.add(runtime);
  }
};

const runtimeAliasMap: Record<string, RuntimeIdentifier> = {
  node: 'node',
  nodejs: 'node',
  node_js: 'node',
  'apps-script': 'apps_script',
  apps_script: 'apps_script',
  appsscript: 'apps_script',
  gas: 'apps_script',
  cloudworker: 'cloud_worker',
  cloud_worker: 'cloud_worker',
  worker: 'cloud_worker',
};

const normalizeRuntimeId = (value: unknown): RuntimeIdentifier | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return runtimeAliasMap[normalized];
};

const normalizeRuntimeList = (value: unknown): RuntimeIdentifier[] => {
  const runtimes = new Set<RuntimeIdentifier>();

  const assign = (candidate: unknown) => {
    const runtime = normalizeRuntimeId(candidate);
    if (runtime) {
      runtimes.add(runtime);
    }
  };

  if (Array.isArray(value)) {
    for (const entry of value) {
      assign(entry);
    }
    return Array.from(runtimes);
  }

  if (value !== undefined && value !== null) {
    assign(value);
  }

  return Array.from(runtimes);
};

const normalizeOperationRuntimeConfig = (raw: unknown): OperationRuntimeConfig => {
  const native = new Set<RuntimeIdentifier>();
  const fallback = new Set<RuntimeIdentifier>();

  if (raw === null || raw === undefined) {
    return { native: [], fallback: [] };
  }

  const addNative = (value: unknown) => {
    for (const runtime of normalizeRuntimeList(value)) {
      native.add(runtime);
    }
  };

  const addFallback = (value: unknown) => {
    for (const runtime of normalizeRuntimeList(value)) {
      fallback.add(runtime);
    }
  };

  if (Array.isArray(raw) || typeof raw === 'string') {
    addNative(raw);
    return { native: Array.from(native), fallback: Array.from(fallback) };
  }

  if (typeof raw === 'object') {
    const object = raw as Record<string, unknown>;
    addNative(
      object.native ??
        object.primary ??
        object.preferred ??
        object.supported ??
        object.available ??
        object.runtimes ??
        object.runtime ??
        object.default ??
        object.defaults,
    );
    addFallback(
      object.fallback ??
        object.fallbacks ??
        object.backup ??
        object.alternatives ??
        object.fallbackRuntime ??
        object.fallbackRuntimes,
    );
    if (native.size === 0 && fallback.size === 0 && object.only) {
      addNative(object.only);
    }
    return { native: Array.from(native), fallback: Array.from(fallback) };
  }

  addNative(raw);
  return { native: Array.from(native), fallback: Array.from(fallback) };
};

const normalizeConnectorRuntimeConfig = (
  appId: string,
  manifest: Record<string, unknown>,
): ConnectorRuntimeConfigNormalized | null => {
  const runtimeRoot =
    manifest.runtime ??
    manifest.runtimeSupport ??
    (typeof manifest.capabilities === 'object'
      ? (manifest.capabilities as Record<string, unknown>).runtime
      : undefined);

  if (!runtimeRoot || typeof runtimeRoot !== 'object') {
    return null;
  }

  const runtimeObject = runtimeRoot as Record<string, unknown>;
  const defaults = normalizeOperationRuntimeConfig(runtimeObject.defaults ?? runtimeObject.default ?? runtimeObject);
  const normalizedAppId = normalizeAppId(appId);

  const assignBucket = (
    source: unknown,
    target: Record<string, OperationRuntimeConfig>,
  ) => {
    if (!source || typeof source !== 'object') {
      return;
    }

    for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
      const normalizedKey = normalizeOperationId(key);
      if (!normalizedKey) {
        continue;
      }
      target[normalizedKey] = normalizeOperationRuntimeConfig(value);
    }
  };

  const actions: Record<string, OperationRuntimeConfig> = {};
  const triggers: Record<string, OperationRuntimeConfig> = {};

  assignBucket(runtimeObject.actions, actions);
  assignBucket(runtimeObject.triggers, triggers);
  if (runtimeObject.operations) {
    assignBucket(runtimeObject.operations, actions);
  }

  return {
    appId,
    normalizedAppId,
    defaults,
    actions,
    triggers,
  };
};

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

    recordRuntimeCapability(category as 'action' | 'trigger', app, operation, 'node', 'native');
  }

  return registry;
}

const RUNTIME_HANDLERS = getRuntimeOpHandlers();
const RUNTIME_HANDLER_KEYS = new Set(Object.keys(RUNTIME_HANDLERS));

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

    recordRuntimeCapability(builtin.type, builtin.app, builtin.operation, 'node', 'native');
  }
}

const runtimeRegistry = buildRegistry();
injectBuiltinRuntimeEntries(runtimeRegistry, RUNTIME_HANDLER_KEYS);

let genericRuntimeRegistryCache: Record<string, RuntimeAppOperations> | null = null;
let mergedRuntimeRegistryCache: Record<string, RuntimeAppOperations> | null = null;
let connectorRuntimeManifestCache: Record<string, ConnectorRuntimeConfigNormalized> | null = null;

function loadConnectorRuntimeManifest(): Record<string, ConnectorRuntimeConfigNormalized> {
  if (connectorRuntimeManifestCache) {
    return connectorRuntimeManifestCache;
  }

  const configs: Record<string, ConnectorRuntimeConfigNormalized> = {};

  try {
    const manifestPath = resolve(process.cwd(), 'server', 'connector-manifest.json');
    const manifestRaw = readFileSync(manifestPath, 'utf-8');
    const manifest = JSON.parse(manifestRaw) as {
      connectors?: Array<{ id?: string; normalizedId?: string; manifestPath?: string }>;
    };

    if (!Array.isArray(manifest.connectors)) {
      connectorRuntimeManifestCache = configs;
      return configs;
    }

    for (const entry of manifest.connectors) {
      const connectorId = typeof entry?.normalizedId === 'string' && entry.normalizedId.trim() !== ''
        ? entry.normalizedId.trim()
        : typeof entry?.id === 'string'
          ? entry.id.trim()
          : '';

      const manifestFile = typeof entry?.manifestPath === 'string' ? entry.manifestPath : '';
      if (!connectorId || !manifestFile) {
        continue;
      }

      try {
        const resolvedManifest = resolve(process.cwd(), manifestFile);
        const rawManifest = readFileSync(resolvedManifest, 'utf-8');
        const parsedManifest = JSON.parse(rawManifest) as Record<string, unknown>;
        const config = normalizeConnectorRuntimeConfig(connectorId, parsedManifest);
        if (config) {
          configs[config.normalizedAppId] = config;
        }
      } catch (error) {
        console.warn(
          `[RuntimeRegistry] Failed to load runtime metadata for ${connectorId}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }
  } catch (error) {
    console.warn(
      `[RuntimeRegistry] Failed to read connector runtime manifest metadata: ${error instanceof Error ? error.message : error}`,
    );
  }

  connectorRuntimeManifestCache = configs;
  return configs;
}

const applyRuntimeConfigToEntry = (
  entry: OperationCapability | null,
  config?: OperationRuntimeConfig,
): void => {
  if (!entry || !config) {
    return;
  }

  for (const runtime of config.native) {
    entry.nativeRuntimes.add(runtime);
  }
  for (const runtime of config.fallback) {
    entry.fallbackRuntimes.add(runtime);
  }
};

const applyConnectorRuntimeConfig = (config: ConnectorRuntimeConfigNormalized): void => {
  const { appId, normalizedAppId, defaults, actions, triggers } = config;

  const applyBucket = (
    kind: 'action' | 'trigger',
    bucket: Record<string, OperationRuntimeConfig>,
  ) => {
    const wildcard = bucket['*'];

    for (const entry of operationCapabilities.values()) {
      if (entry.normalizedAppId !== normalizedAppId || entry.kind !== kind) {
        continue;
      }
      applyRuntimeConfigToEntry(entry, defaults);
      if (wildcard) {
        applyRuntimeConfigToEntry(entry, wildcard);
      }
    }

    for (const [operationId, operationConfig] of Object.entries(bucket)) {
      if (operationId === '*') {
        continue;
      }
      const entry = ensureOperationCapability(kind, appId, operationId);
      if (!entry) {
        continue;
      }
      applyRuntimeConfigToEntry(entry, defaults);
      if (wildcard) {
        applyRuntimeConfigToEntry(entry, wildcard);
      }
      applyRuntimeConfigToEntry(entry, operationConfig);
    }
  };

  applyBucket('action', actions);
  applyBucket('trigger', triggers);
};

const ensureManifestRuntimeSupport = (): void => {
  const manifests = loadConnectorRuntimeManifest();
  for (const config of Object.values(manifests)) {
    applyConnectorRuntimeConfig(config);
  }
};

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

    recordRuntimeCapability(operation.type, operation.app, operation.operation, 'node', 'fallback');
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

const ensureRuntimeCapabilityStore = (): void => {
  getRuntimeRegistryInternal();
  ensureManifestRuntimeSupport();
};

export function resolveRuntime(definition: RuntimeOperationDefinition): RuntimeResolutionResult {
  const kind = definition.kind;
  const appIdRaw = typeof definition.appId === 'string' ? definition.appId : '';
  const operationIdRaw = typeof definition.operationId === 'string' ? definition.operationId : '';

  const normalizedAppId = normalizeAppId(appIdRaw);
  const normalizedOperationId = normalizeOperationId(operationIdRaw);

  ensureRuntimeCapabilityStore();

  const key = buildCapabilityKey(kind, normalizedAppId, normalizedOperationId);
  const entry = operationCapabilities.get(key);

  const enabledFlags = enabledRuntimes();

  if (!entry) {
    const issues: RuntimeResolutionIssue[] = [
      {
        severity: 'error',
        code: 'runtime.missing_capability',
        message: `No runtime capability registered for ${appIdRaw}.${operationIdRaw}`,
      },
    ];

    return {
      runtime: null,
      availability: 'unavailable',
      issues,
      nativeRuntimes: [],
      fallbackRuntimes: [],
      enabledNativeRuntimes: [],
      enabledFallbackRuntimes: [],
      disabledNativeRuntimes: [],
      disabledFallbackRuntimes: [],
      enabledRuntimes: enabledFlags,
    };
  }

  const capability: RuntimeOperationCapability = {
    appId: entry.displayAppId ?? entry.appId,
    normalizedAppId: entry.normalizedAppId,
    operationId: entry.displayOperationId ?? entry.operationId,
    normalizedOperationId: entry.normalizedOperationId,
    kind: entry.kind,
    nativeRuntimes: sortRuntimes(entry.nativeRuntimes),
    fallbackRuntimes: sortRuntimes(entry.fallbackRuntimes),
  };

  const nativeRuntimes = capability.nativeRuntimes;
  const fallbackRuntimes = capability.fallbackRuntimes;

  const enabledNativeRuntimes = nativeRuntimes.filter(runtime => runtimeIsEnabled(runtime, enabledFlags));
  const enabledFallbackRuntimes = fallbackRuntimes.filter(runtime => runtimeIsEnabled(runtime, enabledFlags));
  const disabledNativeRuntimes = nativeRuntimes.filter(runtime => !runtimeIsEnabled(runtime, enabledFlags));
  const disabledFallbackRuntimes = fallbackRuntimes.filter(runtime => !runtimeIsEnabled(runtime, enabledFlags));

  const pickRuntime = (candidates: RuntimeIdentifier[]): RuntimeIdentifier | null => {
    for (const runtime of RUNTIME_PRIORITY) {
      if (candidates.includes(runtime) && runtimeIsEnabled(runtime, enabledFlags)) {
        return runtime;
      }
    }
    return null;
  };

  const issues: RuntimeResolutionIssue[] = [];

  const selectedNative = pickRuntime(nativeRuntimes);
  if (selectedNative) {
    return {
      runtime: selectedNative,
      availability: 'native',
      issues,
      capability,
      nativeRuntimes,
      fallbackRuntimes,
      enabledNativeRuntimes,
      enabledFallbackRuntimes,
      disabledNativeRuntimes,
      disabledFallbackRuntimes,
      enabledRuntimes: enabledFlags,
    };
  }

  const selectedFallback = pickRuntime(fallbackRuntimes);
  if (selectedFallback) {
    if (nativeRuntimes.length > 0) {
      if (disabledNativeRuntimes.length > 0) {
        issues.push({
          severity: 'warning',
          code: 'runtime.native_disabled',
          message: `Native runtime${disabledNativeRuntimes.length > 1 ? 's' : ''} ${disabledNativeRuntimes.join(', ')} disabled for ${capability.appId}.${capability.operationId}; using fallback ${selectedFallback}.`,
        });
      } else {
        issues.push({
          severity: 'warning',
          code: 'runtime.native_unavailable',
          message: `Native runtime unavailable for ${capability.appId}.${capability.operationId}; using fallback ${selectedFallback}.`,
        });
      }
    } else {
      issues.push({
        severity: 'warning',
        code: 'runtime.fallback',
        message: `Using fallback runtime ${selectedFallback} for ${capability.appId}.${capability.operationId}.`,
      });
    }

    return {
      runtime: selectedFallback,
      availability: 'fallback',
      issues,
      capability,
      nativeRuntimes,
      fallbackRuntimes,
      enabledNativeRuntimes,
      enabledFallbackRuntimes,
      disabledNativeRuntimes,
      disabledFallbackRuntimes,
      enabledRuntimes: enabledFlags,
    };
  }

  if (nativeRuntimes.length > 0) {
    if (disabledNativeRuntimes.length > 0) {
      issues.push({
        severity: 'error',
        code: 'runtime.native_disabled',
        message: `Native runtime${disabledNativeRuntimes.length > 1 ? 's are' : ' is'} disabled for ${capability.appId}.${capability.operationId}.`,
      });
    } else {
      issues.push({
        severity: 'error',
        code: 'runtime.native_unavailable',
        message: `Native runtime not available for ${capability.appId}.${capability.operationId}.`,
      });
    }
  }

  if (fallbackRuntimes.length > 0 && disabledFallbackRuntimes.length > 0) {
    issues.push({
      severity: 'error',
      code: 'runtime.fallback_disabled',
      message: `Fallback runtime${disabledFallbackRuntimes.length > 1 ? 's are' : ' is'} disabled for ${capability.appId}.${capability.operationId}.`,
    });
  }

  if (nativeRuntimes.length === 0 && fallbackRuntimes.length === 0) {
    issues.push({
      severity: 'error',
      code: 'runtime.no_capability',
      message: `No runtime support declared for ${capability.appId}.${capability.operationId}.`,
    });
  } else if (issues.length === 0) {
    issues.push({
      severity: 'error',
      code: 'runtime.no_runtime',
      message: `No runtime available for ${capability.appId}.${capability.operationId}.`,
    });
  }

  return {
    runtime: null,
    availability: 'unavailable',
    issues,
    capability,
    nativeRuntimes,
    fallbackRuntimes,
    enabledNativeRuntimes,
    enabledFallbackRuntimes,
    disabledNativeRuntimes,
    disabledFallbackRuntimes,
    enabledRuntimes: enabledFlags,
  };
}

export function getRuntimeRegistry(): Record<string, RuntimeAppOperations> {
  return getRuntimeRegistryInternal();
}

export const RUNTIME_REGISTRY: Record<string, RuntimeAppOperations> = getRuntimeRegistryInternal();

const buildOperationSummary = (entry: OperationCapability): RuntimeCapabilityOperationSummary => {
  const resolution = resolveRuntime({
    kind: entry.kind,
    appId: entry.displayAppId ?? entry.appId,
    operationId: entry.displayOperationId ?? entry.operationId,
  });

  return {
    id: entry.displayOperationId ?? entry.operationId,
    normalizedId: entry.normalizedOperationId,
    kind: entry.kind,
    nativeRuntimes: resolution.nativeRuntimes,
    fallbackRuntimes: resolution.fallbackRuntimes,
    resolvedRuntime: resolution.runtime,
    availability: resolution.availability,
    enabledNativeRuntimes: resolution.enabledNativeRuntimes,
    enabledFallbackRuntimes: resolution.enabledFallbackRuntimes,
    disabledNativeRuntimes: resolution.disabledNativeRuntimes,
    disabledFallbackRuntimes: resolution.disabledFallbackRuntimes,
    issues: resolution.issues,
  };
};

export function getRuntimeCapabilities(): RuntimeCapabilitySummary[] {
  ensureRuntimeCapabilityStore();

  const grouped = new Map<
    string,
    {
      app: string;
      normalizedAppId: string;
      actions: Set<string>;
      triggers: Set<string>;
      actionDetails: Record<string, RuntimeCapabilityOperationSummary>;
      triggerDetails: Record<string, RuntimeCapabilityOperationSummary>;
    }
  >();

  for (const entry of operationCapabilities.values()) {
    const normalizedAppId = entry.normalizedAppId;
    const appDisplay = entry.displayAppId ?? entry.appId;

    let bucket = grouped.get(normalizedAppId);
    if (!bucket) {
      bucket = {
        app: appDisplay,
        normalizedAppId,
        actions: new Set<string>(),
        triggers: new Set<string>(),
        actionDetails: {},
        triggerDetails: {},
      };
      grouped.set(normalizedAppId, bucket);
    } else if (!bucket.app) {
      bucket.app = appDisplay;
    }

    const summary = buildOperationSummary(entry);

    if (entry.kind === 'action') {
      bucket.actions.add(summary.id);
      bucket.actionDetails[summary.normalizedId] = summary;
    } else {
      bucket.triggers.add(summary.id);
      bucket.triggerDetails[summary.normalizedId] = summary;
    }
  }

  return Array.from(grouped.values())
    .map(bucket => ({
      app: bucket.app,
      normalizedAppId: bucket.normalizedAppId,
      actions: Array.from(bucket.actions).sort(),
      triggers: Array.from(bucket.triggers).sort(),
      actionDetails: bucket.actionDetails,
      triggerDetails: bucket.triggerDetails,
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

  const resolution = resolveRuntime({ kind: type, appId: app, operationId: operation });
  return resolution.availability !== 'unavailable';
}
