import React, { useState, useEffect } from 'react';
import { Helmet } from "react-helmet-async";
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Settings,
  Key,
  Brain,
  Save,
  TestTube,
  CheckCircle2,
  AlertCircle,
  Activity,
  Eye,
  EyeOff,
  Loader2
} from 'lucide-react';
import ConnectionManager from '@/components/connections/ConnectionManager';
import { useAuthStore } from '@/store/authStore';
import { toast } from 'sonner';

type ConnectorLifecycleStatus = 'ga' | 'beta' | 'deprecated' | 'sunset';

interface ConnectorLifecycleRow {
  id: string;
  slug: string;
  name: string;
  version: string;
  semanticVersion: string;
  lifecycleStatus: ConnectorLifecycleStatus;
  isBeta: boolean;
  betaStartAt: string | null;
  betaEndAt: string | null;
  deprecationStartAt: string | null;
  sunsetAt: string | null;
  updating?: boolean;
}

const LIFECYCLE_OPTIONS: ConnectorLifecycleStatus[] = ['ga', 'beta', 'deprecated', 'sunset'];

const LIFECYCLE_LABELS: Record<ConnectorLifecycleStatus, string> = {
  ga: 'General Availability',
  beta: 'Beta',
  deprecated: 'Deprecated',
  sunset: 'Sunset Scheduled',
};

const formatDateForInput = (value: string | null) => (value ? value.slice(0, 10) : '');

const formatDateForBadge = (value: string | null) => {
  if (!value) {
    return '';
  }
  try {
    return new Date(value).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return value;
  }
};

const normalizeConnectorLifecycle = (item: any): ConnectorLifecycleRow => {
  const coerceStatus = (status: any): ConnectorLifecycleStatus => {
    const normalized = String(status ?? '').toLowerCase();
    return LIFECYCLE_OPTIONS.includes(normalized as ConnectorLifecycleStatus)
      ? (normalized as ConnectorLifecycleStatus)
      : 'ga';
  };

  const status = coerceStatus(item.lifecycleStatus ?? (item.isBeta ? 'beta' : 'ga'));
  const version = typeof item.version === 'string' && item.version ? item.version : '1.0.0';
  const semanticVersion = typeof item.semanticVersion === 'string' && item.semanticVersion
    ? item.semanticVersion
    : version;

  return {
    id: item.id,
    slug: item.slug,
    name: item.name,
    version,
    semanticVersion,
    lifecycleStatus: status,
    isBeta: Boolean(item.isBeta ?? status === 'beta'),
    betaStartAt: item.betaStartAt ?? null,
    betaEndAt: item.betaEndAt ?? null,
    deprecationStartAt: item.deprecationStartAt ?? null,
    sunsetAt: item.sunsetAt ?? null,
    updating: false,
  };
};

