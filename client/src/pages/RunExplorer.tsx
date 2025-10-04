import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { AlertTriangle, Clock, Link as LinkIcon, Logs, RefreshCw } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { RunViewer } from '@/components/workflow/RunViewer';
import { searchRuns, type RunFacetEntry, type RunSearchResult, type RunSummary } from '@/services/runExplorer';

const STATUS_COLORS: Record<string, string> = {
  succeeded: 'bg-green-100 text-green-800 border-green-200',
  failed: 'bg-red-100 text-red-800 border-red-200',
  running: 'bg-blue-100 text-blue-800 border-blue-200',
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  waiting: 'bg-amber-100 text-amber-800 border-amber-200',
};

const formatDuration = (ms?: number) => {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)} s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)} m`;
  return `${(ms / 3600000).toFixed(1)} h`;
};

const formatTimestamp = (value?: string) => {
  if (!value) return '—';
  try {
    return format(new Date(value), 'MMM d, yyyy HH:mm:ss');
  } catch (error) {
    console.error('Failed to format timestamp', error);
    return value;
  }
};

const useFacetToggle = () => {
  const [values, setValues] = useState<string[]>([]);
  const toggleValue = (value: string) => {
    setValues((current) => {
      if (current.includes(value)) {
        return current.filter((entry) => entry !== value);
      }
      return [...current, value];
    });
  };
  const clear = () => setValues([]);
  return { values, toggleValue, clear };
};

const FacetGroup = ({
  title,
  facets,
  selected,
  onToggle,
  onClear,
}: {
  title: string;
  facets: RunFacetEntry[];
  selected: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
}) => (
  <Card className="border border-slate-200">
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-semibold text-slate-700">{title}</CardTitle>
      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onClear}>
        Reset
      </Button>
    </CardHeader>
    <CardContent className="space-y-2">
      {facets.length === 0 ? (
        <p className="text-xs text-slate-500">No facet data.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {facets.map((facet) => {
            const isActive = selected.includes(facet.value);
            return (
              <Button
                key={`${title}-${facet.value}`}
                variant={isActive ? 'default' : 'secondary'}
                size="sm"
                className="h-8 rounded-full"
                onClick={() => onToggle(facet.value)}
              >
                {facet.value}
                <Badge variant="outline" className="ml-2 text-xs">
                  {facet.count}
                </Badge>
              </Button>
            );
          })}
        </div>
      )}
    </CardContent>
  </Card>
);

const RunRow = ({
  run,
  onSelect,
}: {
  run: RunSummary;
  onSelect: (run: RunSummary) => void;
}) => {
  const statusStyle = STATUS_COLORS[run.status] ?? 'bg-slate-100 text-slate-800 border-slate-200';
  const duplicateCount = run.duplicateEvents?.length ?? 0;

  return (
    <Card className="border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="space-y-4 p-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={`border ${statusStyle}`}>
                {run.status}
              </Badge>
              <span className="text-sm text-slate-500">{run.triggerType ?? 'manual'}</span>
            </div>
            <h3 className="mt-2 text-lg font-semibold text-slate-900">{run.workflowName}</h3>
            <p className="text-sm text-slate-500">Execution ID: {run.executionId}</p>
            {run.organizationId && (
              <p className="text-sm text-slate-500">Organization: {run.organizationId}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-3 text-sm text-slate-500">
              <Clock className="h-4 w-4" />
              <span>{formatTimestamp(run.startTime)}</span>
            </div>
            <div className="text-sm text-slate-500">Duration: {formatDuration(run.durationMs)}</div>
            <Button variant="default" size="sm" onClick={() => onSelect(run)}>
              Open in Run Viewer
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-700">Connectors:</span>
            {run.connectors.length === 0 ? (
              <Badge variant="secondary">None</Badge>
            ) : (
              run.connectors.map((connector) => (
                <Badge key={`${run.executionId}-${connector}`} variant="secondary" className="capitalize">
                  {connector}
                </Badge>
              ))
            )}
          </div>
          <Separator orientation="vertical" className="h-5" />
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-700">Trace:</span>
            {run.correlationId ? (
              <a
                href={`/observability/traces/${run.correlationId}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-blue-600 hover:underline"
              >
                <LinkIcon className="h-4 w-4" />
                {run.correlationId}
              </a>
            ) : (
              <span className="text-slate-500">Not available</span>
            )}
          </div>
          <Separator orientation="vertical" className="h-5" />
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-700">Logs:</span>
            <a
              href={`/api/executions/${run.executionId}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-blue-600 hover:underline"
            >
              <Logs className="h-4 w-4" />
              Download JSON
            </a>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {duplicateCount > 0 ? (
            <Badge variant="destructive" className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              {duplicateCount} webhook duplicate{duplicateCount === 1 ? '' : 's'} detected
            </Badge>
          ) : (
            <Badge variant="outline" className="text-slate-600">
              No webhook dedupe events detected
            </Badge>
          )}
          {run.requestId && (
            <Badge variant="outline" className="flex items-center gap-2 text-slate-600">
              <RefreshCw className="h-4 w-4" />
              Request {run.requestId}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

const RunExplorer = () => {
  const [organizationId, setOrganizationId] = useState('');
  const [workflowId, setWorkflowId] = useState('');
  const statusFacet = useFacetToggle();
  const connectorFacet = useFacetToggle();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [data, setData] = useState<RunSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<RunSummary | null>(null);

  useEffect(() => {
    setPage(1);
  }, [organizationId, workflowId, statusFacet.values, connectorFacet.values]);

  useEffect(() => {
    const controller = new AbortController();
    const loadRuns = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await searchRuns({
          organizationId: organizationId || undefined,
          workflowId: workflowId || undefined,
          statuses: statusFacet.values,
          connectors: connectorFacet.values,
          page,
          pageSize,
        });
        if (!controller.signal.aborted) {
          setData(response);
          if (response.runs.length > 0) {
            if (!selectedRun || !response.runs.some((run) => run.executionId === selectedRun.executionId)) {
              setSelectedRun(response.runs[0]);
            }
          } else {
            setSelectedRun(null);
          }
        }
      } catch (fetchError) {
        if (!controller.signal.aborted) {
          setError(fetchError instanceof Error ? fetchError.message : 'Failed to load runs');
          setData(null);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    loadRuns();
    return () => controller.abort();
  }, [organizationId, workflowId, statusFacet.values, connectorFacet.values, page, pageSize]);

  const pagination = data?.pagination;
  const canGoNext = Boolean(pagination?.hasMore);
  const canGoPrev = page > 1;

  const duplicateDetails = useMemo(() => {
    if (!selectedRun) return [] as RunSummary['duplicateEvents'];
    return selectedRun.duplicateEvents ?? [];
  }, [selectedRun]);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-slate-900">Run Explorer</h1>
        <p className="text-sm text-slate-600">
          Investigate workflow executions with rich filtering, connector facets, and deep links into detailed telemetry.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <div className="flex flex-col gap-4">
          <Card className="border border-slate-200">
            <CardHeader>
              <CardTitle className="text-base font-semibold text-slate-800">Filters</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700" htmlFor="organizationId">
                  Organization ID
                </label>
                <Input
                  id="organizationId"
                  placeholder="org_..."
                  value={organizationId}
                  onChange={(event) => setOrganizationId(event.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700" htmlFor="workflowId">
                  Workflow ID
                </label>
                <Input
                  id="workflowId"
                  placeholder="wf_..."
                  value={workflowId}
                  onChange={(event) => setWorkflowId(event.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700" htmlFor="pageSize">
                  Page size
                </label>
                <Input
                  id="pageSize"
                  type="number"
                  min={5}
                  max={100}
                  value={pageSize}
                  onChange={(event) => setPageSize(Number(event.target.value) || 25)}
                />
              </div>
            </CardContent>
          </Card>

          <FacetGroup
            title="Status"
            facets={data?.facets.status ?? []}
            selected={statusFacet.values}
            onToggle={statusFacet.toggleValue}
            onClear={statusFacet.clear}
          />

          <FacetGroup
            title="Connectors"
            facets={data?.facets.connector ?? []}
            selected={connectorFacet.values}
            onToggle={connectorFacet.toggleValue}
            onClear={connectorFacet.clear}
          />
        </div>

        <div className="flex flex-col gap-6">
          <Card className="border border-slate-200">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg font-semibold text-slate-800">Recent Runs</CardTitle>
              <div className="flex items-center gap-2 text-sm text-slate-600">
                {pagination ? `${pagination.total} total` : 'Loading totals...'}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && (
                <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  {error}
                </div>
              )}

              {loading && (
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Loading runs...
                </div>
              )}

              {!loading && data && data.runs.length === 0 && (
                <p className="text-sm text-slate-500">No runs match the current filters.</p>
              )}

              <div className="space-y-4">
                {data?.runs.map((run) => (
                  <RunRow key={run.executionId} run={run} onSelect={setSelectedRun} />
                ))}
              </div>

              {pagination && (
                <div className="flex items-center justify-between pt-2 text-sm text-slate-600">
                  <span>
                    Page {pagination.page} • Showing {data?.runs.length ?? 0} of {pagination.total}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" disabled={!canGoPrev} onClick={() => canGoPrev && setPage((p) => p - 1)}>
                      Previous
                    </Button>
                    <Button variant="outline" size="sm" disabled={!canGoNext} onClick={() => canGoNext && setPage((p) => p + 1)}>
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {selectedRun && (
            <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
              <Card className="border border-slate-200">
                <CardHeader>
                  <CardTitle className="text-base font-semibold text-slate-800">Webhook Dedupe Activity</CardTitle>
                </CardHeader>
                <CardContent>
                  {duplicateDetails.length === 0 ? (
                    <p className="text-sm text-slate-500">No duplicate webhook deliveries recorded for this run.</p>
                  ) : (
                    <ScrollArea className="h-48">
                      <div className="space-y-3 pr-2">
                        {duplicateDetails.map((event) => (
                          <div key={event.id} className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                            <div className="flex items-center justify-between">
                              <span className="font-medium">{event.webhookId}</span>
                              <span className="text-xs text-amber-700">
                                {formatTimestamp(event.timestamp)}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-amber-800">{event.error}</p>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>

              <Card className="border border-slate-200">
                <CardHeader>
                  <CardTitle className="text-base font-semibold text-slate-800">Run Viewer</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <RunViewer executionId={selectedRun.executionId} workflowId={selectedRun.workflowId} />
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RunExplorer;
