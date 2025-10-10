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

export type WorkerHeartbeatSummary = {
  totalWorkers: number;
  healthyWorkers: number;
  staleWorkers: number;
  totalQueueDepth: number;
  maxQueueDepth: number;
  hasExecutionWorker: boolean;
  schedulerHealthy: boolean;
  timerHealthy: boolean;
  usesPublicHeartbeat: boolean;
  queueStatus: 'pass' | 'warn' | 'fail' | null;
  queueDurable: boolean | null;
  queueMessage: string | null;
};

export type WorkerHeartbeatSnapshot = {
  workers: WorkerStatus[];
  environmentWarnings: EnvironmentWarningMessage[];
  summary: WorkerHeartbeatSummary;
  scheduler: Record<string, any> | null;
  queue: Record<string, any> | null;
  source: 'admin' | 'public';
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

const sumState = (value: unknown): number => {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
};

const computeTotalQueueDepth = (value: unknown): number => {
  if (!value || typeof value !== 'object') {
    return 0;
  }

  return Object.values(value as Record<string, unknown>).reduce((acc, depth) => {
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

type NormalizedSnapshot = {
  workers: WorkerStatus[];
  environmentWarnings: EnvironmentWarningMessage[];
  scheduler: Record<string, any> | null;
  queue: Record<string, any> | null;
  source: 'admin' | 'public';
};

const DEVELOPMENT_WARNING_SUPPRESSIONS: RegExp[] = [/memory/i, /security/i];

const normalizeEnvironmentWarnings = (rawWarnings: any[]): EnvironmentWarningMessage[] => {
  const normalized = rawWarnings
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

  if (process.env.NODE_ENV === 'development') {
    return normalized.filter(
      (warning) => !DEVELOPMENT_WARNING_SUPPRESSIONS.some((pattern) => pattern.test(warning.message))
    );
  }

  return normalized;
};

const normalizeAdminWorkerStatus = (payload: Record<string, any> | any[]): NormalizedSnapshot => {
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

  const queue =
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

  const normalizedWarnings = normalizeEnvironmentWarnings(rawWarnings as any[]);

  let list: WorkerStatus[] = [];

  if (executionTelemetry && typeof executionTelemetry === 'object') {
    const queueDepths = (executionTelemetry as any)?.metrics?.queueDepths ?? {};
    const totalQueueDepth = computeTotalQueueDepth(queueDepths);

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

  return {
    workers: list,
    environmentWarnings: normalizedWarnings,
    scheduler,
    queue,
    source: 'admin',
  };
};

const normalizeQueueHeartbeatPayload = (payload: Record<string, any> | null): NormalizedSnapshot => {
  if (!payload || typeof payload !== 'object') {
    return { workers: [], environmentWarnings: [], scheduler: null, queue: null, source: 'public' };
  }

  const queueDepths = (payload as any).queueDepths ?? {};
  const totalQueueDepth = computeTotalQueueDepth(queueDepths);
  const workerPayload = (payload as any).worker ?? {};
  const worker = normalizeWorker(
    {
      id: workerPayload?.id ?? 'execution-worker',
      name: workerPayload?.inline ? 'Inline execution worker' : 'Execution worker',
      queueDepth: totalQueueDepth,
      heartbeatAt:
        workerPayload?.latestHeartbeatAt ??
        workerPayload?.heartbeatAt ??
        workerPayload?.lastHeartbeatAt ??
        workerPayload?.lastHeartbeat ??
        null,
    },
    0,
  );
  worker.queueDepth = totalQueueDepth;

  const status = (payload as any).status ?? null;
  const statusValue = typeof status?.status === 'string' ? status.status : null;
  const statusMessage = typeof status?.message === 'string' ? status.message : '';

  const warnings: EnvironmentWarningMessage[] = [];

  if (statusValue === 'warn' || statusValue === 'fail') {
    warnings.push({
      id: `queue-heartbeat-${statusValue}`,
      message:
        statusMessage ||
        (statusValue === 'fail'
          ? 'Execution worker heartbeat unavailable.'
          : 'Execution worker heartbeat degraded.'),
      since: worker.heartbeatAt ?? null,
      queueDepth: totalQueueDepth || undefined,
    });
  }

  if (worker.isHeartbeatStale && !warnings.length) {
    warnings.push({
      id: 'queue-heartbeat-stale',
      message: 'Execution worker heartbeat is stale; check that the worker process is running.',
      since: worker.heartbeatAt ?? null,
      queueDepth: totalQueueDepth || undefined,
    });
  }

  const rawQueueHealth = (payload as any).queueHealth ?? null;
  const queueHealth =
    rawQueueHealth && typeof rawQueueHealth === 'object'
      ? (rawQueueHealth as Record<string, any>)
      : statusValue
        ? { status: statusValue, message: statusMessage ?? null }
        : null;

  if (queueHealth && typeof (payload as any).durable === 'boolean' && queueHealth.durable === undefined) {
    queueHealth.durable = Boolean((payload as any).durable);
  }

  const queueTelemetry = {
    queueDepths,
    queueHealth,
    leases: Array.isArray((payload as any).leases) ? (payload as any).leases : [],
  };

  return {
    workers: [worker],
    environmentWarnings: warnings,
    scheduler: null,
    queue: queueTelemetry,
    source: 'public',
  };
};

export function useWorkerHeartbeat(options: UseWorkerHeartbeatOptions = {}): WorkerHeartbeatSnapshot {
  const authFetch = useAuthStore((state) => state.authFetch);
  const [workers, setWorkers] = useState<WorkerStatus[]>([]);
  const [environmentWarnings, setEnvironmentWarnings] = useState<EnvironmentWarningMessage[]>([]);
  const [schedulerTelemetry, setSchedulerTelemetry] = useState<Record<string, any> | null>(null);
  const [queueTelemetry, setQueueTelemetry] = useState<Record<string, any> | null>(null);
  const [source, setSource] = useState<'admin' | 'public'>('admin');
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
      const response = await authFetch('/api/admin/workers/status');

      let snapshot: NormalizedSnapshot;

      if (response.status === 403 || response.status === 404) {
        const fallbackResponse = await authFetch('/api/production/queue/heartbeat');
        if (!fallbackResponse.ok) {
          throw new Error(`Request failed with status ${fallbackResponse.status}`);
        }
        const fallbackPayload = (await fallbackResponse.json().catch(() => ({}))) as
          | Record<string, any>
          | null;
        snapshot = normalizeQueueHeartbeatPayload(fallbackPayload);
      } else {
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        const payload = (await response.json().catch(() => ({}))) as Record<string, any> | any[];
        snapshot = normalizeAdminWorkerStatus(payload);
      }

      if (!isMountedRef.current) {
        return;
      }

      workersRef.current = snapshot.workers;
      setWorkers(snapshot.workers);
      setEnvironmentWarnings(snapshot.environmentWarnings);
      setSchedulerTelemetry(snapshot.scheduler);
      setQueueTelemetry(snapshot.queue);
      setSource(snapshot.source);
      setError(null);
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
    const queueHealth = queueTelemetry?.queueHealth ?? null;
    const queueStatus =
      queueHealth && typeof queueHealth.status === 'string'
        ? (queueHealth.status as 'pass' | 'warn' | 'fail')
        : null;
    const queueDurable =
      queueHealth && typeof queueHealth.durable === 'boolean' ? Boolean(queueHealth.durable) : null;
    const queueMessage =
      queueHealth && typeof queueHealth.message === 'string' && queueHealth.message.length > 0
        ? queueHealth.message
        : null;

    if (!workers.length) {
      const { schedulerHealthy, timerHealthy } = resolveSchedulerHealth(schedulerTelemetry);
      return {
        totalWorkers: 0,
        healthyWorkers: 0,
        staleWorkers: 0,
        totalQueueDepth: 0,
        maxQueueDepth: 0,
        hasExecutionWorker: false,
        schedulerHealthy,
        timerHealthy,
        usesPublicHeartbeat: source === 'public',
        queueStatus,
        queueDurable,
        queueMessage,
      };
    }

    const totalQueue = workers.reduce((acc, worker) => acc + worker.queueDepth, 0);
    const maxQueue = workers.reduce((acc, worker) => Math.max(acc, worker.queueDepth), 0);
    const staleWorkers = workers.filter((worker) => worker.isHeartbeatStale).length;
    const healthyWorkers = workers.length - staleWorkers;
    const { schedulerHealthy, timerHealthy } = resolveSchedulerHealth(schedulerTelemetry);

    return {
      totalWorkers: workers.length,
      healthyWorkers,
      staleWorkers,
      totalQueueDepth: totalQueue,
      maxQueueDepth: maxQueue,
      hasExecutionWorker: healthyWorkers > 0,
      schedulerHealthy,
      timerHealthy,
      usesPublicHeartbeat: source === 'public',
      queueStatus,
      queueDurable,
      queueMessage,
    };
  }, [workers, schedulerTelemetry, queueTelemetry, source]);

  return {
    workers,
    environmentWarnings,
    summary,
    scheduler: schedulerTelemetry,
    queue: queueTelemetry,
    source,
    lastUpdated,
    isLoading,
    error,
    refresh: fetchStatus,
  } satisfies WorkerHeartbeatSnapshot;
}
