import { normalizeConnectorId } from '@/services/connectorDefinitionsService';
import type { ConnectorDefinitionMap } from '@/services/connectorDefinitionsService';
import { ALL_RUNTIMES, type RuntimeKey } from '@shared/runtimes';

export const RUNTIME_WILDCARD = '*';

export type RuntimeOperationKind = 'action' | 'trigger';
export type RuntimeCapabilityIssue = 'missing-app' | 'missing-operation';

export type RuntimeCapabilityMode = 'native' | 'fallback' | 'unavailable';

export interface RuntimeCapabilityEntry {
  appId: string;
  actions: Record<string, RuntimeCapabilityOperationStatus>;
  triggers: Record<string, RuntimeCapabilityOperationStatus>;
}

export type RuntimeCapabilityMap = Record<string, RuntimeCapabilityEntry>;

export interface RuntimeCapabilityIssueDetail {
  severity: 'error' | 'warning';
  code: string;
  message: string;
}

export interface RuntimeCapabilityOperationStatus extends RuntimeCapabilityCheckResult {
  appId: string;
  kind: RuntimeOperationKind;
  operationId: string;
  mode: RuntimeCapabilityMode;
  nativeSupported: boolean;
  fallbackRuntime?: RuntimeKey;
  nativeRuntimes?: RuntimeKey[];
  fallbackRuntimes?: RuntimeKey[];
  enabledNativeRuntimes?: RuntimeKey[];
  enabledFallbackRuntimes?: RuntimeKey[];
  disabledNativeRuntimes?: RuntimeKey[];
  disabledFallbackRuntimes?: RuntimeKey[];
  resolvedRuntime?: RuntimeKey | null;
  availability?: RuntimeCapabilityMode;
  issues?: RuntimeCapabilityIssueDetail[];
}

export interface RuntimeCapabilityIndexEntry {
  appId: string;
  actions: Record<string, RuntimeCapabilityOperationStatus>;
  triggers: Record<string, RuntimeCapabilityOperationStatus>;
}

export type RuntimeCapabilityIndex = Record<string, RuntimeCapabilityIndexEntry>;

export interface RuntimeCapabilityCheckResult {
  supported: boolean;
  issue?: RuntimeCapabilityIssue;
  normalizedAppId?: string;
  normalizedOperationId?: string;
}

const CACHE_DURATION_MS = 60 * 1000;

const DEFAULT_FALLBACK_RUNTIME: RuntimeKey = 'node';

let cachedCapabilities: RuntimeCapabilityMap | null = null;
let cacheExpiresAt = 0;
let inFlightRequest: Promise<RuntimeCapabilityMap> | null = null;

const RUNTIME_KEY_SET = new Set<RuntimeKey>(ALL_RUNTIMES);

const normalizeRuntimeKeyValue = (value: unknown): RuntimeKey | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  if (RUNTIME_KEY_SET.has(trimmed as RuntimeKey)) {
    return trimmed as RuntimeKey;
  }

  const normalized = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '');
  switch (normalized) {
    case 'node':
    case 'nodejs':
      return 'node';
    case 'appsscript':
    case 'appscriptautomation':
      return 'appsScript';
    case 'cloudworker':
      return 'cloudWorker';
    default:
      return undefined;
  }
};

const normalizeRuntimeKeyList = (value: unknown): RuntimeKey[] => {
  if (!value) {
    return [];
  }

  const runtimes = new Set<RuntimeKey>();

  const assign = (candidate: unknown) => {
    const runtime = normalizeRuntimeKeyValue(candidate);
    if (runtime) {
      runtimes.add(runtime);
    }
  };

  if (Array.isArray(value)) {
    value.forEach(assign);
  } else if (typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach(assign);
  } else {
    assign(value);
  }

  return Array.from(runtimes);
};

const createDefaultOperationStatus = (
  appId: string,
  kind: RuntimeOperationKind,
  operationId: string,
): RuntimeCapabilityOperationStatus => ({
  appId,
  kind,
  operationId,
  supported: true,
  issue: undefined,
  normalizedAppId: appId,
  normalizedOperationId: operationId,
  mode: 'native',
  nativeSupported: true,
});

