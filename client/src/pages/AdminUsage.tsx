import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { format } from 'date-fns';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuthStore } from '@/store/authStore';
import { Loader2, Download, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface UsageExportRow {
  userId: string;
  email: string;
  planCode: string;
  planName: string;
  apiCalls: number;
  tokensUsed: number;
  workflowRuns: number;
  storageUsed: number;
  estimatedCost: number;
}

interface UsageExportSummary {
  totalApiCalls: number;
  totalTokensUsed: number;
  totalWorkflowRuns: number;
  totalEstimatedCost: number;
  distinctUsers: number;
}

interface UsageExportResponse {
  success: boolean;
  report?: {
    rows: UsageExportRow[];
    summary: UsageExportSummary;
    period: { startDate: string; endDate: string };
  };
  error?: string;
}

interface UsageAlert {
  userId: string;
  type: 'approaching_limit' | 'limit_exceeded' | 'unusual_usage';
  quotaType: string;
  threshold: number;
  current: number;
  limit: number;
  timestamp: string;
}

interface UsageAlertResponse {
  success: boolean;
  alerts: UsageAlert[];
  error?: string;
}

const formatNumber = (value: number) => new Intl.NumberFormat().format(value);

const AdminUsage: React.FC = () => {
  const { authFetch } = useAuthStore((state) => ({ authFetch: state.authFetch }));
  const [loading, setLoading] = useState(true);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [report, setReport] = useState<UsageExportResponse['report'] | null>(null);
  const [alerts, setAlerts] = useState<UsageAlert[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [threshold, setThreshold] = useState(80);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const response = await authFetch('/api/usage/export?format=json');
        const data = (await response.json()) as UsageExportResponse;
        if (!response.ok || !data.success || !data.report) {
          throw new Error(data.error || 'Failed to load usage report');
        }
        setReport(data.report);
      } catch (err: any) {
        setError(err?.message || 'Failed to load usage report');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [authFetch]);

  const loadAlerts = async (nextThreshold: number) => {
    setAlertsLoading(true);
    try {
      const response = await authFetch(`/api/usage/alerts?threshold=${nextThreshold}`);
      const data = (await response.json()) as UsageAlertResponse;
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to load alerts');
      }
      setAlerts(data.alerts);
    } catch (err: any) {
      setError(err?.message || 'Failed to load alerts');
    } finally {
      setAlertsLoading(false);
    }
  };

  useEffect(() => {
    void loadAlerts(threshold);
  }, [threshold]);

  const handleDownloadCsv = async () => {
    try {
      const response = await authFetch('/api/usage/export?format=csv');
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || 'Failed to download usage export');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const fileName = `usage-export-${format(new Date(), 'yyyy-MM-dd')}.csv`;
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('Usage export downloaded');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to download usage export');
    }
  };

  const summarizedAlerts = useMemo(() => {
    const grouped = new Map<string, UsageAlert[]>();
    for (const alert of alerts) {
      const key = `${alert.userId}-${alert.quotaType}`;
      const existing = grouped.get(key) ?? [];
      existing.push(alert);
      grouped.set(key, existing);
    }
    return Array.from(grouped.values()).map((group) => group.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0]);
  }, [alerts]);

  return (
    <>
      <Helmet>
        <title>Usage &amp; Billing Insights</title>
      </Helmet>
      <div className="container mx-auto py-10 space-y-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Usage &amp; Billing Insights</h1>
            <p className="text-muted-foreground">Download finance-ready exports and monitor quota alerts in real time.</p>
          </div>
          <Button onClick={handleDownloadCsv} disabled={loading} className="inline-flex items-center gap-2">
            <Download className="h-4 w-4" />
            Download CSV
          </Button>
        </header>

        {error && (
          <Card className="border-destructive/30 bg-destructive/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                {error}
              </CardTitle>
            </CardHeader>
          </Card>
        )}

        <section>
          <Card>
            <CardHeader>
              <CardTitle>Usage summary</CardTitle>
            </CardHeader>
            <CardContent>
              {loading || !report ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading usage data...
                </div>
              ) : (
                <div className="grid gap-6 md:grid-cols-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Billing period</p>
                    <p className="text-lg font-semibold">
                      {format(new Date(report.period.startDate), 'MMM d, yyyy')} – {format(new Date(report.period.endDate), 'MMM d, yyyy')}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">API calls</p>
                    <p className="text-2xl font-bold">{formatNumber(report.summary.totalApiCalls)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Tokens used</p>
                    <p className="text-2xl font-bold">{formatNumber(report.summary.totalTokensUsed)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Estimated spend</p>
                    <p className="text-2xl font-bold">${(report.summary.totalEstimatedCost / 100).toFixed(2)}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Quota alerts</h2>
            <div className="flex items-center gap-3 text-sm">
              <label htmlFor="threshold" className="text-muted-foreground">Threshold</label>
              <input
                id="threshold"
                type="number"
                min={10}
                max={100}
                step={5}
                value={threshold}
                onChange={(event) => setThreshold(Number(event.target.value) || 80)}
                className="w-20 rounded-md border border-input bg-background px-2 py-1"
              />
            </div>
          </div>
          <Card>
            <CardContent className="pt-6">
              {alertsLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Checking alerts...
                </div>
              ) : summarizedAlerts.length === 0 ? (
                <p className="text-muted-foreground">No alerts at the moment. All teams are within their quotas.</p>
              ) : (
                <ul className="space-y-3">
                  {summarizedAlerts.map((alert) => (
                    <li key={`${alert.userId}-${alert.quotaType}`} className="flex items-center justify-between rounded-md border border-border/60 px-4 py-2">
                      <div>
                        <p className="font-medium">{alert.quotaType.replace('_', ' ')} • {alert.type === 'limit_exceeded' ? 'Limit exceeded' : 'Approaching limit'}</p>
                        <p className="text-sm text-muted-foreground">
                          User {alert.userId} is at {formatNumber(alert.current)} of {formatNumber(alert.limit)} ({((alert.current / alert.limit) * 100).toFixed(1)}%).
                        </p>
                      </div>
                      <Badge variant={alert.type === 'limit_exceeded' ? 'destructive' : 'secondary'}>
                        {format(new Date(alert.timestamp), 'MMM d, yyyy HH:mm')}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>

        <section>
          <h2 className="mb-4 text-xl font-semibold">Detailed usage by account</h2>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left">
                    <tr>
                      <th className="px-4 py-3 font-medium">User</th>
                      <th className="px-4 py-3 font-medium">Plan</th>
                      <th className="px-4 py-3 font-medium text-right">API calls</th>
                      <th className="px-4 py-3 font-medium text-right">Tokens</th>
                      <th className="px-4 py-3 font-medium text-right">Workflow runs</th>
                      <th className="px-4 py-3 font-medium text-right">Storage (MB)</th>
                      <th className="px-4 py-3 font-medium text-right">Est. cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading || !report ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                          Loading usage rows...
                        </td>
                      </tr>
                    ) : report.rows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                          No usage recorded this period.
                        </td>
                      </tr>
                    ) : (
                      report.rows.map((row) => (
                        <tr key={row.userId} className="border-t border-border/60">
                          <td className="px-4 py-3">
                            <div className="font-medium">{row.email}</div>
                            <div className="text-xs text-muted-foreground">{row.userId}</div>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="outline">{row.planName}</Badge>
                          </td>
                          <td className="px-4 py-3 text-right">{formatNumber(row.apiCalls)}</td>
                          <td className="px-4 py-3 text-right">{formatNumber(row.tokensUsed)}</td>
                          <td className="px-4 py-3 text-right">{formatNumber(row.workflowRuns)}</td>
                          <td className="px-4 py-3 text-right">{(row.storageUsed / (1024 * 1024)).toFixed(2)}</td>
                          <td className="px-4 py-3 text-right">${(row.estimatedCost / 100).toFixed(2)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </>
  );
};

export default AdminUsage;
