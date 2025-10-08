import { normalizeConnectorId } from '@/services/connectorDefinitionsService';
import type { ConnectorDefinitionMap } from '@/services/connectorDefinitionsService';

export const RUNTIME_WILDCARD = '*';

export type RuntimeOperationKind = 'action' | 'trigger';
export type RuntimeCapabilityIssue = 'missing-app' | 'missing-operation';

export interface RuntimeCapabilityEntry {
  appId: string;
  actions: Set<string>;
  triggers: Set<string>;
}

export type RuntimeCapabilityMap = Record<string, RuntimeCapabilityEntry>;

export interface RuntimeCapabilityOperationStatus extends RuntimeCapabilityCheckResult {
  appId: string;
  kind: RuntimeOperationKind;
  operationId: string;
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

let cachedCapabilities: RuntimeCapabilityMap | null = null;
let cacheExpiresAt = 0;
let inFlightRequest: Promise<RuntimeCapabilityMap> | null = null;

const cloneCapabilityEntry = (entry: RuntimeCapabilityEntry): RuntimeCapabilityEntry => ({
  appId: entry.appId,
  actions: new Set(entry.actions),
  triggers: new Set(entry.triggers),
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
    actions: new Set([RUNTIME_WILDCARD]),
    triggers: new Set([RUNTIME_WILDCARD]),
  },
  'built-in': {
    appId: 'built-in',
    actions: new Set([RUNTIME_WILDCARD]),
    triggers: new Set([RUNTIME_WILDCARD]),
  },
  time: {
    appId: 'time',
    actions: new Set([RUNTIME_WILDCARD]),
    triggers: new Set([RUNTIME_WILDCARD]),
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

  const assignEntry = (appId: unknown, payload: any) => {
    const normalizedAppId = normalizeRuntimeAppId(appId);
    if (!normalizedAppId) {
      return;
    }

    const actions = normalizeOperationList(payload?.actions);
    const triggers = normalizeOperationList(payload?.triggers);

    normalized[normalizedAppId] = {
      appId: normalizedAppId,
      actions,
      triggers,
    };
  };

  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }
      const value = entry as Record<string, any>;
      const appId =
        value.app ?? value.application ?? value.appId ?? value.id ?? value.slug ?? value.connectorId;
      assignEntry(appId, value);
    }
    return normalized;
  }

  if (raw && typeof raw === 'object') {
    Object.entries(raw as Record<string, any>).forEach(([key, value]) => {
      if (!value || typeof value !== 'object') {
        return;
      }
      const payload = value as Record<string, any>;
      const appId = payload.app ?? payload.application ?? payload.appId ?? payload.id ?? key;
      assignEntry(appId, payload);
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
  if (bucket.has(RUNTIME_WILDCARD)) {
    return { supported: true, normalizedAppId };
  }

  const normalizedOperationId = normalizeRuntimeOperationId(operationId);
  if (!normalizedOperationId) {
    return { supported: bucket.size > 0, normalizedAppId };
  }

  if (bucket.has(normalizedOperationId)) {
    return { supported: true, normalizedAppId, normalizedOperationId };
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

  bucket[normalizedOperationId] = {
    appId: normalizedAppId,
    kind,
    operationId: normalizedOperationId,
    supported: capability.supported,
    issue: capability.issue,
    normalizedAppId: capability.normalizedAppId ?? normalizedAppId,
    normalizedOperationId,
  };
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

    const visit = (kind: RuntimeOperationKind, list: Array<{ id?: string | null }> | undefined) => {
      if (!Array.isArray(list)) {
        return;
      }

      list.forEach((entry) => {
        if (!entry) {
          return;
        }
        assignOperationStatus(index, capabilities, normalizedAppId, kind, entry.id ?? undefined);
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

      entry.actions.forEach((operationId) => {
        assignOperationStatus(index, capabilities, normalizedAppId, 'action', operationId);
      });
      entry.triggers.forEach((operationId) => {
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