const createWildcardStatus = (
  appId: string,
  kind: RuntimeOperationKind,
): RuntimeCapabilityOperationStatus => ({
  ...createDefaultOperationStatus(appId, kind, RUNTIME_WILDCARD),
  availability: 'native',
  resolvedRuntime: 'node',
  nativeRuntimes: ['node'],
  enabledNativeRuntimes: ['node'],
});

const cloneCapabilityStatus = (
  appId: string,
  kind: RuntimeOperationKind,
  operationId: string,
  status?: RuntimeCapabilityOperationStatus,
): RuntimeCapabilityOperationStatus => {
  const normalizedOperationId = normalizeRuntimeOperationId(
    status?.normalizedOperationId ?? status?.operationId ?? operationId,
  ) ?? normalizeRuntimeOperationId(operationId) ?? RUNTIME_WILDCARD;

  const base = createDefaultOperationStatus(appId, kind, normalizedOperationId);

  if (!status || typeof status !== 'object') {
    return base;
  }

  const cloned: RuntimeCapabilityOperationStatus = {
    ...base,
    ...status,
    appId: status.appId ?? base.appId,
    kind: status.kind ?? base.kind,
    operationId: status.operationId ?? normalizedOperationId,
    normalizedAppId: status.normalizedAppId ?? base.normalizedAppId,
    normalizedOperationId: status.normalizedOperationId ?? normalizedOperationId,
  };

  return cloned;
};

const cloneCapabilityBucket = (
  appId: string,
  kind: RuntimeOperationKind,
  bucket: unknown,
): Record<string, RuntimeCapabilityOperationStatus> => {
  const normalized: Record<string, RuntimeCapabilityOperationStatus> = {};

  const assignFromOperationId = (operationId: unknown) => {
    if (typeof operationId !== 'string') {
      return;
    }
    const normalizedId = normalizeRuntimeOperationId(operationId) ?? RUNTIME_WILDCARD;
    normalized[normalizedId] = cloneCapabilityStatus(appId, kind, normalizedId);
  };

  const assignFromStatus = (
    operationId: string | undefined,
    status: RuntimeCapabilityOperationStatus | undefined,
  ) => {
    const key =
      normalizeRuntimeOperationId(operationId) ??
      normalizeRuntimeOperationId(status?.normalizedOperationId) ??
      normalizeRuntimeOperationId(status?.operationId) ??
      RUNTIME_WILDCARD;
    normalized[key] = cloneCapabilityStatus(appId, kind, key, status);
  };

  if (!bucket) {
    return normalized;
  }

  if (bucket instanceof Set) {
    bucket.forEach(assignFromOperationId);
    return normalized;
  }

  if (bucket instanceof Map) {
    bucket.forEach((value, key) => {
      if (value && typeof value === 'object') {
        assignFromStatus(typeof key === 'string' ? key : undefined, value as RuntimeCapabilityOperationStatus);
      } else {
        assignFromOperationId(key);
      }
    });
    return normalized;
  }

  if (Array.isArray(bucket)) {
    bucket.forEach((entry) => {
      if (!entry) {
        return;
      }
      if (typeof entry === 'string') {
        assignFromOperationId(entry);
        return;
      }
      if (typeof entry === 'object') {
        const status = entry as RuntimeCapabilityOperationStatus;
        assignFromStatus(status.operationId ?? status.normalizedOperationId, status);
      }
    });
    return normalized;
  }

  if (typeof bucket === 'object') {
    Object.entries(bucket as Record<string, any>).forEach(([key, value]) => {
      if (value && typeof value === 'object' && 'supported' in (value as Record<string, any>)) {
        assignFromStatus(key, value as RuntimeCapabilityOperationStatus);
      } else {
        assignFromOperationId(key);
      }
    });
  }

  return normalized;
};

const cloneCapabilityEntry = (entry: RuntimeCapabilityEntry): RuntimeCapabilityEntry => ({
  appId: entry.appId,
  actions: cloneCapabilityBucket(entry.appId, 'action', entry.actions),
  triggers: cloneCapabilityBucket(entry.appId, 'trigger', entry.triggers),
});

const cloneCapabilityMap = (map: RuntimeCapabilityMap): RuntimeCapabilityMap => {
  const cloned: RuntimeCapabilityMap = {};
  for (const [appId, entry] of Object.entries(map)) {
    cloned[appId] = cloneCapabilityEntry(entry);
  }
  return cloned;
};

