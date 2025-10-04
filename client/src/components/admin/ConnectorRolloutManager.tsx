import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { AlertTriangle, CalendarClock, RefreshCcw, Save } from 'lucide-react';
import { format } from 'date-fns';

interface ConnectorRolloutRecord {
  id: string;
  slug: string;
  name: string;
  version: string;
  semanticVersion: string;
  lifecycleStage: 'planning' | 'beta' | 'stable' | 'deprecated' | 'sunset';
  isBeta: boolean;
  betaStartAt: string | null;
  betaEndAt: string | null;
  deprecationStartAt: string | null;
  sunsetAt: string | null;
  updatedAt: string | null;
}

type ConnectorRolloutDraft = Partial<ConnectorRolloutRecord>;

type StageKey = ConnectorRolloutRecord['lifecycleStage'];

const stageLabels: Record<StageKey, string> = {
  planning: 'Planned',
  beta: 'Beta',
  stable: 'Stable',
  deprecated: 'Deprecated',
  sunset: 'Sunset',
};

const stageBadgeVariants: Record<StageKey, string> = {
  planning: 'bg-slate-100 text-slate-700',
  beta: 'bg-amber-100 text-amber-800',
  stable: 'bg-emerald-100 text-emerald-800',
  deprecated: 'bg-rose-100 text-rose-800',
  sunset: 'bg-orange-100 text-orange-800',
};

const toDateInputValue = (value: string | null | undefined) =>
  value ? format(new Date(value), 'yyyy-MM-dd') : '';

const fromDateInputValue = (value: string): string | null => (value ? new Date(value).toISOString() : null);

