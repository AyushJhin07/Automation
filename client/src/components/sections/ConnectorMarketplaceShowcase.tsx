import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, RefreshCcw } from 'lucide-react';

interface MarketplaceConnector {
  id: string;
  name: string;
  description?: string;
  availability?: string;
  version?: string;
  versionInfo?: {
    semantic: string;
    releaseDate?: string | null;
    notes?: string | null;
  };
  lifecycle?: {
    status?: 'planning' | 'beta' | 'stable' | 'deprecated' | 'sunset';
    beta?: { enabled?: boolean };
    sunsetDate?: string | null;
  };
}

const lifecycleBadgeClass: Record<string, string> = {
  stable: 'bg-emerald-100 text-emerald-800',
  beta: 'bg-amber-100 text-amber-800',
  deprecated: 'bg-rose-100 text-rose-800',
  sunset: 'bg-orange-100 text-orange-800',
  planning: 'bg-slate-100 text-slate-700',
};

const lifecycleLabel: Record<string, string> = {
  stable: 'Stable',
  beta: 'Beta',
  deprecated: 'Deprecated',
  sunset: 'Sunset',
  planning: 'Planned',
};

const determineLifecycle = (connector: MarketplaceConnector): keyof typeof lifecycleLabel => {
  const status = connector.lifecycle?.status ?? connector.availability;
  if (!status) return 'planning';
  if (status === 'experimental') return 'beta';
  if (status === 'disabled') return 'sunset';
  if (status === 'stable') return 'stable';
  if (status === 'beta') return 'beta';
  if (status === 'deprecated' || status === 'sunset') return 'sunset';
  return (status as keyof typeof lifecycleLabel) ?? 'planning';
};

export const ConnectorMarketplaceShowcase: React.FC = () => {
  const [connectors, setConnectors] = useState<MarketplaceConnector[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConnectors = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/connectors?includeExperimental=true');
      if (!response.ok) {
        throw new Error(`Failed to load connectors (${response.status})`);
      }
      const payload = await response.json();
      if (!payload.success) {
        throw new Error(payload.error || 'Unknown error loading connectors');
      }
      setConnectors(payload.connectors as MarketplaceConnector[]);
    } catch (err: any) {
      setError(err?.message || 'Unable to load marketplace connectors');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchConnectors();
  }, []);

  const featuredConnectors = useMemo(() => {
    return connectors
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 8);
  }, [connectors]);

  return (
    <section className="container mx-auto py-12 md:py-20">
      <div className="mb-8 flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight">Marketplace Highlights</h2>
          <p className="max-w-2xl text-muted-foreground">
            Discover the latest connector releases, beta programs, and upcoming sunsets. Stay informed before rolling out
            changes to your workflows.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => fetchConnectors()} disabled={loading}>
          <RefreshCcw className="mr-2 h-4 w-4" /> Refresh
        </Button>
      </div>

      {error && (
        <div className="mb-6 flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {loading
          ? Array.from({ length: 6 }).map((_, index) => (
              <Card key={`skeleton-${index}`} className="border-dashed">
                <CardHeader>
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="mt-2 h-4 w-full" />
                </CardHeader>
                <CardContent className="space-y-3">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-5/6" />
                  <Skeleton className="h-3 w-2/3" />
                </CardContent>
              </Card>
            ))
          : featuredConnectors.map(connector => {
              const lifecycle = determineLifecycle(connector);
              const badgeClass = lifecycleBadgeClass[lifecycle] ?? lifecycleBadgeClass.planning;
              const version = connector.versionInfo?.semantic ?? connector.version ?? '1.0.0';
              const notes = connector.versionInfo?.notes;
              return (
                <Card key={connector.id} className="flex flex-col justify-between">
                  <CardHeader className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-lg font-semibold">{connector.name}</CardTitle>
                      <Badge className={`${badgeClass} font-normal`}>{lifecycleLabel[lifecycle]}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-3">
                      {connector.description || 'No description provided.'}
                    </p>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    <div>
                      <p className="text-xs uppercase text-muted-foreground">Semantic Version</p>
                      <p className="text-base font-medium">{version}</p>
                    </div>
                    <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                      <span>
                        {connector.lifecycle?.beta?.enabled
                          ? 'Participating in beta rollout'
                          : 'General availability'}
                      </span>
                      {connector.lifecycle?.sunsetDate && (
                        <span>Sunset scheduled for {new Date(connector.lifecycle.sunsetDate).toLocaleDateString()}</span>
                      )}
                      {notes && <span className="italic text-foreground/70">{notes}</span>}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
      </div>
    </section>
  );
};

export default ConnectorMarketplaceShowcase;
