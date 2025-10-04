import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import type { WorkflowDiffSummary, WorkflowEnvironment } from '../../../../common/workflow-types';

interface WorkflowVersionRecord {
  id: string;
  workflowId: string;
  organizationId: string;
  versionNumber: number;
  state: string;
  metadata?: Record<string, any> | null;
  name?: string | null;
  description?: string | null;
  createdAt: string;
  createdBy?: string | null;
  publishedAt?: string | null;
  publishedBy?: string | null;
}

interface WorkflowDeploymentRecord {
  id: string;
  workflowId: string;
  organizationId: string;
  versionId: string;
  environment: WorkflowEnvironment;
  deployedAt: string;
  deployedBy?: string | null;
  metadata?: Record<string, any> | null;
  rollbackOf?: string | null;
}

interface WorkflowVersionHistoryResponse {
  versions: WorkflowVersionRecord[];
  deployments: WorkflowDeploymentRecord[];
  environments: Record<WorkflowEnvironment, {
    activeDeployment: WorkflowDeploymentRecord | null;
    version: WorkflowVersionRecord | null;
  }>;
}

interface PromotionState {
  loading: boolean;
  target: WorkflowEnvironment | null;
  versionId: string | null;
  error: string | null;
}

interface DiffPreviewState {
  versionId: string | null;
  target: WorkflowEnvironment;
  loading: boolean;
  summary: WorkflowDiffSummary | null;
  error: string | null;
}

interface WorkflowVersionPanelProps {
  workflowId: string | null;
}

const ENVIRONMENT_LABELS: Record<WorkflowEnvironment, string> = {
  draft: 'Draft',
  test: 'Test',
  production: 'Production',
};