export const ConnectorRolloutManager: React.FC = () => {
  const [connectors, setConnectors] = useState<ConnectorRolloutRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, ConnectorRolloutDraft>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const summary = useMemo(() => {
    return connectors.reduce(
      (acc, connector) => {
        acc.total += 1;
        acc.stageCounts[connector.lifecycleStage] = (acc.stageCounts[connector.lifecycleStage] ?? 0) + 1;
        if (connector.isBeta) acc.beta += 1;
        if (connector.sunsetAt) acc.sunset += 1;
        return acc;
      },
      {
        total: 0,
        beta: 0,
        sunset: 0,
        stageCounts: {} as Record<StageKey, number>,
      }
    );
  }, [connectors]);

  const fetchConnectors = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/connectors/rollouts', {
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`Request failed (${response.status})`);
      }

      const payload = await response.json();
      if (!payload.success) {
        throw new Error(payload.error || 'Unknown error fetching connectors');
      }

      setConnectors(payload.connectors as ConnectorRolloutRecord[]);
      setDrafts({});
    } catch (err: any) {
      setError(err?.message || 'Unable to load connectors');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchConnectors();
  }, []);

  const applyDraft = (slug: string, changes: ConnectorRolloutDraft) => {
    setDrafts(prev => ({
      ...prev,
      [slug]: {
        ...(prev[slug] ?? {}),
        ...changes,
      },
    }));
  };

  const getConnectorDraft = (slug: string) => drafts[slug] ?? {};

  const getDisplayConnector = (connector: ConnectorRolloutRecord): ConnectorRolloutRecord & ConnectorRolloutDraft => ({
    ...connector,
    ...getConnectorDraft(connector.slug),
  });

  const saveConnector = async (connector: ConnectorRolloutRecord) => {
    const draft = getConnectorDraft(connector.slug);
    if (Object.keys(draft).length === 0) {
      return;
    }

    setSaving(prev => ({ ...prev, [connector.slug]: true }));
    setError(null);

    try {
      const response = await fetch(`/api/admin/connectors/${connector.slug}/rollout`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          semanticVersion: draft.semanticVersion ?? draft.version,
          version: draft.version,
          lifecycleStage: draft.lifecycleStage,
          isBeta: draft.isBeta,
          betaStartAt: draft.betaStartAt,
          betaEndAt: draft.betaEndAt,
          deprecationStartAt: draft.deprecationStartAt,
          sunsetAt: draft.sunsetAt,
        }),
      });

      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || `Failed to update ${connector.name}`);
      }

      setConnectors(prev =>
        prev.map(item => (item.slug === connector.slug ? (payload.connector as ConnectorRolloutRecord) : item))
      );
      setDrafts(prev => {
        const next = { ...prev };
        delete next[connector.slug];
        return next;
      });
    } catch (err: any) {
      setError(err?.message || 'Failed to update connector rollout');
    } finally {
      setSaving(prev => ({ ...prev, [connector.slug]: false }));
    }
  };

  const resetDraft = (slug: string) => {
    setDrafts(prev => {
      if (!prev[slug]) return prev;
      const next = { ...prev };
      delete next[slug];
      return next;
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <CardTitle>Connector Rollout Management</CardTitle>
          <p className="text-sm text-muted-foreground">
            Control beta programs, set semantic versions, and schedule deprecations for every connector.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => fetchConnectors()} disabled={loading}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-muted/50 p-4">
          <div>
            <p className="text-sm font-medium">Total connectors</p>
            <p className="text-2xl font-semibold">{summary.total}</p>
          </div>
          <Separator orientation="vertical" className="h-10 hidden md:block" />
          <div>
            <p className="text-sm font-medium">Active beta programs</p>
            <p className="text-2xl font-semibold text-amber-600">{summary.beta}</p>
          </div>
          <Separator orientation="vertical" className="h-10 hidden md:block" />
          <div>
            <p className="text-sm font-medium">Scheduled sunsets</p>
            <p className="text-2xl font-semibold text-orange-600">{summary.sunset}</p>
          </div>
          <Separator orientation="vertical" className="h-10 hidden md:block" />
          <div className="flex flex-wrap gap-2">
            {(Object.keys(stageLabels) as StageKey[]).map(stage => (
              <Badge key={stage} className={`${stageBadgeVariants[stage]} font-normal`}>
                {stageLabels[stage]} • {summary.stageCounts[stage] ?? 0}
              </Badge>
            ))}
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </div>
        )}

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[180px]">Connector</TableHead>
                <TableHead>Semantic Version</TableHead>
                <TableHead>Lifecycle Stage</TableHead>
                <TableHead className="text-center">Beta</TableHead>
                <TableHead>Beta Window</TableHead>
                <TableHead>Deprecation Window</TableHead>
                <TableHead>Sunset</TableHead>
                <TableHead className="w-[140px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                    Loading connectors…
                  </TableCell>
                </TableRow>
              ) : connectors.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                    No connectors available.
                  </TableCell>
                </TableRow>
              ) : (
                connectors.map(connector => {
                  const draft = getConnectorDraft(connector.slug);
                  const merged = getDisplayConnector(connector);
                  const hasDraft = Object.keys(draft).length > 0;

                  return (
                    <TableRow key={connector.slug} className={hasDraft ? 'bg-muted/30' : undefined}>
                      <TableCell>
                        <div className="font-medium">{connector.name}</div>
                        <div className="text-xs text-muted-foreground">{connector.slug}</div>
                        {connector.updatedAt && (
                          <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                            <CalendarClock className="h-3 w-3" />
                            Updated {format(new Date(connector.updatedAt), 'PPpp')}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Input
                          value={merged.semanticVersion}
                          onChange={event =>
                            applyDraft(connector.slug, {
                              semanticVersion: event.target.value,
                              version: event.target.value,
                            })
                          }
                          placeholder="1.0.0"
                          className="max-w-[140px]"
                        />
                      </TableCell>
                      <TableCell>
                        <Select
                          value={merged.lifecycleStage}
                          onValueChange={value =>
                            applyDraft(connector.slug, {
                              lifecycleStage: value as StageKey,
                            })
                          }
                        >
                          <SelectTrigger className="w-[150px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(Object.keys(stageLabels) as StageKey[]).map(stage => (
                              <SelectItem key={stage} value={stage}>
                                {stageLabels[stage]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Switch
                            checked={Boolean(merged.isBeta)}
                            onCheckedChange={checked =>
                              applyDraft(connector.slug, {
                                isBeta: checked,
                                lifecycleStage: checked
                                  ? 'beta'
                                  : (() => {
                                      const draftStage = draft.lifecycleStage;
                                      if (draftStage && draftStage !== 'beta') return draftStage;
                                      const originalStage = connector.lifecycleStage;
                                      return originalStage !== 'beta' ? originalStage : 'stable';
                                    })(),
                              })
                            }
                          />
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-2">
                          <Input
                            type="date"
                            value={toDateInputValue(merged.betaStartAt)}
                            onChange={event =>
                              applyDraft(connector.slug, {
                                betaStartAt: fromDateInputValue(event.target.value),
                              })
                            }
                          />
                          <Input
                            type="date"
                            value={toDateInputValue(merged.betaEndAt)}
                            onChange={event =>
                              applyDraft(connector.slug, {
                                betaEndAt: fromDateInputValue(event.target.value),
                              })
                            }
                          />
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-2">
                          <Input
                            type="date"
                            value={toDateInputValue(merged.deprecationStartAt)}
                            onChange={event =>
                              applyDraft(connector.slug, {
                                deprecationStartAt: fromDateInputValue(event.target.value),
                              })
                            }
                          />
                        </div>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="date"
                          value={toDateInputValue(merged.sunsetAt)}
                          onChange={event =>
                            applyDraft(connector.slug, {
                              sunsetAt: fromDateInputValue(event.target.value),
                            })
                          }
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => resetDraft(connector.slug)}
                            disabled={!hasDraft || saving[connector.slug]}
                          >
                            Reset
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => saveConnector(connector)}
                            disabled={!hasDraft || saving[connector.slug]}
                          >
                            <Save className="mr-2 h-4 w-4" />
                            Save
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};

export default ConnectorRolloutManager;
