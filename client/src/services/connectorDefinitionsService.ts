import { authStore } from '@/store/authStore';

export interface ConnectorActionSummary {
  id: string;
  name: string;
  description?: string;
  params?: Record<string, any>;
}

export interface ConnectorDefinitionSummary {
  id: string;
  name: string;
  description?: string;
  category?: string;
  categories?: string[];
  icon?: string;
  color?: string;
  availability?: string;
  release?: Record<string, any> | null;
  lifecycle?: Record<string, any> | null;
  actions?: ConnectorActionSummary[];
  triggers?: ConnectorActionSummary[];
  hasImplementation?: boolean;
  authentication?: { type?: string; config?: Record<string, any> } | null;
  scopes?: string[];
}

export type ConnectorDefinitionMap = Record<string, ConnectorDefinitionSummary>;

const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

let cachedDefinitions: ConnectorDefinitionMap | null = null;
let cacheExpiresAt = 0;
let inFlightRequest: Promise<ConnectorDefinitionMap> | null = null;

export const normalizeConnectorId = (value: string | undefined | null): string => {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');
};

const buildHeaders = (): HeadersInit => {
  const { token, activeOrganizationId } = authStore.getState();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (token && token !== 'null' && token !== 'undefined') {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (activeOrganizationId) {
    headers['X-Organization-Id'] = activeOrganizationId;
  }

  return headers;
};

const clonePlainObject = <T = Record<string, any>>(value: any): T | undefined => {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  return { ...(value as Record<string, any>) } as T;
};

const normalizeFunctionList = (list: any): ConnectorActionSummary[] => {
  if (!Array.isArray(list)) {
    return [];
  }

  const result: ConnectorActionSummary[] = [];

  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const actionId = entry.id ?? entry.slug ?? entry.operationId;
    if (!actionId) continue;

    result.push({
      id: String(actionId),
      name: String(entry.name ?? entry.displayName ?? actionId),
      description: typeof entry.description === 'string' ? entry.description : undefined,
      params: clonePlainObject(entry.params ?? entry.parameters ?? entry.schema ?? {}),
    });
  }

  return result;
};

const extractScopes = (payload: any): string[] | undefined => {
  const scopes = new Set<string>();

  const addScopes = (value: unknown) => {
    if (!Array.isArray(value)) return;
    for (const entry of value) {
      if (typeof entry === 'string' && entry.trim().length > 0) {
        scopes.add(entry.trim());
      }
    }
  };

  addScopes(payload?.scopes);
  addScopes(payload?.authentication?.config?.scopes);

  return scopes.size > 0 ? Array.from(scopes) : undefined;
};

const cloneAuthentication = (auth: any): { type?: string; config?: Record<string, any> } | null => {
  if (!auth || typeof auth !== 'object') {
    return null;
  }

  const cloned: { type?: string; config?: Record<string, any> } = {};
  if (typeof auth.type === 'string') {
    cloned.type = auth.type;
  }
  if (auth.config && typeof auth.config === 'object') {
    cloned.config = { ...(auth.config as Record<string, any>) };
  }
  return cloned;
};

const normalizeConnectorPayload = (raw: any): ConnectorDefinitionMap => {
  const map: ConnectorDefinitionMap = {};

  const assign = (id: string, payload: Record<string, any>) => {
    const normalizedId = normalizeConnectorId(id);
    if (!normalizedId) return;

    const base: ConnectorDefinitionSummary = {
      id: payload.id ?? id ?? normalizedId,
      name: payload.name ?? payload.displayName ?? payload.id ?? id ?? normalizedId,
      description: payload.description ?? payload.summary,
      category: payload.category ?? payload.categoryName ?? payload.vertical,
      categories: Array.isArray(payload.categories)
        ? payload.categories
            .map((entry: unknown) => (typeof entry === 'string' ? entry.trim() : ''))
            .filter((entry): entry is string => Boolean(entry))
        : undefined,
      icon: payload.icon ?? payload.iconName ?? payload.logo ?? payload.iconId,
      color: payload.color ?? payload.brandColor,
      availability: payload.availability ?? payload.status,
      release: payload.release ?? null,
      lifecycle: payload.lifecycle ?? null,
      actions: normalizeFunctionList(payload.actions),
      triggers: normalizeFunctionList(payload.triggers),
      hasImplementation: payload.hasImplementation ?? payload.implemented ?? true,
      authentication: cloneAuthentication(payload.authentication),
      scopes: extractScopes(payload),
    };

    map[normalizedId] = base;
  };

  if (Array.isArray(raw)) {
    raw.forEach((entry: any) => {
      if (!entry || typeof entry !== 'object') return;
      const id = entry.id ?? entry.slug ?? entry.connectorId;
      if (!id) return;
      assign(id, entry);
    });
    return map;
  }

  if (raw && typeof raw === 'object') {
    Object.entries(raw).forEach(([id, value]) => {
      if (!value || typeof value !== 'object') return;
      assign((value as Record<string, any>).id ?? id, value as Record<string, any>);
    });
    return map;
  }

  throw new Error('Unsupported connector definition payload format');
};

const fetchFromMetadataEndpoint = async (headers: HeadersInit): Promise<ConnectorDefinitionMap> => {
  const response = await fetch('/api/metadata/v1/connectors', { headers });
  if (!response.ok) {
    throw new Error(`Failed to fetch connector metadata (${response.status})`);
  }

  const payload = await response.json();
  const connectors = payload?.connectors ?? payload?.data?.connectors;
  if (!connectors) {
    throw new Error('Connector metadata payload is missing connectors');
  }

  return normalizeConnectorPayload(connectors);
};

const fetchFromRegistryCatalog = async (headers: HeadersInit): Promise<ConnectorDefinitionMap> => {
  const response = await fetch('/api/registry/catalog?implemented=true', { headers });
  if (!response.ok) {
    throw new Error(`Failed to fetch registry catalog (${response.status})`);
  }

  const payload = await response.json();
  if (!payload?.success) {
    throw new Error(payload?.error ?? 'Failed to fetch registry catalog');
  }

  const connectors = payload?.catalog?.connectors ?? {};
  return normalizeConnectorPayload(connectors);
};

export const getConnectorDefinitions = async (forceRefresh = false): Promise<ConnectorDefinitionMap> => {
  const now = Date.now();

  if (!forceRefresh && cachedDefinitions && cacheExpiresAt > now) {
    return cachedDefinitions;
  }

  if (inFlightRequest) {
    return inFlightRequest;
  }

  const headers = buildHeaders();

  inFlightRequest = (async () => {
    try {
      const definitions = await fetchFromMetadataEndpoint(headers);
      cachedDefinitions = definitions;
      cacheExpiresAt = Date.now() + CACHE_DURATION_MS;
      return definitions;
    } catch (error) {
      console.warn('[ConnectorDefinitionsService] Falling back to registry catalog:', error);
      const definitions = await fetchFromRegistryCatalog(headers);
      cachedDefinitions = definitions;
      cacheExpiresAt = Date.now() + CACHE_DURATION_MS;
      return definitions;
    } finally {
      inFlightRequest = null;
    }
  })();

  return inFlightRequest;
};

export const invalidateConnectorDefinitionsCache = () => {
  cachedDefinitions = null;
  cacheExpiresAt = 0;
  inFlightRequest = null;
};
