import React, { useState, useEffect } from 'react';
import { Helmet } from "react-helmet-async";
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
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
  EyeOff
} from 'lucide-react';
import ConnectionManager from '@/components/connections/ConnectionManager';
import { useAuthStore } from '@/store/authStore';
import { toast } from 'sonner';

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
        </div>
      </main>
    </>
  );
}
