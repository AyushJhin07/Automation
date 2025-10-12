import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  buildRuntimeCapabilityIndex,
  createFallbackRuntimeCapabilities,
  getRuntimeCapabilities,
  getRuntimeEnvironmentInfo,
  mergeWithFallbackCapabilities,
  type RuntimeCapabilityIndex,
  type RuntimeCapabilityMap,
  type RuntimeEnvironmentInfo,
} from '@/services/runtimeCapabilitiesService';
import { useConnectorDefinitions } from './useConnectorDefinitions';

interface UseRuntimeCapabilityIndexResult {
  capabilities: RuntimeCapabilityMap;
  index: RuntimeCapabilityIndex;
  loading: boolean;
  error: string | null;
  refresh: (forceRefresh?: boolean) => Promise<void>;
  environment: RuntimeEnvironmentInfo;
}

export const useRuntimeCapabilityIndex = (): UseRuntimeCapabilityIndexResult => {
  const { data: connectorDefinitions, loading: connectorDefinitionsLoading, error: connectorDefinitionsError } =
    useConnectorDefinitions();
  const [capabilities, setCapabilities] = useState<RuntimeCapabilityMap>(() => createFallbackRuntimeCapabilities());
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [environment, setEnvironment] = useState<RuntimeEnvironmentInfo>(() => getRuntimeEnvironmentInfo());

  const refresh = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const loaded = await getRuntimeCapabilities(forceRefresh);
      setCapabilities(mergeWithFallbackCapabilities(loaded));
      setEnvironment(getRuntimeEnvironmentInfo());
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
    environment,
  };
};
