import React, { useEffect, useMemo, useRef } from 'react';
import { Activity, AlertTriangle, Clock, HeartPulse, Server } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useWorkerHeartbeat, WORKER_FLEET_GUIDANCE } from '@/hooks/useWorkerHeartbeat';
import { toast } from 'sonner';

const QUEUE_DEPTH_WARNING = 100;

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
  const { workers, environmentWarnings, isLoading, error, lastUpdated, summary } =
    useWorkerHeartbeat({ intervalMs: 30000 });
  const toastStateRef = useRef<{ queue: Set<string>; heartbeat: Set<string> }>({
    queue: new Set(),
    heartbeat: new Set(),
  });
  useEffect(() => {
    const previousQueue = toastStateRef.current.queue;
    const previousHeartbeat = toastStateRef.current.heartbeat;
    const nextQueue = new Set<string>();
    const nextHeartbeat = new Set<string>();

    workers.forEach((worker) => {
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
  }, [workers]);

  const metrics = useMemo(() => {
    return {
      totalQueue: summary.totalQueueDepth,
      maxQueue: summary.maxQueueDepth,
      staleWorkers: summary.staleWorkers,
      healthyWorkers: summary.healthyWorkers,
    };
  }, [summary]);

  const totalWorkers = summary.totalWorkers;

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

        {isLoading && totalWorkers === 0 && !error ? (
          <p className="text-sm text-muted-foreground">Loading worker telemetry…</p>
        ) : null}

        {totalWorkers === 0 && !isLoading && !error ? (
          <p className="text-sm text-muted-foreground">
            No worker telemetry available yet. {WORKER_FLEET_GUIDANCE}
          </p>
        ) : null}

        {totalWorkers > 0 ? (
          <>
            <div className="grid gap-3 rounded-md border bg-slate-50 p-4 sm:grid-cols-2">
              <div className="flex items-center gap-2">
                <Server className="h-4 w-4 text-slate-500" aria-hidden />
                <div>
                  <p className="text-xs text-muted-foreground">Workers reporting</p>
                  <p className="text-base font-semibold">{totalWorkers}</p>
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
