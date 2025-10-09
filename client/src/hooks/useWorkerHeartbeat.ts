import { useAuthStore } from '@/store/authStore';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type WorkerStatus = {
  id: string;
  name: string;
  queueDepth: number;
  heartbeatAt?: string;
  secondsSinceHeartbeat: number | null;
  isHeartbeatStale: boolean;
};

export type EnvironmentWarningMessage = {
  id: string;
  message: string;
  since?: string | null;
  queueDepth?: number;
};

export type PublicQueueHeartbeat = {
  status: 'pass' | 'warn' | 'fail' | null;
  message: string | null;
  latestHeartbeatAt: string | null;
  latestHeartbeatAgeMs: number | null;
  inlineWorker: boolean;
};

export type WorkerHeartbeatSummary = {
  totalWorkers: number;
  healthyWorkers: number;
  staleWorkers: number;
  totalQueueDepth: number;
  maxQueueDepth: number;
  hasExecutionWorker: boolean;
  schedulerHealthy: boolean;
  timerHealthy: boolean;
  publicHeartbeatStatus: 'pass' | 'warn' | 'fail' | null;
  publicHeartbeatMessage: string | null;
  publicHeartbeatAt: string | null;
  publicHeartbeatAgeSeconds: number | null;
  hasRecentPublicHeartbeat: boolean;
};

export type WorkerHeartbeatSnapshot = {
  workers: WorkerStatus[];
  environmentWarnings: EnvironmentWarningMessage[];
  summary: WorkerHeartbeatSummary;
  scheduler: Record<string, any> | null;
  queue: Record<string, any> | null;
  publicHeartbeat: PublicQueueHeartbeat | null;
  lastUpdated: string | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export type UseWorkerHeartbeatOptions = {
  poll?: boolean;
  intervalMs?: number;
};

const DEFAULT_INTERVAL_MS = 30000;
const HEARTBEAT_STALE_SECONDS = 120;

export const WORKER_FLEET_GUIDANCE =
  'Start the execution worker and scheduler processes to run workflows.';

const toNumber = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
};

const extractHeartbeat = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }
  return undefined;
};

const toWorkerList = (raw: unknown): any[] => {
  if (Array.isArray(raw)) {
    return raw;
  }
  if (raw && typeof raw === 'object') {
    const value = raw as Record<string, unknown>;
    if (Array.isArray(value.workers)) {
      return value.workers as any[];
    }
    if (Array.isArray(value.data)) {
      return value.data as any[];
    }
    if (Array.isArray(value.items)) {
      return value.items as any[];
    }
  }
  return [];
};

const normalizeWorker = (raw: any, index: number): WorkerStatus => {
  const id = String(
    raw?.id ?? raw?.workerId ?? raw?.name ?? raw?.identifier ?? `worker-${index + 1}`
  );
  const name = String(raw?.name ?? raw?.displayName ?? id);
  const queueDepth = toNumber(
    raw?.queueDepth ?? raw?.queue_depth ?? raw?.queueSize ?? raw?.queue_size ?? raw?.queue
  );
  const heartbeatAt =
    extractHeartbeat(
      raw?.heartbeatAt ??
        raw?.lastHeartbeatAt ??
        raw?.heartbeat_at ??
        raw?.lastHeartbeat ??
        raw?.heartbeat
    ) ?? undefined;

  const secondsSinceHeartbeat = heartbeatAt
    ? Math.max(0, Math.floor((Date.now() - new Date(heartbeatAt).getTime()) / 1000))
    : null;

  return {
    id,
    name,
    queueDepth,
    heartbeatAt,
    secondsSinceHeartbeat,
    isHeartbeatStale:
      typeof secondsSinceHeartbeat === 'number' && secondsSinceHeartbeat > HEARTBEAT_STALE_SECONDS,
  } satisfies WorkerStatus;
};

