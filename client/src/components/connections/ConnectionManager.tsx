import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Loader2, Link2, RefreshCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/authStore';

interface ConnectionSummary {
  id: string;
  name: string;
  provider: string;
  type: string;
  credentials?: Record<string, any>;
  metadata?: Record<string, any>;
  lastTested?: string;
  testStatus?: string;
  testError?: string;
  updatedAt?: string;
}

interface ProviderOption {
  id: string;
  type: 'llm' | 'saas';
}

const prettifyProvider = (provider: string) => provider.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export const ConnectionManager = () => {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const authFetch = useAuthStore((state) => state.authFetch);
  const logout = useAuthStore((state) => state.logout);

  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [connections, setConnections] = useState<ConnectionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState('');
  const [connectionName, setConnectionName] = useState('');
  const [credentialsText, setCredentialsText] = useState('');
  const [error, setError] = useState<string | undefined>();

  const llmProviders = useMemo(() => providers.filter((provider) => provider.type === 'llm'), [providers]);

  useEffect(() => {
    if (!token) {
      setConnections([]);
      return;
    }
    loadProviders();
    loadConnections();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const loadProviders = async () => {
    try {
      const response = await authFetch('/api/connections/providers');
      if (!response.ok) {
        if (response.status === 401) {
          await logout(true);
        }
        throw new Error('Failed to load providers');
      }
      const result = await response.json();
      if (result.success) {
        setProviders(result.providers || []);
      }
    } catch (err) {
      console.error('Failed to load providers', err);
      setProviders([]);
    }
  };

  const loadConnections = async () => {
    setIsLoading(true);
    try {
      const response = await authFetch('/api/connections');
      if (!response.ok) {
        if (response.status === 401) {
          await logout(true);
        }
        throw new Error('Failed to load connections');
      }
      const result = await response.json();
      if (result.success) {
        setConnections(result.connections || []);
      } else {
        setError(result.error || 'Unable to load connections');
      }
    } catch (err: any) {
      setError(err?.message || 'Unable to load connections');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateConnection = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(undefined);
    setIsSubmitting(true);

    try {
      let credentials: Record<string, any> = {};
      if (credentialsText.trim()) {
        credentials = JSON.parse(credentialsText);
      }

      const response = await authFetch('/api/connections', {
        method: 'POST',
        body: JSON.stringify({
          name: connectionName || `${prettifyProvider(selectedProvider)} connection`,
          provider: selectedProvider,
          type: llmProviders.some((provider) => provider.id === selectedProvider) ? 'llm' : 'saas',
          credentials
        })
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to create connection');
      }

      toast.success('Connection created');
      setConnectionName('');
      setCredentialsText('');
      await loadConnections();
    } catch (err: any) {
      const message = err?.message || 'Failed to create connection';
      setError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTest = async (connectionId: string) => {
    try {
      const response = await authFetch(`/api/connections/${connectionId}/test`, {
        method: 'POST'
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Connection test failed');
      }
      toast.success('Connection test passed');
      await loadConnections();
    } catch (err: any) {
      toast.error(err?.message || 'Connection test failed');
    }
  };

  const handleDelete = async (connectionId: string) => {
    try {
      const response = await authFetch(`/api/connections/${connectionId}`, {
        method: 'DELETE'
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to delete connection');
      }
      toast.success('Connection deleted');
      await loadConnections();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete connection');
    }
  };

  if (!token || !user) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Connections</CardTitle>
          <CardDescription>Sign in to manage credentials for your automations.</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertDescription>
              You must be signed in before configuring app connections.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connections</CardTitle>
        <CardDescription>Store credentials once and reuse them across your workflows.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form className="space-y-4" onSubmit={handleCreateConnection}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="connection-provider">Provider</Label>
              <select
                id="connection-provider"
                className="rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
                value={selectedProvider}
                onChange={(event) => setSelectedProvider(event.target.value)}
                required
              >
                <option value="" disabled>Select a provider</option>
                {providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {prettifyProvider(provider.id)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="connection-name">Connection name</Label>
              <Input
                id="connection-name"
                placeholder="Marketing team Slack"
                value={connectionName}
                onChange={(event) => setConnectionName(event.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="connection-credentials">
              Credentials JSON
              <span className="ml-2 text-xs text-muted-foreground">
                Provide the API key or OAuth tokens required for this provider
              </span>
            </Label>
            <Textarea
              id="connection-credentials"
              placeholder='{"accessToken":"xoxb-..."}'
              value={credentialsText}
              onChange={(event) => setCredentialsText(event.target.value)}
              rows={4}
              required
            />
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={isSubmitting || !selectedProvider}>
              {isSubmitting ? 'Saving…' : 'Save connection'}
            </Button>
            <Button type="button" variant="outline" disabled={isLoading} onClick={loadConnections}>
              <RefreshCcw className="mr-2 h-4 w-4" /> Refresh
            </Button>
          </div>
        </form>

        <Separator />

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase text-muted-foreground">Saved connections</h3>
            {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          </div>
          {connections.length === 0 && !isLoading ? (
            <p className="text-sm text-muted-foreground">
              No connections yet. Create one above to start using it inside your workflows.
            </p>
          ) : (
            <div className="space-y-3">
              {connections.map((connection) => (
                <div key={connection.id} className="rounded-lg border border-border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{connection.name}</span>
                        <Badge variant="secondary">{prettifyProvider(connection.provider)}</Badge>
                        <Badge variant="outline">{connection.type.toUpperCase()}</Badge>
                      </div>
                      {connection.lastTested && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Last tested {new Date(connection.lastTested).toLocaleString()}
                        </p>
                      )}
                      {connection.testError && (
                        <p className="text-xs text-destructive">{connection.testError}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleTest(connection.id)}>
                        <Link2 className="mr-2 h-4 w-4" /> Test
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(connection.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default ConnectionManager;
