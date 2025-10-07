import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, AlertTriangle, Clock, HeartPulse, Server } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAuthStore } from '@/store/authStore';
import { toast } from 'sonner';

type WorkerStatus = {
  id: string;
  name: string;
  queueDepth: number;
  heartbeatAt?: string;
  secondsSinceHeartbeat: number | null;
  isHeartbeatStale: boolean;
};

type WorkerStatusResponse = {
  workers?: unknown;
  queueDepth?: unknown;
  queue_depth?: unknown;
  data?: unknown;
};

type EnvironmentWarningMessage = {
  id: string;
  message: string;
  since?: string | null;
  queueDepth?: number;
};

const QUEUE_DEPTH_WARNING = 100;
const HEARTBEAT_STALE_SECONDS = 120;
const POLL_INTERVAL_MS = 30000;

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
  };
};

const formatRelativeTime = (secondsSince: number | null): string => {
  if (secondsSince === null) {
    return 'No heartbeat reported';
  }
  if (secondsSince < 60) {
    return `${secondsSince}s ago`;
  }
  if (secondsSince < 3600) {
    const minutes = Math.floor(secondsSince / 60);
    return `${minutes}m ago`;
  }
  const hours = Math.floor(secondsSince / 3600);
  return `${hours}h ago`;
};

const formatTimestamp = (iso?: string): string => {
  if (!iso) {
    return '';
  }
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(new Date(iso));
  } catch (error) {
    return '';
  }
};