export const createFallbackRuntimeCapabilities = (): RuntimeCapabilityMap => ({
  core: {
    appId: 'core',
    actions: { [RUNTIME_WILDCARD]: createWildcardStatus('core', 'action') },
    triggers: { [RUNTIME_WILDCARD]: createWildcardStatus('core', 'trigger') },
  },
  'built-in': {
    appId: 'built-in',
    actions: { [RUNTIME_WILDCARD]: createWildcardStatus('built-in', 'action') },
    triggers: { [RUNTIME_WILDCARD]: createWildcardStatus('built-in', 'trigger') },
  },
  time: {
    appId: 'time',
    actions: { [RUNTIME_WILDCARD]: createWildcardStatus('time', 'action') },
    triggers: { [RUNTIME_WILDCARD]: createWildcardStatus('time', 'trigger') },
  },
});

export const mergeWithFallbackCapabilities = (
  runtime: RuntimeCapabilityMap | null | undefined,
): RuntimeCapabilityMap => {
  const merged = createFallbackRuntimeCapabilities();

  if (!runtime) {
    return merged;
  }

  for (const [appId, entry] of Object.entries(runtime)) {
    if (!appId) continue;
    merged[appId] = cloneCapabilityEntry(entry);
  }

  return merged;
};

export const normalizeRuntimeOperationId = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed.toLowerCase();
};

export const normalizeRuntimeAppId = (value: unknown): string => {
  if (typeof value !== 'string') {
    return '';
  }
  return normalizeConnectorId(value);
};

const normalizeOperationList = (raw: unknown): Set<string> => {
  const normalized = new Set<string>();

  if (!raw) {
    return normalized;
  }

  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (entry === '*') {
        normalized.add(RUNTIME_WILDCARD);
        continue;
      }

      if (typeof entry === 'string') {
        const normalizedId = normalizeRuntimeOperationId(entry);
        if (normalizedId) {
          normalized.add(normalizedId);
        }
        continue;
      }

      if (entry && typeof entry === 'object') {
        const possibleId =
          (entry as Record<string, any>).id ??
          (entry as Record<string, any>).key ??
          (entry as Record<string, any>).slug ??
          (entry as Record<string, any>).operationId ??
          (entry as Record<string, any>).name;

        const normalizedId = normalizeRuntimeOperationId(possibleId);
        if (normalizedId) {
          normalized.add(normalizedId);
        }
      }
    }

    return normalized;
  }

  if (typeof raw === 'object') {
    Object.keys(raw as Record<string, any>).forEach((key) => {
      const normalizedId = normalizeRuntimeOperationId(key);
      if (normalizedId) {
        normalized.add(normalizedId);
      }
    });
    return normalized;
  }

  if (typeof raw === 'string') {
    const normalizedId = normalizeRuntimeOperationId(raw);
    if (normalizedId) {
      normalized.add(normalizedId);
    }
  }

  return normalized;
};