const resolveSchedulerHealth = (telemetry: Record<string, any> | null): {
  schedulerHealthy: boolean;
  timerHealthy: boolean;
} => {
  if (!telemetry || typeof telemetry !== 'object') {
    return { schedulerHealthy: false, timerHealthy: false };
  }

  const strategyOverride = typeof telemetry.strategyOverride === 'string' ? telemetry.strategyOverride : null;
  const preferredStrategy = typeof telemetry.preferredStrategy === 'string' ? telemetry.preferredStrategy : null;
  const strategy = (strategyOverride && strategyOverride !== 'auto' ? strategyOverride : preferredStrategy) ?? 'memory';

  let schedulerHealthy = true;
  if (strategy === 'redis') {
    schedulerHealthy = Boolean(telemetry.redis?.isConnected);
  } else if (strategy === 'postgres') {
    schedulerHealthy = Boolean(telemetry.postgresAvailable);
  }

  const resources = Array.isArray(telemetry.memoryLocks?.resources)
    ? telemetry.memoryLocks.resources.filter((value: unknown): value is string => typeof value === 'string')
    : [];

  const hasTimerLock = resources.some((resource) =>
    resource.includes('timer') || resource.includes('schedule') || resource.includes('workflow')
  );

  const timerHealthy =
    schedulerHealthy &&
    (strategy !== 'memory'
      ? true
      : hasTimerLock || (typeof telemetry.memoryLocks?.count === 'number' && telemetry.memoryLocks.count > 0));

  return { schedulerHealthy, timerHealthy };
};

