import { authStore } from '@/store/authStore';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface ConnectorFunctionDefinition {
  id: string;
  name: string;
  description?: string;
  parameters?: Record<string, any> | undefined;
  type?: string;
  kind?: string;
}

export interface ConnectorReleaseSummary {
  semver?: string;
  status?: string;
  isBeta?: boolean;
  [key: string]: any;
}

export interface ConnectorDefinitionSummary {
  id: string;
  name: string;
  category?: string;
  icon?: string;
  color?: string;
  availability?: string;
  hasImplementation: boolean;
  actions: ConnectorFunctionDefinition[];
  triggers: ConnectorFunctionDefinition[];
  release?: ConnectorReleaseSummary | null;
}

interface ConnectorListOptions {
  force?: boolean;
}

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

let cachedConnectors: { expiresAt: number; connectors: ConnectorDefinitionSummary[] } | null = null;
let inFlight: Promise<ConnectorDefinitionSummary[]> | null = null;

const CONNECTOR_ENDPOINTS = [
  '/api/metadata/connectors',
  '/api/registry/connectors?all=true',
];

const getAuthHeaders = (): Record<string, string> => {
  const token = authStore.getState().token;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token && token !== 'null' && token !== 'undefined') {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

const extractConnectorEntries = (payload: any): any[] | undefined => {
  if (!payload) {
    return undefined;
  }

  if (Array.isArray(payload.connectors)) {
    return payload.connectors;
  }

  if (Array.isArray(payload.data?.connectors)) {
    return payload.data.connectors;
  }

  if (payload.catalog?.connectors && typeof payload.catalog.connectors === 'object') {
    return Object.entries(payload.catalog.connectors).map(([appId, definition]) => ({
      id: appId,
      definition: { id: appId, ...(definition as Record<string, any>) },
      hasImplementation: Boolean((definition as Record<string, any>)?.hasImplementation),
      availability: (definition as Record<string, any>)?.availability,
    }));
  }

  return undefined;
};

const normalizeConnector = (entry: any): ConnectorDefinitionSummary | null => {
  const definition = (entry && typeof entry === 'object' ? entry.definition : undefined) || entry;
  const id = typeof definition?.id === 'string' ? definition.id : typeof entry?.id === 'string' ? entry.id : '';
  if (!id) {
    return null;
  }

  const actions = Array.isArray(definition?.actions)
    ? definition.actions
    : Array.isArray(entry?.actions)
      ? entry.actions
      : [];

  const triggers = Array.isArray(definition?.triggers)
    ? definition.triggers
    : Array.isArray(entry?.triggers)
      ? entry.triggers
      : [];

  return {
    id,
    name: typeof definition?.name === 'string' ? definition.name : typeof entry?.name === 'string' ? entry.name : id,
    category: typeof definition?.category === 'string' ? definition.category : entry?.category,
    icon: typeof definition?.icon === 'string' ? definition.icon : entry?.icon,
    color: typeof definition?.color === 'string' ? definition.color : entry?.color,
    availability: typeof entry?.availability === 'string' ? entry.availability : definition?.availability,
    hasImplementation: Boolean(entry?.hasImplementation ?? definition?.hasImplementation ?? false),
    actions: actions.filter((action: any) => action && typeof action === 'object' && typeof action.id === 'string')
      .map((action: any) => ({
        id: String(action.id),
        name: typeof action.name === 'string' ? action.name : String(action.id),
        description: typeof action.description === 'string' ? action.description : undefined,
        parameters: action.parameters && typeof action.parameters === 'object' ? action.parameters : undefined,
        type: typeof action.type === 'string' ? action.type : undefined,
        kind: typeof action.kind === 'string' ? action.kind : undefined,
      })),
    triggers: triggers.filter((trigger: any) => trigger && typeof trigger === 'object' && typeof trigger.id === 'string')
      .map((trigger: any) => ({
        id: String(trigger.id),
        name: typeof trigger.name === 'string' ? trigger.name : String(trigger.id),
        description: typeof trigger.description === 'string' ? trigger.description : undefined,
        parameters: trigger.parameters && typeof trigger.parameters === 'object' ? trigger.parameters : undefined,
        type: typeof trigger.type === 'string' ? trigger.type : undefined,
        kind: typeof trigger.kind === 'string' ? trigger.kind : undefined,
      })),
    release: definition?.release ?? entry?.release ?? null,
  };
};

const fetchConnectorDefinitions = async (): Promise<ConnectorDefinitionSummary[]> => {
  const headers = getAuthHeaders();
  const errors: Error[] = [];

  for (const endpoint of CONNECTOR_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, { headers });
      if (response.status === 404) {
        errors.push(new Error(`Connector metadata endpoint not found: ${endpoint}`));
        continue;
      }

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.success === false) {
        const errorMessage = payload?.error || `Failed to fetch connectors from ${endpoint}`;
        throw new Error(errorMessage);
      }

      const entries = extractConnectorEntries(payload);
      if (entries && entries.length > 0) {
        const normalized = entries
          .map(normalizeConnector)
          .filter((connector): connector is ConnectorDefinitionSummary => connector !== null);
        normalized.sort((a, b) => a.name.localeCompare(b.name));
        return normalized;
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.warn(`[connectorDefinitions] ${err.message}`);
      errors.push(err);
    }
  }

  if (errors.length) {
    throw errors[errors.length - 1];
  }

  return [];
};

const shouldUseCache = (options?: ConnectorListOptions): boolean => {
  if (!cachedConnectors) {
    return false;
  }
  if (options?.force) {
    return false;
  }
  return cachedConnectors.expiresAt > Date.now();
};

export const connectorDefinitionsService = {
  async list(options: ConnectorListOptions = {}): Promise<ConnectorDefinitionSummary[]> {
    if (shouldUseCache(options)) {
      return cachedConnectors!.connectors;
    }

    if (inFlight) {
      return inFlight;
    }

    inFlight = fetchConnectorDefinitions()
      .then((connectors) => {
        cachedConnectors = {
          connectors,
          expiresAt: Date.now() + CACHE_TTL,
        };
        return connectors;
      })
      .finally(() => {
        inFlight = null;
      });

    return inFlight;
  },
  clearCache(): void {
    cachedConnectors = null;
  },
};

export const useConnectorDefinitions = () => {
  const [connectors, setConnectors] = useState<ConnectorDefinitionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const isMountedRef = useRef(true);

  const refresh = useCallback(
    async (options: ConnectorListOptions = {}): Promise<ConnectorDefinitionSummary[]> => {
      setIsLoading(true);
      try {
        const result = await connectorDefinitionsService.list(options);
        if (isMountedRef.current) {
          setConnectors(result);
          setError(null);
        }
        return result;
      } catch (err) {
        const normalized = err instanceof Error ? err : new Error(String(err));
        if (isMountedRef.current) {
          setError(normalized);
        }
        throw normalized;
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    isMountedRef.current = true;
    void refresh();
    return () => {
      isMountedRef.current = false;
    };
  }, [refresh]);

  return { connectors, isLoading, error, refresh };
};