export default function WorkerStatusPanel() {
  const authFetch = useAuthStore((state) => state.authFetch);
  const [workers, setWorkers] = useState<WorkerStatus[]>([]);
  const [environmentWarnings, setEnvironmentWarnings] = useState<EnvironmentWarningMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const toastStateRef = useRef<{ queue: Set<string>; heartbeat: Set<string> }>({
    queue: new Set(),
    heartbeat: new Set(),
  });

  const fetchStatus = useCallback(async () => {
    setIsLoading((prev) => (workers.length === 0 ? true : prev));
    try {
      const response = await authFetch('/api/admin/workers/status');
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const payload = (await response.json().catch(() => ({}))) as WorkerStatusResponse | any[];
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
          : undefined;

      const rawWarnings = Array.isArray(executionTelemetry?.environmentWarnings)
        ? executionTelemetry.environmentWarnings
        : Array.isArray((rootPayload as any)?.environmentWarnings)
          ? (rootPayload as any).environmentWarnings
          : [];
      const normalizedWarnings = (rawWarnings as any[]).map((warning, index) => {
        const id = typeof warning?.id === 'string' ? warning.id : `warning-${index}`;
        const message = typeof warning?.message === 'string' ? warning.message : '';
        const since = typeof warning?.since === 'string' ? warning.since : null;
        const queueDepth =
          typeof warning?.queueDepth === 'number' && Number.isFinite(warning.queueDepth)
            ? warning.queueDepth
            : undefined;
        return { id, message, since, queueDepth } satisfies EnvironmentWarningMessage;
      }).filter((warning) => warning.message.length > 0);
      setEnvironmentWarnings(normalizedWarnings);

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

      const now = new Date().toISOString();
      const previousQueue = toastStateRef.current.queue;
      const previousHeartbeat = toastStateRef.current.heartbeat;
      const nextQueue = new Set<string>();
      const nextHeartbeat = new Set<string>();

      list.forEach((worker) => {
        if (worker.queueDepth >= QUEUE_DEPTH_WARNING) {
          nextQueue.add(worker.id);
          if (!previousQueue.has(worker.id)) {
            toast.warning(
              `${worker.name} queue depth is ${worker.queueDepth}. Investigate worker throughput.`
            );
          }
        }
        if (worker.isHeartbeatStale) {
          nextHeartbeat.add(worker.id);
          if (!previousHeartbeat.has(worker.id)) {
            toast.error(
              `${worker.name} has not sent a heartbeat in ${formatRelativeTime(
                worker.secondsSinceHeartbeat
              )}.`
            );
          }
        }
      });

      toastStateRef.current.queue = nextQueue;
      toastStateRef.current.heartbeat = nextHeartbeat;

      setWorkers(list);
      setError(null);
      setLastUpdated(now);
    } catch (caughtError: any) {
      const message = caughtError?.message || 'Unable to load worker status';
      setError(message);
      setEnvironmentWarnings([]);
    } finally {
      setIsLoading(false);
    }
  }, [authFetch, workers.length]);

  useEffect(() => {
    void fetchStatus();
    const interval = window.setInterval(() => {
      void fetchStatus();
    }, POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [fetchStatus]);

  const metrics = useMemo(() => {
    if (!workers.length) {
      return {
        totalQueue: 0,
        maxQueue: 0,
        staleWorkers: 0,
        healthyWorkers: 0,
      };
    }

    const totalQueue = workers.reduce((acc, worker) => acc + worker.queueDepth, 0);
    const maxQueue = workers.reduce((acc, worker) => Math.max(acc, worker.queueDepth), 0);
    const staleWorkers = workers.filter((worker) => worker.isHeartbeatStale).length;
    const healthyWorkers = workers.length - staleWorkers;

    return { totalQueue, maxQueue, staleWorkers, healthyWorkers };
  }, [workers]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-slate-600" />
          Worker Operations Health
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {environmentWarnings.length > 0 ? (
          <div className="space-y-2">
            {environmentWarnings.map((warning) => (
              <Alert
                key={warning.id}
                variant="destructive"
                className="border-red-200 bg-red-50 text-red-700"
              >
                <AlertTriangle className="h-4 w-4" aria-hidden />
                <AlertTitle>Queue consumers unavailable</AlertTitle>
                <AlertDescription className="space-y-1">
                  <p>{warning.message}</p>
                  {typeof warning.queueDepth === 'number' ? (
                    <p className="text-xs text-red-700/80">
                      Current queue depth: {warning.queueDepth}
                    </p>
                  ) : null}
                  {warning.since ? (
                    <p className="text-xs text-red-700/80">
                      Detected at {formatTimestamp(warning.since)}
                    </p>
                  ) : null}
                </AlertDescription>
              </Alert>
            ))}
          </div>
        ) : null}

        {error ? (
          <div className="flex items-start gap-3 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertTriangle className="h-5 w-5 text-red-500" aria-hidden />
            <div>
              <p className="font-medium">Unable to load worker status</p>
              <p className="text-xs text-red-600/80">{error}</p>
            </div>
          </div>
        ) : null}

        {isLoading && workers.length === 0 && !error ? (
          <p className="text-sm text-muted-foreground">Loading worker telemetry…</p>
        ) : null}

        {workers.length === 0 && !isLoading && !error ? (
          <p className="text-sm text-muted-foreground">No worker telemetry available yet.</p>
        ) : null}

        {workers.length > 0 ? (
          <>
            <div className="grid gap-3 rounded-md border bg-slate-50 p-4 sm:grid-cols-2">
              <div className="flex items-center gap-2">
                <Server className="h-4 w-4 text-slate-500" aria-hidden />
                <div>
                  <p className="text-xs text-muted-foreground">Workers reporting</p>
                  <p className="text-base font-semibold">{workers.length}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <HeartPulse className="h-4 w-4 text-emerald-500" aria-hidden />
                <div>
                  <p className="text-xs text-muted-foreground">Healthy workers</p>
                  <p className="text-base font-semibold">{metrics.healthyWorkers}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-indigo-500" aria-hidden />
                <div>
                  <p className="text-xs text-muted-foreground">Total queued jobs</p>
                  <p className="text-base font-semibold">{metrics.totalQueue}</p>
                  <p className="text-[11px] text-muted-foreground">Peak queue depth {metrics.maxQueue}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden />
                <div>
                  <p className="text-xs text-muted-foreground">Stale heartbeats</p>
                  <p className="text-base font-semibold">{metrics.staleWorkers}</p>
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              {workers.map((worker) => {
                const queueBadgeClasses =
                  worker.queueDepth >= QUEUE_DEPTH_WARNING
                    ? 'bg-amber-100 text-amber-700 border-amber-200'
                    : 'bg-emerald-100 text-emerald-700 border-emerald-200';
                const heartbeatBadgeClasses = worker.isHeartbeatStale
                  ? 'bg-red-100 text-red-700 border-red-200'
                  : 'bg-emerald-100 text-emerald-700 border-emerald-200';

                return (
                  <div key={worker.id} className="rounded-md border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{worker.name}</p>
                        <p className="text-xs text-muted-foreground">Identifier: {worker.id}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={queueBadgeClasses} variant="outline">
                          Queue depth: {worker.queueDepth}
                        </Badge>
                        <Badge className={heartbeatBadgeClasses} variant="outline">
                          {worker.isHeartbeatStale ? 'Heartbeat stale' : 'Heartbeat healthy'}
                        </Badge>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-3 text-xs text-muted-foreground sm:grid-cols-2">
                      <div className="flex items-center gap-2">
                        <Activity className="h-4 w-4 text-slate-500" aria-hidden />
                        <span>Total queue depth</span>
                        <span className="font-semibold text-slate-900">{worker.queueDepth}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-slate-500" aria-hidden />
                        <span>Last heartbeat</span>
                        <span className="font-semibold text-slate-900">
                          {formatRelativeTime(worker.secondsSinceHeartbeat)}
                        </span>
                      </div>
                      {worker.heartbeatAt ? (
                        <div className="flex items-center gap-2 sm:col-span-2">
                          <Clock className="h-4 w-4 text-slate-400" aria-hidden />
                          <span>Reported at</span>
                          <span className="font-medium text-slate-800">{formatTimestamp(worker.heartbeatAt)}</span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : null}

        {lastUpdated ? (
          <p className="text-right text-xs text-muted-foreground">Last updated {formatTimestamp(lastUpdated)}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
