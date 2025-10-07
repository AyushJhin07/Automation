import { useAuthStore } from '@/store/authStore';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type QueueHealthStatus = {
  status: 'pass' | 'fail';
  durable: boolean;
  message: string;
  latencyMs: number | null;
  checkedAt: string;
  error?: string;
};

export type UseQueueHealthOptions = {
  /** Poll for updates (default: true). */
  poll?: boolean;
  /** Interval in milliseconds between polls (default: 30s). */
  intervalMs?: number;
};

export type UseQueueHealthResult = {
  health: QueueHealthStatus | null;
  status: QueueHealthStatus['status'];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const DEFAULT_INTERVAL_MS = 30000;

export function useQueueHealth(options: UseQueueHealthOptions = {}): UseQueueHealthResult {
  const authFetch = useAuthStore((state) => state.authFetch);
  const [health, setHealth] = useState<QueueHealthStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const poll = options.poll ?? true;
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const abortRef = useRef<AbortController | null>(null);
  const hasFetchedRef = useRef(false);
  const isMountedRef = useRef(true);

  const fetchHealth = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (!isMountedRef.current) {
      return;
    }

    setIsLoading((previous) => (hasFetchedRef.current ? previous : true));
    setError(null);

    try {
      const response = await authFetch('/api/health/queue', { signal: controller.signal });
      const payload = (await response.json().catch(() => ({}))) as Record<string, any>;
      if (!response.ok) {
        throw new Error(payload?.error || `Queue health request failed with status ${response.status}`);
      }

      const status: QueueHealthStatus | null = payload && typeof payload === 'object'
        ? (payload.health as QueueHealthStatus | undefined) ?? (payload as QueueHealthStatus)
        : null;

      if (status && typeof status.status === 'string') {
        if (isMountedRef.current) {
          setHealth(status);
          hasFetchedRef.current = true;
        }
      } else {
        throw new Error('Received unexpected payload from /api/health/queue');
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return;
      }
      if (isMountedRef.current) {
        setError(err?.message || 'Unable to determine queue health');
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [authFetch]);

  useEffect(() => {
    isMountedRef.current = true;
    void fetchHealth();

    if (!poll) {
      return () => {
        abortRef.current?.abort();
        isMountedRef.current = false;
      };
    }

    const interval = window.setInterval(() => {
      if (!isMountedRef.current) {
        return;
      }
      void fetchHealth();
    }, intervalMs);

    return () => {
      isMountedRef.current = false;
      abortRef.current?.abort();
      window.clearInterval(interval);
    };
  }, [fetchHealth, poll, intervalMs]);

  const status = health?.status ?? 'fail';

  const result = useMemo<UseQueueHealthResult>(() => ({
    health,
    status,
    isLoading,
    error,
    refresh: fetchHealth,
  }), [health, status, isLoading, error, fetchHealth]);

  return result;
}

