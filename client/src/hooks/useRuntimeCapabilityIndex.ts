import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  buildRuntimeCapabilityIndex,
  createFallbackRuntimeCapabilities,
  getRuntimeCapabilities,
  mergeWithFallbackCapabilities,
  type RuntimeCapabilityIndex,
  type RuntimeCapabilityMap,
} from '@/services/runtimeCapabilitiesService';
import { useConnectorDefinitions } from './useConnectorDefinitions';

interface UseRuntimeCapabilityIndexResult {
  capabilities: RuntimeCapabilityMap;
  index: RuntimeCapabilityIndex;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export const useRuntimeCapabilityIndex = (): UseRuntimeCapabilityIndexResult => {
  const { data: connectorDefinitions, loading: connectorDefinitionsLoading, error: connectorDefinitionsError } =
    useConnectorDefinitions();
  const [capabilities, setCapabilities] = useState<RuntimeCapabilityMap>(() => createFallbackRuntimeCapabilities());
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const loaded = await getRuntimeCapabilities();
      setCapabilities(mergeWithFallbackCapabilities(loaded));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setCapabilities(createFallbackRuntimeCapabilities());
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const index = useMemo(
    () => buildRuntimeCapabilityIndex(capabilities, connectorDefinitions ?? null),
    [capabilities, connectorDefinitions],
  );

  const combinedLoading = loading || connectorDefinitionsLoading;
  const combinedError = error ?? (connectorDefinitionsError ? connectorDefinitionsError.message : null);

  return {
    capabilities,
    index,
    loading: combinedLoading,
    error: combinedError,
    refresh,
  };
};