const normalizeCapabilityPayload = (raw: unknown): RuntimeCapabilityMap => {
  const normalized: RuntimeCapabilityMap = {};

  const ensureEntry = (appId: string): RuntimeCapabilityEntry => {
    if (!normalized[appId]) {
      normalized[appId] = {
        appId,
        actions: {},
        triggers: {},
      };
    }
    return normalized[appId];
  };

  const assignStatus = (
    entry: RuntimeCapabilityEntry,
    kind: RuntimeOperationKind,
    status: RuntimeCapabilityOperationStatus,
  ) => {
    const bucket = kind === 'trigger' ? entry.triggers : entry.actions;
    const key = status.normalizedOperationId ?? status.operationId;
    bucket[key] = status;
  };

  const buildStatusFromSummary = (
    appId: string,
    kind: RuntimeOperationKind,
    summary: Record<string, any>,
  ): RuntimeCapabilityOperationStatus => {
    const normalizedId =
      normalizeRuntimeOperationId(summary.normalizedId ?? summary.id ?? summary.operationId) ??
      RUNTIME_WILDCARD;
    const nativeRuntimes = normalizeRuntimeKeyList(summary.nativeRuntimes);
    const fallbackRuntimes = normalizeRuntimeKeyList(summary.fallbackRuntimes);
    const enabledNativeRuntimes = normalizeRuntimeKeyList(summary.enabledNativeRuntimes);
    const enabledFallbackRuntimes = normalizeRuntimeKeyList(summary.enabledFallbackRuntimes);
    const disabledNativeRuntimes = normalizeRuntimeKeyList(summary.disabledNativeRuntimes);
    const disabledFallbackRuntimes = normalizeRuntimeKeyList(summary.disabledFallbackRuntimes);
    const availabilityRaw = typeof summary.availability === 'string' ? summary.availability : undefined;
    const availability: RuntimeCapabilityMode =
      availabilityRaw === 'native' || availabilityRaw === 'fallback' || availabilityRaw === 'unavailable'
        ? availabilityRaw
        : enabledNativeRuntimes.length > 0
        ? 'native'
        : enabledFallbackRuntimes.length > 0
        ? 'fallback'
        : 'unavailable';
    const resolvedRuntime = normalizeRuntimeKeyValue(summary.resolvedRuntime) ?? null;
    const fallbackRuntime =
      availability === 'fallback'
        ? normalizeRuntimeKeyValue(summary.fallbackRuntime) ??
          resolvedRuntime ??
          enabledFallbackRuntimes[0] ??
          fallbackRuntimes[0] ??
          DEFAULT_FALLBACK_RUNTIME
        : undefined;
    const supported = availability !== 'unavailable';
    const nativeSupported =
      typeof summary.nativeSupported === 'boolean'
        ? summary.nativeSupported
        : enabledNativeRuntimes.length > 0;

    const issues = Array.isArray(summary.issues)
      ? (summary.issues as Array<Record<string, any>>).map((issue) => ({
          severity: issue?.severity === 'warning' ? 'warning' : 'error',
          code: typeof issue?.code === 'string' ? issue.code : 'runtime.issue',
          message: typeof issue?.message === 'string' ? issue.message : '',
        }))
      : undefined;

    return {
      appId,
      kind,
      operationId: normalizedId,
      supported,
      issue: supported ? undefined : 'missing-operation',
      normalizedAppId: appId,
      normalizedOperationId: normalizedId,
      mode: availability,
      nativeSupported,
      fallbackRuntime,
      nativeRuntimes,
      fallbackRuntimes,
      enabledNativeRuntimes,
      enabledFallbackRuntimes,
      disabledNativeRuntimes,
      disabledFallbackRuntimes,
      resolvedRuntime,
      availability,
      issues,
    };
  };

  const assignLegacyOperations = (
    entry: RuntimeCapabilityEntry,
    kind: RuntimeOperationKind,
    source: unknown,
  ) => {
    const operations = normalizeOperationList(source);
    if (operations.size === 0) {
      return;
    }

    const bucket = kind === 'trigger' ? entry.triggers : entry.actions;
    operations.forEach((operationId) => {
      if (bucket[operationId]) {
        return;
      }
      assignStatus(entry, kind, createDefaultOperationStatus(entry.appId, kind, operationId));
    });
  };

  const assignFromPayload = (payload: Record<string, any>) => {
    const appId = normalizeRuntimeAppId(
      payload.app ?? payload.application ?? payload.appId ?? payload.id ?? payload.slug ?? payload.connectorId,
    );
    if (!appId) {
      return;
    }

    const entry = ensureEntry(appId);

    if (payload.actionDetails && typeof payload.actionDetails === 'object') {
      Object.values(payload.actionDetails as Record<string, any>).forEach((detail) => {
        if (!detail || typeof detail !== 'object') {
          return;
        }
        assignStatus(entry, 'action', buildStatusFromSummary(appId, 'action', detail as Record<string, any>));
      });
    }

    if (payload.triggerDetails && typeof payload.triggerDetails === 'object') {
      Object.values(payload.triggerDetails as Record<string, any>).forEach((detail) => {
        if (!detail || typeof detail !== 'object') {
          return;
        }
        assignStatus(entry, 'trigger', buildStatusFromSummary(appId, 'trigger', detail as Record<string, any>));
      });
    }

    assignLegacyOperations(entry, 'action', payload.actions);
    assignLegacyOperations(entry, 'trigger', payload.triggers);
  };

  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }
      assignFromPayload(entry as Record<string, any>);
    }
    return normalized;
  }

  if (raw && typeof raw === 'object') {
    Object.entries(raw as Record<string, any>).forEach(([key, value]) => {
      if (!value || typeof value !== 'object') {
        return;
      }
      assignFromPayload({ ...(value as Record<string, any>), id: key });
    });
    return normalized;
  }

  return normalized;
};

