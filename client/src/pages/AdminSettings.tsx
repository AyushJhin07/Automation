import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Helmet } from "react-helmet-async";
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
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
  Flag
} from 'lucide-react';
import ConnectionManager from '@/components/connections/ConnectionManager';
import WorkerStatusPanel from '@/components/automation/WorkerStatusPanel';
import { useAuthStore } from '@/store/authStore';
import { toast } from 'sonner';

type ConnectorLifecycleStatus = 'alpha' | 'beta' | 'stable' | 'deprecated' | 'sunset';

type ConnectorRolloutSummary = {
  id: string;
  slug: string;
  name: string;
  version: string;
  semanticVersion: string;
  lifecycleStatus: ConnectorLifecycleStatus;
  isBeta: boolean;
  betaStartDate?: string | null;
  deprecationStartDate?: string | null;
  sunsetDate?: string | null;
  updatedAt?: string | null;
};

type RolloutFormState = {
  version: string;
  semanticVersion: string;
  lifecycleStatus: ConnectorLifecycleStatus;
  isBeta: boolean;
  betaStartedAt: string;
  deprecationStartDate: string;
  sunsetDate: string;
};

const toDateInput = (value?: string | null): string => {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toISOString().slice(0, 10);
};

const toISOStringFromInput = (value: string): string | null => {
  if (!value) {
    return null;
  }
  const iso = new Date(`${value}T00:00:00.000Z`).toISOString();
  return iso;
};