export function useWorkerHeartbeat(options: UseWorkerHeartbeatOptions = {}): WorkerHeartbeatSnapshot {
  const authFetch = useAuthStore((state) => state.authFetch);
  const [workers, setWorkers] = useState<WorkerStatus[]>([]);
  const [environmentWarnings, setEnvironmentWarnings] = useState<EnvironmentWarningMessage[]>([]);
  const [schedulerTelemetry, setSchedulerTelemetry] = useState<Record<string, any> | null>(null);
  const [queueTelemetry, setQueueTelemetry] = useState<Record<string, any> | null>(null);
  const [publicHeartbeat, setPublicHeartbeat] = useState<PublicQueueHeartbeat | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const workersRef = useRef<WorkerStatus[]>([]);
  const isMountedRef = useRef(true);
  const poll = options.poll ?? true;
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;

  const fetchStatus = useCallback(async () => {
    if (!isMountedRef.current) {
      return;
    }

    setIsLoading((previous) => (workersRef.current.length === 0 ? true : previous));

    try {
      let adminPayload: Record<string, any> | any[] | null = null;
      let adminForbidden = false;
      let adminError: string | null = null;

      try {
        const response = await authFetch('/api/admin/workers/status');
        const payload = (await response.json().catch(() => ({}))) as Record<string, any> | any[];
        if (response.ok) {
          adminPayload = payload;
        } else if (response.status === 403) {
          adminForbidden = true;
        } else {
          const message =
            payload &&
            typeof payload === 'object' &&
            !Array.isArray(payload) &&
            typeof (payload as any).error === 'string'
              ? ((payload as any).error as string)
              : `Request failed with status ${response.status}`;
          adminError = message;
        }
      } catch (caughtError: any) {
        adminError = caughtError?.message || 'Unable to load worker status';
      }

      const payload = adminPayload ?? {};
      const rootPayload =
        payload &&
        typeof payload === 'object' &&
        !Array.isArray(payload) &&
        'data' in (payload as Record<string, unknown>)
          ? ((payload as Record<string, any>).data ?? {})
          : payload;

      const executionTelemetry =
        rootPayload &&
        typeof rootPayload === 'object' &&
        !Array.isArray(rootPayload) &&
        'executionWorker' in (rootPayload as Record<string, unknown>)
          ? (rootPayload as any).executionWorker
          : rootPayload;

      const scheduler =
        rootPayload &&
        typeof rootPayload === 'object' &&
        !Array.isArray(rootPayload) &&
        'scheduler' in (rootPayload as Record<string, unknown>)
          ? ((rootPayload as Record<string, any>).scheduler as Record<string, any> | null)
          : null;

      let queue =
        rootPayload &&
        typeof rootPayload === 'object' &&
        !Array.isArray(rootPayload) &&
        'queue' in (rootPayload as Record<string, unknown>)
          ? ((rootPayload as Record<string, any>).queue as Record<string, any> | null)
          : null;

      const rawWarnings = Array.isArray(executionTelemetry?.environmentWarnings)
        ? executionTelemetry.environmentWarnings
        : Array.isArray((rootPayload as any)?.environmentWarnings)
          ? (rootPayload as any).environmentWarnings
          : [];

      const normalizedWarnings = (rawWarnings as any[])
        .map((warning, index) => {
          const id = typeof warning?.id === 'string' ? warning.id : `warning-${index}`;
          const message = typeof warning?.message === 'string' ? warning.message : '';
          const since = typeof warning?.since === 'string' ? warning.since : null;
          const queueDepth =
            typeof warning?.queueDepth === 'number' && Number.isFinite(warning.queueDepth)
              ? warning.queueDepth
              : undefined;

          return { id, message, since, queueDepth } satisfies EnvironmentWarningMessage;
        })
        .filter((warning) => warning.message.length > 0);

      const sumState = (value: unknown): number => {
        return typeof value === 'number' && Number.isFinite(value) ? value : 0;
      };

      let list: WorkerStatus[] = [];

      if (executionTelemetry && typeof executionTelemetry === 'object') {
        const queueDepths = (executionTelemetry as any)?.metrics?.queueDepths ?? {};
        const totalQueueDepth = Object.values(queueDepths).reduce((acc, depth) => {
          if (!depth || typeof depth !== 'object') {
            return acc;
          }

          const record = depth as Record<string, unknown>;
          if (typeof record.total === 'number' && Number.isFinite(record.total)) {
            return acc + (record.total as number);
          }

          return (
            acc +
            sumState(record.waiting) +
            sumState(record.delayed) +
            sumState(record.active) +
            sumState(record.paused)
          );
        }, 0);

        const heartbeat = (executionTelemetry as any)?.lastObservedHeartbeat;
        if (heartbeat && typeof heartbeat.heartbeatAt === 'string') {
          const workerEntry = normalizeWorker(
            {
              id: heartbeat.workerId ?? 'execution-worker',
              name: heartbeat.inline ? 'Inline execution worker' : 'Execution worker',
              queueDepth: totalQueueDepth,
              heartbeatAt: heartbeat.heartbeatAt,
            },
            0,
          );
          workerEntry.queueDepth = totalQueueDepth;
          list = [workerEntry];
        } else if (totalQueueDepth > 0) {
          const queueEntry = normalizeWorker(
            {
              id: 'execution-queue',
              name: 'Execution queue (no consumers)',
              queueDepth: totalQueueDepth,
            },
            0,
          );
          queueEntry.isHeartbeatStale = true;
          list = [queueEntry];
        }
      }

      if (!list.length) {
        const fallbackPayload = rootPayload ?? payload;
        list = toWorkerList(fallbackPayload).map(normalizeWorker);

        if (
          !list.length &&
          fallbackPayload &&
          !Array.isArray(fallbackPayload) &&
          typeof fallbackPayload === 'object'
        ) {
          const fallback = normalizeWorker(fallbackPayload as Record<string, unknown>, 0);
          if (fallback.queueDepth !== 0 || fallback.heartbeatAt) {
            list = [fallback];
          }
        }
      }

      let publicHeartbeatPayload: PublicQueueHeartbeat | null = null;

      try {
        const response = await authFetch('/api/production/queue/heartbeat');
        const payload = (await response.json().catch(() => ({}))) as Record<string, any>;

        if (response.ok) {
          const statusPayload =
            payload && typeof payload.status === 'object' && payload.status
              ? (payload.status as Record<string, any>)
              : null;
          const statusValue =
            statusPayload && typeof statusPayload.status === 'string'
              ? (statusPayload.status as 'pass' | 'warn' | 'fail')
              : null;
          const message =
            statusPayload && typeof statusPayload.message === 'string'
              ? (statusPayload.message as string)
              : null;

          const workerPayload =
            payload && typeof payload.worker === 'object' && payload.worker
              ? (payload.worker as Record<string, any>)
              : null;
          const latestHeartbeatAt = workerPayload
            ? extractHeartbeat(workerPayload.latestHeartbeatAt)
            : null;
          const latestHeartbeatAgeMs = workerPayload && typeof workerPayload.latestHeartbeatAgeMs === 'number'
            ? (Number.isFinite(workerPayload.latestHeartbeatAgeMs)
              ? (workerPayload.latestHeartbeatAgeMs as number)
              : null)
            : null;

          publicHeartbeatPayload = {
            status: statusValue ?? null,
            message,
            latestHeartbeatAt: latestHeartbeatAt ?? null,
            latestHeartbeatAgeMs,
            inlineWorker: Boolean(payload?.inlineWorker),
          } satisfies PublicQueueHeartbeat;

          if (!queue && payload && typeof payload.queueHealth === 'object' && payload.queueHealth) {
            queue = payload.queueHealth as Record<string, any>;
          }
        }
      } catch (caughtError) {
        // Ignore public heartbeat failures—they may be unavailable in development.
        console.warn('Unable to load public queue heartbeat', caughtError);
      }

      if (!list.length && publicHeartbeatPayload?.status === 'pass' && publicHeartbeatPayload.latestHeartbeatAt) {
        const workerEntry = normalizeWorker(
          {
            id: publicHeartbeatPayload.inlineWorker ? 'inline-execution-worker' : 'public-execution-worker',
            name: publicHeartbeatPayload.inlineWorker
              ? 'Inline execution worker'
              : 'Execution worker',
            queueDepth: 0,
            heartbeatAt: publicHeartbeatPayload.latestHeartbeatAt,
          },
          0,
        );

        if (
          typeof publicHeartbeatPayload.latestHeartbeatAgeMs === 'number' &&
          Number.isFinite(publicHeartbeatPayload.latestHeartbeatAgeMs)
        ) {
          workerEntry.secondsSinceHeartbeat = Math.max(
            0,
            Math.floor(publicHeartbeatPayload.latestHeartbeatAgeMs / 1000),
          );
          workerEntry.isHeartbeatStale = workerEntry.secondsSinceHeartbeat > HEARTBEAT_STALE_SECONDS;
        }

        list = [workerEntry];
      }

      if (!isMountedRef.current) {
        return;
      }

      workersRef.current = list;
      setWorkers(list);
      setEnvironmentWarnings(normalizedWarnings);
      setSchedulerTelemetry(scheduler ?? null);
      setQueueTelemetry(queue ?? null);
      setPublicHeartbeat(publicHeartbeatPayload);
      setError(adminForbidden ? null : adminError);
      setLastUpdated(new Date().toISOString());
    } catch (caughtError: any) {
      if (!isMountedRef.current) {
        return;
      }
      const message = caughtError?.message || 'Unable to load worker status';
      setError(message);
      setEnvironmentWarnings([]);
      setWorkers([]);
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [authFetch]);

  useEffect(() => {
    isMountedRef.current = true;
    void fetchStatus();

    if (!poll) {
      return () => {
        isMountedRef.current = false;
      };
    }

    const interval = window.setInterval(() => {
      if (!isMountedRef.current) {
        return;
      }
      void fetchStatus();
    }, intervalMs);

    return () => {
      isMountedRef.current = false;
      window.clearInterval(interval);
    };
  }, [fetchStatus, poll, intervalMs]);

  const summary = useMemo<WorkerHeartbeatSummary>(() => {
    if (!workers.length) {
      const { schedulerHealthy, timerHealthy } = resolveSchedulerHealth(schedulerTelemetry);
      const publicStatus = publicHeartbeat?.status ?? null;
      const publicMessage = publicHeartbeat?.message ?? null;
      const publicHeartbeatAt = publicHeartbeat?.latestHeartbeatAt ?? null;
      const publicHeartbeatAgeMs =
        typeof publicHeartbeat?.latestHeartbeatAgeMs === 'number' &&
        Number.isFinite(publicHeartbeat.latestHeartbeatAgeMs)
          ? publicHeartbeat.latestHeartbeatAgeMs
          : publicHeartbeatAt
            ? Math.max(0, Date.now() - new Date(publicHeartbeatAt).getTime())
            : null;
      const publicHeartbeatAgeSeconds =
        typeof publicHeartbeatAgeMs === 'number' ? Math.floor(publicHeartbeatAgeMs / 1000) : null;
      const hasRecentPublicHeartbeat =
        publicStatus === 'pass' &&
        typeof publicHeartbeatAgeSeconds === 'number' &&
        publicHeartbeatAgeSeconds <= HEARTBEAT_STALE_SECONDS;

      return {
        totalWorkers: 0,
        healthyWorkers: 0,
        staleWorkers: 0,
        totalQueueDepth: 0,
        maxQueueDepth: 0,
        hasExecutionWorker: false,
        schedulerHealthy,
        timerHealthy,
        publicHeartbeatStatus: publicStatus,
        publicHeartbeatMessage: publicMessage,
        publicHeartbeatAt,
        publicHeartbeatAgeSeconds,
        hasRecentPublicHeartbeat,
      };
    }

    const totalQueue = workers.reduce((acc, worker) => acc + worker.queueDepth, 0);
    const maxQueue = workers.reduce((acc, worker) => Math.max(acc, worker.queueDepth), 0);
    const staleWorkers = workers.filter((worker) => worker.isHeartbeatStale).length;
    const healthyWorkers = workers.length - staleWorkers;
    const { schedulerHealthy, timerHealthy } = resolveSchedulerHealth(schedulerTelemetry);
    const publicStatus = publicHeartbeat?.status ?? null;
    const publicMessage = publicHeartbeat?.message ?? null;
    const publicHeartbeatAt = publicHeartbeat?.latestHeartbeatAt ?? null;
    const publicHeartbeatAgeMs =
      typeof publicHeartbeat?.latestHeartbeatAgeMs === 'number' &&
      Number.isFinite(publicHeartbeat.latestHeartbeatAgeMs)
        ? publicHeartbeat.latestHeartbeatAgeMs
        : publicHeartbeatAt
          ? Math.max(0, Date.now() - new Date(publicHeartbeatAt).getTime())
          : null;
    const publicHeartbeatAgeSeconds =
      typeof publicHeartbeatAgeMs === 'number' ? Math.floor(publicHeartbeatAgeMs / 1000) : null;
    const hasRecentPublicHeartbeat =
      publicStatus === 'pass' &&
      typeof publicHeartbeatAgeSeconds === 'number' &&
      publicHeartbeatAgeSeconds <= HEARTBEAT_STALE_SECONDS;

    return {
      totalWorkers: workers.length,
      healthyWorkers,
      staleWorkers,
      totalQueueDepth: totalQueue,
      maxQueueDepth: maxQueue,
      hasExecutionWorker: healthyWorkers > 0,
      schedulerHealthy,
      timerHealthy,
      publicHeartbeatStatus: publicStatus,
      publicHeartbeatMessage: publicMessage,
      publicHeartbeatAt,
      publicHeartbeatAgeSeconds,
      hasRecentPublicHeartbeat,
    };
  }, [workers, schedulerTelemetry, publicHeartbeat]);

  return {
    workers,
    environmentWarnings,
    summary,
    scheduler: schedulerTelemetry,
    queue: queueTelemetry,
    publicHeartbeat,
    lastUpdated,
    isLoading,
    error,
    refresh: fetchStatus,
  } satisfies WorkerHeartbeatSnapshot;
}