const fetchRuntimeCapabilities = async (): Promise<RuntimeCapabilityMap> => {
  const response = await fetch('/api/registry/capabilities');
  if (!response.ok) {
    throw new Error(`Failed to load runtime capabilities (${response.status})`);
  }

  const payload = await response.json().catch(() => ({}));
  const capabilities =
    payload?.capabilities ?? payload?.data?.capabilities ?? payload?.data ?? payload?.results ?? payload;

  return normalizeCapabilityPayload(capabilities);
};

export const getRuntimeCapabilities = async (forceRefresh = false): Promise<RuntimeCapabilityMap> => {
  const now = Date.now();

  if (!forceRefresh && cachedCapabilities && cacheExpiresAt > now) {
    return cloneCapabilityMap(cachedCapabilities);
  }

  if (inFlightRequest) {
    return inFlightRequest.then(cloneCapabilityMap);
  }

  inFlightRequest = (async () => {
    try {
      const runtime = await fetchRuntimeCapabilities();
      cachedCapabilities = runtime;
      cacheExpiresAt = Date.now() + CACHE_DURATION_MS;
      return runtime;
    } finally {
      inFlightRequest = null;
    }
  })();

  try {
    const resolved = await inFlightRequest;
    return cloneCapabilityMap(resolved);
  } catch (error) {
    cachedCapabilities = null;
    cacheExpiresAt = 0;
    throw error;
  }
};

export const checkRuntimeCapability = (
  map: RuntimeCapabilityMap | null | undefined,
  appId: string,
  kind: RuntimeOperationKind,
  operationId?: string | null,
): RuntimeCapabilityCheckResult => {
  const normalizedAppId = normalizeRuntimeAppId(appId);
  if (!normalizedAppId) {
    return { supported: true };
  }

  const capabilities = map?.[normalizedAppId];
  if (!capabilities) {
    return { supported: false, issue: 'missing-app', normalizedAppId };
  }

  const bucket = kind === 'trigger' ? capabilities.triggers : capabilities.actions;
  const normalizedOperationId = normalizeRuntimeOperationId(operationId);

  if (normalizedOperationId) {
    const status = bucket[normalizedOperationId];
    if (status) {
      return status;
    }
  }

  const wildcardStatus = bucket[RUNTIME_WILDCARD];
  if (wildcardStatus) {
    return wildcardStatus;
  }

  if (!normalizedOperationId) {
    const hasAny = Object.keys(bucket).length > 0;
    return hasAny
      ? {
          ...createDefaultOperationStatus(normalizedAppId, kind, RUNTIME_WILDCARD),
          normalizedAppId,
          normalizedOperationId: RUNTIME_WILDCARD,
        }
      : { supported: false, issue: 'missing-operation', normalizedAppId };
  }

  return {
    supported: false,
    issue: 'missing-operation',
    normalizedAppId,
    normalizedOperationId,
  };
};

export const resetRuntimeCapabilitiesCache = () => {
  cachedCapabilities = null;
  cacheExpiresAt = 0;
  inFlightRequest = null;
};

const ensureIndexEntry = (
  index: RuntimeCapabilityIndex,
  appId: string,
): RuntimeCapabilityIndexEntry => {
  if (!index[appId]) {
    index[appId] = {
      appId,
      actions: {},
      triggers: {},
    };
  }
  return index[appId];
};