export default function AdminSettings() {
  const [apiKeys, setApiKeys] = useState({
    openai: '',
    gemini: '',
    claude: ''
  });
  const [showKeys, setShowKeys] = useState({
    openai: false,
    gemini: false,
    claude: false
  });
  const [testResults, setTestResults] = useState<any>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [limitsLoading, setLimitsLoading] = useState(false);
  const [limitsSaving, setLimitsSaving] = useState(false);
  const [executionLimits, setExecutionLimits] = useState({
    maxConcurrentExecutions: 0,
    maxExecutionsPerMinute: 0,
    maxExecutions: 0
  });
  const [executionUsage, setExecutionUsage] = useState({
    concurrentExecutions: 0,
    executionsInCurrentWindow: 0
  });
  const [connectorLifecycle, setConnectorLifecycle] = useState<ConnectorLifecycleRow[]>([]);
  const [connectorLifecycleLoading, setConnectorLifecycleLoading] = useState(false);

  const { authFetch, activeOrganizationId } = useAuthStore((state) => ({
    authFetch: state.authFetch,
    activeOrganizationId: state.activeOrganizationId
  }));

  // Load existing API keys on mount
  useEffect(() => {
    loadApiKeys();
  }, []);

  useEffect(() => {
    if (!activeOrganizationId) {
      return;
    }

    const loadLimits = async () => {
      setLimitsLoading(true);
      try {
        const response = await authFetch(
          `/api/admin/organizations/${activeOrganizationId}/execution-limits`
        );
        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data?.error || 'Failed to load execution limits');
        }

        setExecutionLimits({
          maxConcurrentExecutions: data.limits.maxConcurrentExecutions,
          maxExecutionsPerMinute: data.limits.maxExecutionsPerMinute,
          maxExecutions: data.limits.maxExecutions
        });
        setExecutionUsage({
          concurrentExecutions: data.usage?.concurrentExecutions ?? 0,
          executionsInCurrentWindow: data.usage?.executionsInCurrentWindow ?? 0
        });
      } catch (error: any) {
        console.error('Failed to load execution limits:', error);
        toast.error(error?.message || 'Failed to load execution limits');
      } finally {
        setLimitsLoading(false);
      }
    };

    loadLimits();
  }, [activeOrganizationId, authFetch]);

  const loadApiKeys = async () => {
    try {
      // TODO: Replace with actual API call to get user's API keys
      const stored = localStorage.getItem('ai-api-keys');
      if (stored) {
        setApiKeys(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Error loading API keys:', error);
    }
  };

  const handleSaveKeys = async () => {
    setSaveStatus('saving');
    
    try {
      // TODO: Replace with actual API call to save keys securely
      localStorage.setItem('ai-api-keys', JSON.stringify(apiKeys));
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (error) {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  const handleTestModels = async () => {
    setIsTesting(true);
    setTestResults(null);
    
    try {
      const response = await fetch('/api/ai/test-models', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ apiKeys })
      });
      
      if (response.ok) {
        const results = await response.json();
        setTestResults(results);
      } else {
        setTestResults({ error: 'Failed to test models' });
      }
    } catch (error) {
      setTestResults({ error: 'Network error testing models' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveExecutionLimits = async () => {
    if (!activeOrganizationId) {
      toast.error('Select an organization before saving execution limits');
      return;
    }

    setLimitsSaving(true);
    try {
      const response = await authFetch(
        `/api/admin/organizations/${activeOrganizationId}/execution-limits`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(executionLimits)
        }
      );

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data?.error || 'Failed to update execution limits');
      }

      setExecutionLimits({
        maxConcurrentExecutions: data.limits.maxConcurrentExecutions,
        maxExecutionsPerMinute: data.limits.maxExecutionsPerMinute,
        maxExecutions: data.limits.maxExecutions
      });
      toast.success('Execution limits updated successfully');
    } catch (error: any) {
      console.error('Failed to update execution limits:', error);
      toast.error(error?.message || 'Failed to update execution limits');
    } finally {
      setLimitsSaving(false);
    }
  };

  const toggleKeyVisibility = (provider: keyof typeof showKeys) => {
    setShowKeys(prev => ({
      ...prev,
      [provider]: !prev[provider]
    }));
  };

  const loadConnectorLifecycle = async () => {
    setConnectorLifecycleLoading(true);
    try {
      const response = await authFetch('/api/admin/connectors/lifecycle');
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data?.error || 'Failed to load connector lifecycle');
      }

      const rows = Array.isArray(data.data)
        ? data.data.map(normalizeConnectorLifecycle)
        : [];
      setConnectorLifecycle(rows);
    } catch (error: any) {
      console.error('Failed to load connector lifecycle:', error);
      toast.error(error?.message || 'Failed to load connector lifecycle');
    } finally {
      setConnectorLifecycleLoading(false);
    }
  };

  useEffect(() => {
    loadConnectorLifecycle();
  }, [authFetch]);

  const toIsoOrNull = (value: string): string | null => {
    if (!value) {
      return null;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    return parsed.toISOString();
  };

  const updateConnectorLifecycle = async (slug: string, updates: Partial<ConnectorLifecycleRow>) => {
    if (!slug) {
      return;
    }

    let previous: ConnectorLifecycleRow | undefined;
    setConnectorLifecycle(prev => prev.map((connector) => {
      if (connector.slug !== slug) {
        return connector;
      }
      previous = { ...connector };
      return { ...connector, ...updates, updating: true };
    }));

    try {
      const response = await authFetch(`/api/admin/connectors/${slug}/lifecycle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data?.error || 'Failed to update connector lifecycle');
      }

      const normalized = normalizeConnectorLifecycle(data.data);
      setConnectorLifecycle(prev => prev.map((connector) => (connector.slug === slug ? normalized : connector)));
      toast.success(`Updated ${normalized.name}`);
    } catch (error: any) {
      console.error('Failed to update connector lifecycle:', error);
      toast.error(error?.message || 'Failed to update connector lifecycle');
      if (previous) {
        setConnectorLifecycle(prev => prev.map((connector) => (
          connector.slug === slug
            ? { ...previous!, updating: false }
            : connector
        )));
      } else {
        loadConnectorLifecycle();
      }
    }
  };

  return (
    <>
      <Helmet>
        <title>Admin Settings - AI Configuration</title>
        <meta name="description" content="Configure AI models and API keys for the automation platform" />
      </Helmet>
      
      <main className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-4xl mx-auto p-6 space-y-8">
          <ConnectionManager />

          <Separator />

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-slate-600" />
                Execution Quota Controls
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="max-concurrent">Max concurrent executions</Label>
                <Input
                  id="max-concurrent"
                  type="number"
                  min={1}
                  disabled={limitsLoading || limitsSaving}
                  value={executionLimits.maxConcurrentExecutions}
                  onChange={(event) =>
                    setExecutionLimits((prev) => ({
                      ...prev,
                      maxConcurrentExecutions: Math.max(1, Number.parseInt(event.target.value || '0', 10))
                    }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Currently running: {executionUsage.concurrentExecutions} / {executionLimits.maxConcurrentExecutions}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="max-throughput">Throughput (executions per minute)</Label>
                <Input
                  id="max-throughput"
                  type="number"
                  min={1}
                  disabled={limitsLoading || limitsSaving}
                  value={executionLimits.maxExecutionsPerMinute}
                  onChange={(event) =>
                    setExecutionLimits((prev) => ({
                      ...prev,
                      maxExecutionsPerMinute: Math.max(1, Number.parseInt(event.target.value || '0', 10))
                    }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Window usage: {executionUsage.executionsInCurrentWindow} / {executionLimits.maxExecutionsPerMinute}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="max-executions">Monthly execution budget</Label>
                <Input
                  id="max-executions"
                  type="number"
                  min={1}
                  disabled={limitsLoading || limitsSaving}
                  value={executionLimits.maxExecutions}
                  onChange={(event) =>
                    setExecutionLimits((prev) => ({
                      ...prev,
                      maxExecutions: Math.max(1, Number.parseInt(event.target.value || '0', 10))
                    }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Applies across the current billing period.
                </p>
              </div>

              <div className="flex items-end justify-end gap-2">
                <Button
                  onClick={handleSaveExecutionLimits}
                  disabled={limitsLoading || limitsSaving}
                >
                  {limitsSaving ? 'Saving...' : 'Save execution limits'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Header */}
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 mb-4">
              <Settings className="w-8 h-8 text-gray-600" />
              <h1 className="text-3xl font-bold text-gray-900">Admin Settings</h1>
              <Badge className="bg-red-600 text-white">ADMIN ONLY</Badge>
            </div>
            <p className="text-gray-600">
              Configure AI models and API keys for the automation platform
            </p>
          </div>

          {/* AI Model Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="w-5 h-5 text-purple-600" />
                AI Model Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* OpenAI */}
              <div className="space-y-2">
                <Label htmlFor="openai-key" className="flex items-center gap-2">
                  <Key className="w-4 h-4" />
                  OpenAI API Key
                  <Badge className="bg-blue-100 text-blue-800">GPT-4o Mini</Badge>
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="openai-key"
                    type={showKeys.openai ? "text" : "password"}
                    placeholder="sk-..."
                    value={apiKeys.openai}
                    onChange={(e) => setApiKeys(prev => ({ ...prev, openai: e.target.value }))}
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleKeyVisibility('openai')}
                  >
                    {showKeys.openai ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
                <p className="text-xs text-gray-500">
                  Cost: ~$0.00015 per 1K tokens. Get your key at: https://platform.openai.com/api-keys
                </p>
              </div>

              {/* Google Gemini */}
              <div className="space-y-2">
                <Label htmlFor="gemini-key" className="flex items-center gap-2">
                  <Key className="w-4 h-4" />
                  Google Gemini API Key
                  <Badge className="bg-green-100 text-green-800">Cheapest</Badge>
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="gemini-key"
                    type={showKeys.gemini ? "text" : "password"}
                    placeholder="AIza..."
                    value={apiKeys.gemini}
                    onChange={(e) => setApiKeys(prev => ({ ...prev, gemini: e.target.value }))}
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleKeyVisibility('gemini')}
                  >
                    {showKeys.gemini ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
                <p className="text-xs text-gray-500">
                  Cost: ~$0.00025 per 1K tokens. Get your key at: https://makersuite.google.com/app/apikey
                </p>
              </div>

              {/* Claude */}
              <div className="space-y-2">
                <Label htmlFor="claude-key" className="flex items-center gap-2">
                  <Key className="w-4 h-4" />
                  Anthropic Claude API Key
                  <Badge className="bg-purple-100 text-purple-800">Most Accurate</Badge>
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="claude-key"
                    type={showKeys.claude ? "text" : "password"}
                    placeholder="sk-ant-..."
                    value={apiKeys.claude}
                    onChange={(e) => setApiKeys(prev => ({ ...prev, claude: e.target.value }))}
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleKeyVisibility('claude')}
                  >
                    {showKeys.claude ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
                <p className="text-xs text-gray-500">
                  Cost: ~$0.00025 per 1K tokens. Get your key at: https://console.anthropic.com/
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-4">
                <Button 
                  onClick={handleSaveKeys}
                  disabled={saveStatus === 'saving'}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {saveStatus === 'saving' ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Save API Keys
                    </>
                  )}
                </Button>
                
                <Button 
                  onClick={handleTestModels}
                  disabled={isTesting}
                  variant="outline"
                >
                  {isTesting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-gray-600 border-t-transparent rounded-full animate-spin mr-2" />
                      Testing...
                    </>
                  ) : (
                    <>
                      <TestTube className="w-4 h-4 mr-2" />
                      Test All Models
                    </>
                  )}
                </Button>
              </div>

              {/* Save Status */}
              {saveStatus === 'saved' && (
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="text-sm">API keys saved successfully!</span>
                </div>
              )}
              
              {saveStatus === 'error' && (
                <div className="flex items-center gap-2 text-red-600">
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-sm">Failed to save API keys. Please try again.</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Test Results */}
          {testResults && (
            <Card>
              <CardHeader>
                <CardTitle>Model Test Results</CardTitle>
              </CardHeader>
              <CardContent>
                {testResults.error ? (
                  <div className="text-red-600">{testResults.error}</div>
                ) : (
                  <div className="space-y-3">
                    {testResults.testResults?.map((result: any, index: number) => (
                      <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className={`w-3 h-3 rounded-full ${
                            result.status === 'success' ? 'bg-green-500' : 'bg-red-500'
                          }`} />
                          <span className="font-medium">{result.model}</span>
                          {result.status === 'success' && (
                            <Badge className="bg-green-100 text-green-800">
                              {result.responseTime}ms
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-gray-600">
                          {result.status === 'success' ? (
                            `${(result.confidence * 100).toFixed(0)}% confidence`
                          ) : (
                            result.error
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Usage Information */}
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="p-6">
              <h3 className="font-semibold mb-4">💡 How It Works</h3>
              <div className="space-y-2 text-sm text-gray-700">
                <p>• <strong>Gemini Pro</strong>: Fastest and cheapest, recommended for most workflows</p>
                <p>• <strong>Claude Haiku</strong>: Most accurate for complex business logic</p>
                <p>• <strong>GPT-4o Mini</strong>: Balanced performance and cost</p>
                <p>• <strong>Local Fallback</strong>: Always available, uses intelligent keyword analysis</p>
                <p className="mt-4 font-medium">
                  💰 <strong>Cost Savings</strong>: Using Gemini Pro saves ~95% vs GPT-4 while maintaining quality
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-amber-600" />
                  Connector Lifecycle Management
                </CardTitle>
                <Badge variant="outline" className="text-xs">
                  {connectorLifecycle.length} connectors
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Mark beta rollouts, plan deprecations, and keep semantic versions aligned with connector releases.
              </p>
            </CardHeader>
            <CardContent>
              {connectorLifecycleLoading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading connector metadata…
                </div>
              ) : connectorLifecycle.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  No connectors found. Seed connector definitions to manage lifecycle.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[220px]">Connector</TableHead>
                        <TableHead className="min-w-[140px]">Version</TableHead>
                        <TableHead className="min-w-[160px]">Status</TableHead>
                        <TableHead className="min-w-[260px]">Beta Program</TableHead>
                        <TableHead className="min-w-[260px]">Deprecation &amp; Sunset</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {connectorLifecycle.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm text-gray-900">{row.name}</span>
                                {row.updating && (
                                  <Badge className="flex items-center gap-1 bg-blue-100 text-blue-700 border-blue-200 text-[10px] uppercase tracking-wide">
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    Saving
                                  </Badge>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                <span>{row.slug}</span>
                                <Badge className="bg-slate-100 text-slate-700 border-slate-200 text-[10px]">
                                  {LIFECYCLE_LABELS[row.lifecycleStatus]}
                                </Badge>
                                {row.lifecycleStatus === 'beta' && (
                                  <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px]">Beta</Badge>
                                )}
                                {row.lifecycleStatus === 'deprecated' && (
                                  <Badge className="bg-red-100 text-red-700 border-red-200 text-[10px]">Deprecated</Badge>
                                )}
                                {row.lifecycleStatus === 'sunset' && row.sunsetAt && (
                                  <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-[10px]">
                                    Sunsets {formatDateForBadge(row.sunsetAt)}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="outline" className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-700">
                                v{row.semanticVersion}
                              </Badge>
                              {row.version && row.version !== row.semanticVersion && (
                                <Badge variant="outline" className="text-[10px] px-2 py-0.5">
                                  schema {row.version}
                                </Badge>
                              )}
                              {row.sunsetAt && (
                                <span className="text-[10px] text-muted-foreground">
                                  Sunset {formatDateForBadge(row.sunsetAt)}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Select
                              value={row.lifecycleStatus}
                              onValueChange={(value) =>
                                updateConnectorLifecycle(row.slug, {
                                  lifecycleStatus: value as ConnectorLifecycleStatus,
                                  isBeta: value === 'beta',
                                })
                              }
                              disabled={row.updating}
                            >
                              <SelectTrigger className="w-[180px]" disabled={row.updating}>
                                <SelectValue placeholder="Select status" />
                              </SelectTrigger>
                              <SelectContent>
                                {LIFECYCLE_OPTIONS.map((option) => (
                                  <SelectItem key={option} value={option}>
                                    {LIFECYCLE_LABELS[option]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-2">
                              <div className="flex items-center gap-2">
                                <Switch
                                  checked={row.isBeta}
                                  onCheckedChange={(checked) =>
                                    updateConnectorLifecycle(row.slug, {
                                      isBeta: checked,
                                      lifecycleStatus:
                                        checked
                                          ? 'beta'
                                          : row.lifecycleStatus === 'beta'
                                            ? 'ga'
                                            : row.lifecycleStatus,
                                    })
                                  }
                                  disabled={row.updating}
                                />
                                <span className="text-xs text-muted-foreground">
                                  {row.isBeta ? 'Beta enabled' : 'Beta disabled'}
                                </span>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <Input
                                  type="date"
                                  value={formatDateForInput(row.betaStartAt)}
                                  onChange={(event) =>
                                    updateConnectorLifecycle(row.slug, {
                                      betaStartAt: toIsoOrNull(event.target.value),
                                    })
                                  }
                                  disabled={row.updating}
                                />
                                <Input
                                  type="date"
                                  value={formatDateForInput(row.betaEndAt)}
                                  onChange={(event) =>
                                    updateConnectorLifecycle(row.slug, {
                                      betaEndAt: toIsoOrNull(event.target.value),
                                    })
                                  }
                                  disabled={row.updating}
                                />
                              </div>
                              <p className="text-[10px] text-muted-foreground">Define beta invite window</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="grid grid-cols-2 gap-2">
                              <Input
                                type="date"
                                value={formatDateForInput(row.deprecationStartAt)}
                                onChange={(event) =>
                                  updateConnectorLifecycle(row.slug, {
                                    deprecationStartAt: toIsoOrNull(event.target.value),
                                  })
                                }
                                disabled={row.updating}
                              />
                              <Input
                                type="date"
                                value={formatDateForInput(row.sunsetAt)}
                                onChange={(event) =>
                                  updateConnectorLifecycle(row.slug, {
                                    sunsetAt: toIsoOrNull(event.target.value),
                                  })
                                }
                                disabled={row.updating}
                              />
                            </div>
                            <div className="mt-1 space-y-1 text-[10px] text-muted-foreground">
                              {row.deprecationStartAt && (
                                <div>Deprecates {formatDateForBadge(row.deprecationStartAt)}</div>
                              )}
                              {row.sunsetAt && (
                                <div>Sunsets {formatDateForBadge(row.sunsetAt)}</div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
