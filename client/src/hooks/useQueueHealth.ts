import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAuthStore } from '@/store/authStore';

export type QueueHealthStatus = {
  status: 'pass' | 'fail';
  durable: boolean;
  message: string;
  latencyMs: number | null;
  checkedAt: string;
  error?: string;
};

export type QueueHealthState = {
  queueHealth: QueueHealthStatus | null;
  isQueueReady: boolean;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const POLL_INTERVAL_MS = 30000;

const normalizeQueueHealth = (raw: any): QueueHealthStatus => {
  const status = raw?.status === 'pass' ? 'pass' : 'fail';
  const durable = Boolean(raw?.durable);
  const message =
    typeof raw?.message === 'string' && raw.message.trim().length > 0
      ? raw.message
      : 'Start worker & scheduler processes to run workflows';
  const latency = typeof raw?.latencyMs === 'number' && Number.isFinite(raw.latencyMs)
    ? raw.latencyMs
    : null;
  const checkedAt = typeof raw?.checkedAt === 'string' && raw.checkedAt
    ? raw.checkedAt
    : new Date().toISOString();
  const error = typeof raw?.error === 'string' ? raw.error : undefined;

  return {
    status,
    durable,
    message,
    latencyMs: latency,
    checkedAt,
    error,
  };
};

export function useQueueHealth(options: { poll?: boolean; intervalMs?: number } = {}): QueueHealthState {
  const { poll = true, intervalMs = POLL_INTERVAL_MS } = options;
  const authFetch = useAuthStore((state) => state.authFetch);
  const [queueHealth, setQueueHealth] = useState<QueueHealthStatus | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchHealth = useCallback(async () => {
    setIsLoading((prev) => (queueHealth ? prev : true));
    try {
      const response = await authFetch('/api/health/queue');
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const payload = (await response.json().catch(() => ({}))) as any;
      const data = payload?.data ?? payload?.queue ?? payload;
      const normalized = normalizeQueueHealth(data ?? {});

      if (!mountedRef.current) {
        return;
      }

      setQueueHealth(normalized);
      setError(null);
    } catch (caught: any) {
      if (!mountedRef.current) {
        return;
      }
      const message = caught?.message || 'Unable to load queue health';
      setError(message);
      setQueueHealth((prev) => prev);
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [authFetch, queueHealth]);

  useEffect(() => {
    void fetchHealth();
    if (!poll) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      void fetchHealth();
    }, intervalMs);

    return () => {
      window.clearInterval(interval);
    };
  }, [fetchHealth, poll, intervalMs]);

  const isQueueReady = useMemo(() => {
    return Boolean(queueHealth && queueHealth.status === 'pass' && queueHealth.durable);
  }, [queueHealth]);

  return {
    queueHealth,
    isQueueReady,
    isLoading,
    error,
    refresh: fetchHealth,
  };
}