const assignOperationStatus = (
  index: RuntimeCapabilityIndex,
  capabilities: RuntimeCapabilityMap | null | undefined,
  appId: string,
  kind: RuntimeOperationKind,
  operationId?: string | null,
  options?: {
    preferFallback?: boolean;
    fallbackRuntime?: RuntimeKey;
  },
) => {
  const normalizedAppId = normalizeRuntimeAppId(appId);
  if (!normalizedAppId) {
    return;
  }

  const entry = ensureIndexEntry(index, normalizedAppId);
  const bucket = kind === 'trigger' ? entry.triggers : entry.actions;

  const capability = checkRuntimeCapability(capabilities ?? {}, normalizedAppId, kind, operationId);
  const normalizedOperationId =
    capability.normalizedOperationId ?? normalizeRuntimeOperationId(operationId) ?? RUNTIME_WILDCARD;

  const baseStatus: RuntimeCapabilityOperationStatus = {
    appId: normalizedAppId,
    kind,
    operationId: normalizedOperationId,
    supported: capability.supported,
    issue: capability.issue,
    normalizedAppId: capability.normalizedAppId ?? normalizedAppId,
    normalizedOperationId,
    mode: capability.supported ? 'native' : 'unavailable',
    nativeSupported: capability.supported,
  };

  const mergedStatus: RuntimeCapabilityOperationStatus = {
    ...baseStatus,
    ...(capability as RuntimeCapabilityOperationStatus),
  };

  if (!mergedStatus.supported && options?.preferFallback && mergedStatus.mode === 'unavailable') {
    mergedStatus.supported = true;
    mergedStatus.mode = 'fallback';
    mergedStatus.fallbackRuntime = options.fallbackRuntime ?? DEFAULT_FALLBACK_RUNTIME;
  }

  bucket[normalizedOperationId] = mergedStatus;
};

const addConnectorDefinitionOperations = (
  index: RuntimeCapabilityIndex,
  capabilities: RuntimeCapabilityMap | null | undefined,
  definitions: ConnectorDefinitionMap | null | undefined,
) => {
  if (!definitions) {
    return;
  }

  Object.entries(definitions).forEach(([appId, definition]) => {
    if (!appId || !definition) {
      return;
    }

    const normalizedAppId = normalizeRuntimeAppId(appId);
    if (!normalizedAppId) {
      return;
    }

    ensureIndexEntry(index, normalizedAppId);

    const fallbackEligible = definition?.hasImplementation !== false;

    const visit = (
      kind: RuntimeOperationKind,
      list: Array<{ id?: string | null }> | undefined,
    ) => {
      if (!Array.isArray(list)) {
        return;
      }

      list.forEach((entry) => {
        if (!entry) {
          return;
        }
        assignOperationStatus(index, capabilities, normalizedAppId, kind, entry.id ?? undefined, {
          preferFallback: fallbackEligible,
          fallbackRuntime: fallbackEligible ? DEFAULT_FALLBACK_RUNTIME : undefined,
        });
      });
    };

    visit('action', definition.actions);
    visit('trigger', definition.triggers);
  });
};

export const buildRuntimeCapabilityIndex = (
  capabilities: RuntimeCapabilityMap | null | undefined,
  connectorDefinitions?: ConnectorDefinitionMap | null,
): RuntimeCapabilityIndex => {
  const index: RuntimeCapabilityIndex = {};

  if (capabilities) {
    Object.entries(capabilities).forEach(([appId, entry]) => {
      if (!appId || !entry) {
        return;
      }

      const normalizedAppId = normalizeRuntimeAppId(appId);
      if (!normalizedAppId) {
        return;
      }

      ensureIndexEntry(index, normalizedAppId);

      Object.keys(entry.actions).forEach((operationId) => {
        assignOperationStatus(index, capabilities, normalizedAppId, 'action', operationId);
      });
      Object.keys(entry.triggers).forEach((operationId) => {
        assignOperationStatus(index, capabilities, normalizedAppId, 'trigger', operationId);
      });
    });
  }

  addConnectorDefinitionOperations(index, capabilities, connectorDefinitions ?? null);

  return index;
};

export const getRuntimeCapabilityStatus = (
  index: RuntimeCapabilityIndex | null | undefined,
  appId: string,
  kind: RuntimeOperationKind,
  operationId?: string | null,
): RuntimeCapabilityOperationStatus | undefined => {
  if (!index) {
    return undefined;
  }

  const normalizedAppId = normalizeRuntimeAppId(appId);
  if (!normalizedAppId) {
    return undefined;
  }

  const entry = index[normalizedAppId];
  if (!entry) {
    return undefined;
  }

  const bucket = kind === 'trigger' ? entry.triggers : entry.actions;
  const normalizedOperationId = normalizeRuntimeOperationId(operationId) ?? RUNTIME_WILDCARD;

  return bucket[normalizedOperationId] ?? bucket[RUNTIME_WILDCARD];
};
