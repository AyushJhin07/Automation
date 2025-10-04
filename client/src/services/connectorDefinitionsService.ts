import { authStore } from '@/store/authStore';

export interface ConnectorDefinitionSummary {
  id: string;
  name: string;
  description?: string;
  category?: string;
  icon?: string;
  color?: string;
  availability?: string;
  release?: Record<string, any> | null;
  lifecycle?: Record<string, any> | null;
  actions?: Array<Record<string, any>>;
  triggers?: Array<Record<string, any>>;
  hasImplementation?: boolean;
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
      icon: payload.icon ?? payload.iconName ?? payload.logo ?? payload.iconId,
      color: payload.color ?? payload.brandColor,
      availability: payload.availability ?? payload.status,
      release: payload.release ?? null,
      lifecycle: payload.lifecycle ?? null,
      actions: Array.isArray(payload.actions) ? payload.actions : [],
      triggers: Array.isArray(payload.triggers) ? payload.triggers : [],
      hasImplementation: payload.hasImplementation ?? payload.implemented ?? true,
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
  const response = await fetch('/api/metadata/connectors', { headers });
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