const buildFormState = (connector?: ConnectorRolloutSummary | null): RolloutFormState => ({
  version: connector?.version ?? '',
  semanticVersion: connector?.semanticVersion ?? connector?.version ?? '',
  lifecycleStatus: connector?.lifecycleStatus ?? 'stable',
  isBeta: connector?.isBeta ?? false,
  betaStartedAt: toDateInput(connector?.betaStartDate),
  deprecationStartDate: toDateInput(connector?.deprecationStartDate),
  sunsetDate: toDateInput(connector?.sunsetDate),
});

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
  const [connectorRollouts, setConnectorRollouts] = useState<ConnectorRolloutSummary[]>([]);
  const [rolloutsLoading, setRolloutsLoading] = useState(false);
  const [selectedConnectorSlug, setSelectedConnectorSlug] = useState<string>('');
  const [rolloutForm, setRolloutForm] = useState<RolloutFormState>(buildFormState());
  const [savingRollout, setSavingRollout] = useState(false);

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

  useEffect(() => {
    void loadConnectorRollouts();
  }, [loadConnectorRollouts]);

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

  const loadConnectorRollouts = useCallback(async (preferredSlug?: string) => {
    setRolloutsLoading(true);
    try {
      const response = await authFetch('/api/admin/connectors');
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data?.error || 'Failed to load connector rollouts');
      }

      const connectors: ConnectorRolloutSummary[] = Array.isArray(data.connectors)
        ? data.connectors.map((item: any) => ({
            id: String(item.id ?? ''),
            slug: String(item.slug ?? ''),
            name: String(item.name ?? item.slug ?? 'Unknown connector'),
            version: String(item.version ?? ''),
            semanticVersion: String(item.semanticVersion ?? item.version ?? ''),
            lifecycleStatus: (item.lifecycleStatus ?? 'stable') as ConnectorLifecycleStatus,
            isBeta: Boolean(item.isBeta),
            betaStartDate: item.betaStartDate ?? null,
            deprecationStartDate: item.deprecationStartDate ?? null,
            sunsetDate: item.sunsetDate ?? null,
            updatedAt: item.updatedAt ?? null,
          }))
        : [];

      connectors.sort((a, b) => a.name.localeCompare(b.name));
      setConnectorRollouts(connectors);

      if (connectors.length === 0) {
        setSelectedConnectorSlug('');
        setRolloutForm(buildFormState());
        return;
      }

      const effectiveSlug = preferredSlug && connectors.some(connector => connector.slug === preferredSlug)
        ? preferredSlug
        : connectors[0].slug;
      setSelectedConnectorSlug(effectiveSlug);
      const match = connectors.find(connector => connector.slug === effectiveSlug) ?? null;
      setRolloutForm(buildFormState(match));
    } catch (error: any) {
      console.error('Failed to load connector rollouts:', error);
      toast.error(error?.message || 'Failed to load connector rollouts');
    } finally {
      setRolloutsLoading(false);
    }
  }, [authFetch]);

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

  const selectedConnector = useMemo(() => {
    if (!selectedConnectorSlug) {
      return null;
    }
    return connectorRollouts.find(connector => connector.slug === selectedConnectorSlug) ?? null;
  }, [connectorRollouts, selectedConnectorSlug]);

  const handleConnectorSelection = (slug: string) => {
    setSelectedConnectorSlug(slug);
    const match = connectorRollouts.find(connector => connector.slug === slug) ?? null;
    setRolloutForm(buildFormState(match));
  };

  function handleRolloutFieldChange<K extends keyof RolloutFormState>(field: K, value: RolloutFormState[K]) {
    setRolloutForm(prev => ({
      ...prev,
      [field]: value,
    }));
  }

  const handleRolloutSave = async () => {
    if (!selectedConnectorSlug) {
      toast.error('Select a connector to update');
      return;
    }

    const current = selectedConnector;
    const payload: Record<string, any> = {};

    if (rolloutForm.version && rolloutForm.version !== (current?.version ?? '')) {
      payload.version = rolloutForm.version;
    }

    if (rolloutForm.semanticVersion && rolloutForm.semanticVersion !== (current?.semanticVersion ?? current?.version ?? '')) {
      payload.semanticVersion = rolloutForm.semanticVersion;
    }

    if (rolloutForm.lifecycleStatus !== (current?.lifecycleStatus ?? 'stable')) {
      payload.lifecycleStatus = rolloutForm.lifecycleStatus;
    }

    if (rolloutForm.isBeta !== (current?.isBeta ?? false)) {
      payload.isBeta = rolloutForm.isBeta;
    }

    const betaIso = toISOStringFromInput(rolloutForm.betaStartedAt);
    if (betaIso !== (current?.betaStartDate ?? null)) {
      payload.betaStartedAt = betaIso;
    }

    const deprecationIso = toISOStringFromInput(rolloutForm.deprecationStartDate);
    if (deprecationIso !== (current?.deprecationStartDate ?? null)) {
      payload.deprecationStartDate = deprecationIso;
    }

    const sunsetIso = toISOStringFromInput(rolloutForm.sunsetDate);
    if (sunsetIso !== (current?.sunsetDate ?? null)) {
      payload.sunsetDate = sunsetIso;
    }

    if (Object.keys(payload).length === 0) {
      toast.info('No rollout changes to save');
      return;
    }

    setSavingRollout(true);
    try {
      const response = await authFetch(`/api/admin/connectors/${encodeURIComponent(selectedConnectorSlug)}/rollout`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data?.error || 'Failed to update connector rollout');
      }
      toast.success('Connector rollout updated');
      await loadConnectorRollouts(selectedConnectorSlug);
    } catch (error: any) {
      console.error('Failed to update connector rollout:', error);
      toast.error(error?.message || 'Failed to update connector rollout');
    } finally {
      setSavingRollout(false);
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

  return (
    <>
      <Helmet>
        <title>Admin Settings - AI Configuration</title>
        <meta name="description" content="Configure AI models and API keys for the automation platform" />
      </Helmet>
      
      <main className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-4xl mx-auto p-6 space-y-8">
          <ConnectionManager />

          <WorkerStatusPanel />

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

          <Separator />

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Flag className="w-5 h-5 text-orange-500" />
                Connector Rollouts
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Manage lifecycle status, beta visibility, and sunset schedules for every connector.
              </p>
            </CardHeader>
            <CardContent>
              {rolloutsLoading ? (
                <div className="text-sm text-muted-foreground">Loading connector metadata…</div>
              ) : connectorRollouts.length === 0 ? (
                <div className="text-sm text-muted-foreground">No connector definitions found in the catalog.</div>
              ) : (
                <div className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="connector-rollout-select">Connector</Label>
                      <Select
                        value={selectedConnectorSlug}
                        onValueChange={handleConnectorSelection}
                        disabled={rolloutsLoading}
                      >
                        <SelectTrigger id="connector-rollout-select">
                          <SelectValue placeholder="Select a connector" />
                        </SelectTrigger>
                        <SelectContent>
                          {connectorRollouts.map((connector) => (
                            <SelectItem key={connector.slug} value={connector.slug}>
                              {connector.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {selectedConnector && (
                      <div className="space-y-2">
                        <Label>Status overview</Label>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant={
                              selectedConnector.lifecycleStatus === 'deprecated' || selectedConnector.lifecycleStatus === 'sunset'
                                ? 'destructive'
                                : 'secondary'
                            }
                          >
                            {selectedConnector.lifecycleStatus.charAt(0).toUpperCase() + selectedConnector.lifecycleStatus.slice(1)}
                          </Badge>
                          {selectedConnector.isBeta && <Badge variant="outline">Beta</Badge>}
                          {selectedConnector.version && (
                            <Badge variant="outline">v{selectedConnector.version}</Badge>
                          )}
                          {selectedConnector.updatedAt && (
                            <span className="text-xs text-muted-foreground">
                              Updated {new Date(selectedConnector.updatedAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="rollout-version">Release version</Label>
                      <Input
                        id="rollout-version"
                        placeholder="1.0.0"
                        value={rolloutForm.version}
                        onChange={(event) => handleRolloutFieldChange('version', event.target.value)}
                        disabled={rolloutsLoading}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="rollout-semver">Semantic version</Label>
                      <Input
                        id="rollout-semver"
                        placeholder="1.0.0"
                        value={rolloutForm.semanticVersion}
                        onChange={(event) => handleRolloutFieldChange('semanticVersion', event.target.value)}
                        disabled={rolloutsLoading}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="rollout-status">Lifecycle stage</Label>
                      <Select
                        value={rolloutForm.lifecycleStatus}
                        onValueChange={(value) => handleRolloutFieldChange('lifecycleStatus', value as ConnectorLifecycleStatus)}
                        disabled={rolloutsLoading}
                      >
                        <SelectTrigger id="rollout-status">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="alpha">Alpha</SelectItem>
                          <SelectItem value="beta">Beta</SelectItem>
                          <SelectItem value="stable">Stable</SelectItem>
                          <SelectItem value="deprecated">Deprecated</SelectItem>
                          <SelectItem value="sunset">Sunset</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 rounded-md border border-dashed border-slate-200 p-3">
                    <Switch
                      id="rollout-beta"
                      checked={rolloutForm.isBeta}
                      onCheckedChange={(checked) => handleRolloutFieldChange('isBeta', checked)}
                      disabled={rolloutsLoading}
                    />
                    <div className="space-y-1">
                      <Label htmlFor="rollout-beta" className="text-sm font-medium">Beta rollout</Label>
                      <p className="text-xs text-muted-foreground">
                        Controls whether the connector is highlighted as beta in marketplace listings.
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="beta-start">Beta start</Label>
                      <Input
                        id="beta-start"
                        type="date"
                        value={rolloutForm.betaStartedAt}
                        onChange={(event) => handleRolloutFieldChange('betaStartedAt', event.target.value)}
                        disabled={rolloutsLoading}
                      />
                      <p className="text-xs text-muted-foreground">Optional date when beta access began.</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="deprecation-start">Deprecation notice</Label>
                      <Input
                        id="deprecation-start"
                        type="date"
                        value={rolloutForm.deprecationStartDate}
                        onChange={(event) => handleRolloutFieldChange('deprecationStartDate', event.target.value)}
                        disabled={rolloutsLoading}
                      />
                      <p className="text-xs text-muted-foreground">Announce when users should begin migrating.</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="sunset-date">Sunset date</Label>
                      <Input
                        id="sunset-date"
                        type="date"
                        value={rolloutForm.sunsetDate}
                        onChange={(event) => handleRolloutFieldChange('sunsetDate', event.target.value)}
                        disabled={rolloutsLoading}
                      />
                      <p className="text-xs text-muted-foreground">Final day of availability for the connector.</p>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button
                      onClick={handleRolloutSave}
                      disabled={savingRollout || rolloutsLoading || !selectedConnectorSlug}
                    >
                      {savingRollout ? 'Saving…' : 'Save rollout'}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
