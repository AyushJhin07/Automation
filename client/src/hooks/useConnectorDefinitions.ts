import { useEffect, useState } from 'react';
import {
  ConnectorDefinitionMap,
  getConnectorDefinitions,
} from '@/services/connectorDefinitionsService';

interface UseConnectorDefinitionsResult {
  data: ConnectorDefinitionMap | null;
  loading: boolean;
  error: Error | null;
}

export const useConnectorDefinitions = (forceRefresh = false): UseConnectorDefinitionsResult => {
  const [data, setData] = useState<ConnectorDefinitionMap | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    getConnectorDefinitions(forceRefresh)
      .then((definitions) => {
        if (!isMounted) return;
        setData(definitions);
      })
      .catch((err) => {
        if (!isMounted) return;
        const normalizedError = err instanceof Error ? err : new Error(String(err));
        setError(normalizedError);
      })
      .finally(() => {
        if (!isMounted) return;
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [forceRefresh]);

  return { data, loading, error };
};