const formatDate = (value?: string | null): string => {
  if (!value) {
    return 'Unknown';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return `${formatDistanceToNow(date, { addSuffix: true })}`;
};

export function WorkflowVersionPanel({ workflowId }: WorkflowVersionPanelProps) {
  const [history, setHistory] = useState<WorkflowVersionHistoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [promotion, setPromotion] = useState<PromotionState>({
    loading: false,
    target: null,
    versionId: null,
    error: null,
  });
  const [diff, setDiff] = useState<DiffPreviewState>({
    versionId: null,
    target: 'test',
    loading: false,
    summary: null,
    error: null,
  });

  const fetchHistory = useCallback(async () => {
    if (!workflowId) {
      setHistory(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/workflows/${workflowId}/versions`);
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }
      const data = await response.json();
      setHistory(data.history as WorkflowVersionHistoryResponse);
    } catch (fetchError: any) {
      console.error('Failed to load workflow version history', fetchError);
      setError(fetchError?.message ?? 'Failed to load version history');
    } finally {
      setLoading(false);
    }
  }, [workflowId]);

  useEffect(() => {
    void fetchHistory();
  }, [fetchHistory]);

  const versions = history?.versions ?? [];

  const environmentStatuses = useMemo(() => {
    if (!history) {
      return [] as Array<{ environment: WorkflowEnvironment; label: string; version?: WorkflowVersionRecord | null; deployment?: WorkflowDeploymentRecord | null }>;
    }
    return (Object.keys(history.environments) as WorkflowEnvironment[]).map((key) => {
      const slot = history.environments[key];
      return {
        environment: key,
        label: ENVIRONMENT_LABELS[key],
        version: slot?.version ?? null,
        deployment: slot?.activeDeployment ?? null,
      };
    });
  }, [history]);

  const handleValidate = useCallback(async (versionId: string, target: WorkflowEnvironment) => {
    if (!workflowId) {
      return;
    }

    try {
      setDiff({ versionId, target, loading: true, summary: null, error: null });
      const response = await fetch(`/api/workflows/${workflowId}/versions/${versionId}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetEnvironment: target }),
      });
      if (!response.ok) {
        throw new Error(`Validation failed with status ${response.status}`);
      }
      const data = await response.json();
      setDiff({
        versionId,
        target,
        loading: false,
        summary: data.diff as WorkflowDiffSummary,
        error: null,
      });
    } catch (validationError: any) {
      console.error('Failed to validate workflow version promotion', validationError);
      setDiff({
        versionId,
        target,
        loading: false,
        summary: null,
        error: validationError?.message ?? 'Failed to validate workflow version',
      });
    }
  }, [workflowId]);

  const handlePromote = useCallback(async (versionId: string, target: WorkflowEnvironment) => {
    if (!workflowId) {
      return;
    }

    try {
      setPromotion({ loading: true, target, versionId, error: null });
      const response = await fetch(`/api/workflows/${workflowId}/versions/${versionId}/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message = payload?.error ?? `Promotion failed with status ${response.status}`;
        throw new Error(message);
      }
      await fetchHistory();
      setPromotion({ loading: false, target: null, versionId: null, error: null });
    } catch (promotionError: any) {
      console.error('Failed to promote workflow version', promotionError);
      setPromotion({
        loading: false,
        target,
        versionId,
        error: promotionError?.message ?? 'Failed to promote workflow version',
      });
    }
  }, [fetchHistory, workflowId]);

  const selectedDiff = diff.summary && diff.versionId ? diff.summary : null;

  return (
    <Card className="h-full border-l border-border/60 rounded-none">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Version Control</CardTitle>
      </CardHeader>
      <CardContent className="p-0 flex flex-col h-full">
        {!workflowId ? (
          <div className="p-4 text-sm text-muted-foreground">
            Select or create a workflow to manage versions.
          </div>
        ) : (
          <>
            {error ? (
              <Alert variant="destructive" className="m-4">
                <AlertTitle>Unable to load versions</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <div className="px-4 pb-4 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground">Environment Status</h3>
                <div className="mt-2 space-y-2">
                  {environmentStatuses.map((entry) => (
                    <div key={entry.environment} className="flex items-center justify-between text-sm">
                      <div className="flex flex-col">
                        <span className="font-medium">{entry.label}</span>
                        {entry.deployment ? (
                          <span className="text-xs text-muted-foreground">
                            Deployed {formatDate(entry.deployment.deployedAt)}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">No active deployment</span>
                        )}
                      </div>
                      <Badge variant={entry.environment === 'production' ? 'destructive' : entry.environment === 'test' ? 'secondary' : 'outline'}>
                        {entry.version ? `v${entry.version.versionNumber}` : '—'}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-muted-foreground">Versions</h3>
                  {loading ? <span className="text-xs text-muted-foreground">Refreshing…</span> : null}
                </div>
                <ScrollArea className="h-56">
                  <div className="space-y-3 pr-2">
                    {versions.map((version) => {
                      const isSelected = diff.versionId === version.id;
                      return (
                        <div key={version.id} className={`rounded-md border p-3 space-y-2 ${isSelected ? 'border-primary/60 shadow-sm' : 'border-border/60'}`}>
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-semibold">Version {version.versionNumber}</p>
                              <p className="text-xs text-muted-foreground">Created {formatDate(version.createdAt)}</p>
                            </div>
                            <Badge variant={version.state === 'published' ? 'default' : 'outline'}>{version.state}</Badge>
                          </div>
                          {version.description ? (
                            <p className="text-xs text-muted-foreground leading-snug">{version.description}</p>
                          ) : null}
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleValidate(version.id, 'test')}
                              disabled={diff.loading && diff.versionId === version.id && diff.target === 'test'}
                            >
                              {diff.loading && diff.versionId === version.id && diff.target === 'test'
                                ? 'Validating…'
                                : 'Preview Test Diff'}
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleValidate(version.id, 'production')}
                              disabled={diff.loading && diff.versionId === version.id && diff.target === 'production'}
                            >
                              {diff.loading && diff.versionId === version.id && diff.target === 'production'
                                ? 'Validating…'
                                : 'Preview Prod Diff'}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handlePromote(version.id, 'test')}
                              disabled={promotion.loading}
                            >
                              {promotion.loading && promotion.versionId === version.id && promotion.target === 'test'
                                ? 'Promoting…'
                                : 'Promote to Test'}
                            </Button>
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => handlePromote(version.id, 'production')}
                              disabled={promotion.loading}
                            >
                              {promotion.loading && promotion.versionId === version.id && promotion.target === 'production'
                                ? 'Activating…'
                                : 'Activate Production'}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                    {versions.length === 0 && !loading ? (
                      <div className="text-xs text-muted-foreground">No versions recorded yet.</div>
                    ) : null}
                  </div>
                </ScrollArea>
              </div>

              {promotion.error ? (
                <Alert variant="destructive">
                  <AlertTitle>Promotion failed</AlertTitle>
                  <AlertDescription>{promotion.error}</AlertDescription>
                </Alert>
              ) : null}

              {diff.error ? (
                <Alert variant="destructive">
                  <AlertTitle>Validation failed</AlertTitle>
                  <AlertDescription>{diff.error}</AlertDescription>
                </Alert>
              ) : null}

              {selectedDiff ? (
                <Tabs defaultValue="summary" className="w-full">
                  <TabsList className="grid grid-cols-3">
                    <TabsTrigger value="summary">Summary</TabsTrigger>
                    <TabsTrigger value="added">Added</TabsTrigger>
                    <TabsTrigger value="removed">Removed</TabsTrigger>
                  </TabsList>
                  <TabsContent value="summary" className="space-y-2 text-xs text-muted-foreground">
                    <p>
                      Target environment: <span className="font-medium">{ENVIRONMENT_LABELS[diff.target]}</span>
                    </p>
                    <p>
                      {selectedDiff.hasChanges
                        ? 'Changes detected between the active deployment and this version.'
                        : 'No changes detected.'}
                    </p>
                    {selectedDiff.hasBreakingChanges ? (
                      <Alert variant="destructive" className="text-xs">
                        <AlertTitle>Breaking changes detected</AlertTitle>
                        <AlertDescription>
                          {selectedDiff.breakingChanges.map((change) => change.description).join('\n')}
                        </AlertDescription>
                      </Alert>
                    ) : (
                      <p className="text-xs text-green-600 dark:text-green-400">No breaking changes detected.</p>
                    )}
                  </TabsContent>
                  <TabsContent value="added" className="space-y-2 text-xs text-muted-foreground">
                    <div>
                      <p className="font-medium">Added Nodes</p>
                      <ul className="list-disc list-inside">
                        {selectedDiff.addedNodes.length > 0
                          ? selectedDiff.addedNodes.map((node) => <li key={node}>{node}</li>)
                          : <li>None</li>}
                      </ul>
                    </div>
                    <div>
                      <p className="font-medium">Added Edges</p>
                      <ul className="list-disc list-inside">
                        {selectedDiff.addedEdges.length > 0
                          ? selectedDiff.addedEdges.map((edge) => <li key={edge}>{edge}</li>)
                          : <li>None</li>}
                      </ul>
                    </div>
                  </TabsContent>
                  <TabsContent value="removed" className="space-y-2 text-xs text-muted-foreground">
                    <div>
                      <p className="font-medium">Removed Nodes</p>
                      <ul className="list-disc list-inside">
                        {selectedDiff.removedNodes.length > 0
                          ? selectedDiff.removedNodes.map((node) => <li key={node}>{node}</li>)
                          : <li>None</li>}
                      </ul>
                    </div>
                    <div>
                      <p className="font-medium">Removed Edges</p>
                      <ul className="list-disc list-inside">
                        {selectedDiff.removedEdges.length > 0
                          ? selectedDiff.removedEdges.map((edge) => <li key={edge}>{edge}</li>)
                          : <li>None</li>}
                      </ul>
                    </div>
                    {selectedDiff.breakingChanges.length > 0 ? (
                      <div>
                        <p className="font-medium">Breaking Changes</p>
                        <ul className="list-disc list-inside">
                          {selectedDiff.breakingChanges.map((change, index) => (
                            <li key={`${change.nodeId}-${index}`}>{change.description}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </TabsContent>
                </Tabs>
              ) : null}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default WorkflowVersionPanel;
