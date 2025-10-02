import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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

interface OAuthProviderOption {
  name: string;
  displayName: string;
  scopes: string[];
  configured: boolean;
  disabledReason?: string;
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
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState('');
  const [connectionName, setConnectionName] = useState('');
  const [credentialsText, setCredentialsText] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [loadError, setLoadError] = useState<string | undefined>();
  const [oauthProviders, setOAuthProviders] = useState<OAuthProviderOption[]>([]);
  const [refreshingConnectionId, setRefreshingConnectionId] = useState<string | null>(null);

  const llmProviders = useMemo(() => providers.filter((provider) => provider.type === 'llm'), [providers]);
  const selectedOAuthProvider = useMemo(
    () => oauthProviders.find((provider) => provider.name.toLowerCase() === selectedProvider.toLowerCase()),
    [oauthProviders, selectedProvider]
  );

  useEffect(() => {
    if (selectedOAuthProvider?.configured) {
      setCredentialsText('');
    }
    setError(undefined);
  }, [selectedOAuthProvider]);

  useEffect(() => {
    if (!token) {
      setConnections([]);
      return;
    }
    loadProviders();
    loadConnections();
    loadOAuthProviders();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleOAuthMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) {
        return;
      }

      const data = event.data as { type?: string; success?: boolean; provider?: string; error?: string } | undefined;
      if (!data || data.type !== 'oauth:connection') {
        return;
      }

      if (data.success) {
        toast.success(`Connected ${prettifyProvider(data.provider || 'integration')}`);
        loadConnections();
      } else {
        const message = data.error || 'OAuth authorization failed. Please try again.';
        setError(message);
        toast.error(message);
      }
    };

    window.addEventListener('message', handleOAuthMessage);
    return () => {
      window.removeEventListener('message', handleOAuthMessage);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadProviders = async () => {
    try {
      const response = await authFetch('/api/connections/providers');
      if (!response.ok) {
        if (response.status === 401) {
          await logout(true);
        }
        const message = response.status >= 500
          ? 'The connections directory is temporarily unavailable. Please try again later.'
          : 'Failed to load available providers.';
        setError(message);
        setLoadError(message);
        setProviders([]);
        return;
      }
      const result = await response.json();
      if (result.success) {
        setProviders(result.providers || []);
        setLoadError(undefined);
      } else {
        const message = result.error || 'Unable to load providers.';
        setError(message);
        setLoadError(message);
        setProviders([]);
      }
    } catch (err) {
      console.error('Failed to load providers', err);
      const message = 'Unable to contact the connections service. Please verify your network connection.';
      setProviders([]);
      setError(message);
      setLoadError(message);
    }
  };

  const loadOAuthProviders = async () => {
    try {
      const response = await fetch('/api/oauth/providers');
      const result = await response.json();
      if (response.ok && result.success) {
        setOAuthProviders(result.data?.providers || []);
      } else {
        setOAuthProviders([]);
      }
    } catch (err) {
      console.error('Failed to load OAuth providers', err);
      setOAuthProviders([]);
    }
  };

  const loadConnections = async () => {
    setIsLoading(true);
    setLoadError(undefined);
    try {
      const response = await authFetch('/api/connections');
      if (!response.ok) {
        if (response.status === 401) {
          await logout(true);
        }
        const message = response.status >= 500
          ? 'We could not reach your saved connections. Please try again once the API is back online.'
          : 'Failed to load connections. Please try again.';
        setError(message);
        setLoadError(message);
        setConnections([]);
        return;
      }
      const result = await response.json();
      if (result.success) {
        setConnections(result.connections || []);
        setLoadError(undefined);
      } else {
        const message = result.error || 'Unable to load connections.';
        setConnections([]);
        setError(message);
        setLoadError(message);
      }
    } catch (err: any) {
      console.error('Failed to load connections', err);
      const message = 'We could not reach your saved connections. Check your network connection and try again.';
      setConnections([]);
      setError(err?.message || message);
      setLoadError(message);
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
        try {
          credentials = JSON.parse(credentialsText);
        } catch {
          const message = 'Credentials must be valid JSON.';
          setError(message);
          toast.error(message);
          return;
        }
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
        const message = result.error || 'Failed to create connection';
        setError(message);
        toast.error(message);
        return;
      }

      toast.success('Connection created');
      setConnectionName('');
      setCredentialsText('');
      await loadConnections();
    } catch (err: any) {
      const message = err?.message || 'Failed to create connection';
      setError(message);
      setLoadError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOAuthConnect = async () => {
    if (!selectedProvider || !selectedOAuthProvider) {
      return;
    }

    if (!selectedOAuthProvider.configured) {
      const message = selectedOAuthProvider.disabledReason || 'OAuth is not configured for this provider.';
      toast.error(message);
      setError(message);
      return;
    }

    setIsAuthorizing(true);
    setError(undefined);

    try {
      const response = await authFetch('/api/oauth/authorize', {
        method: 'POST',
        body: JSON.stringify({ provider: selectedProvider })
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        const message = result.error || 'Failed to initiate OAuth authorization.';
        setError(message);
        toast.error(message);
        return;
      }

      const authUrl = result.data?.authUrl;
      if (!authUrl) {
        const message = 'Authorization URL was not provided by the server.';
        setError(message);
        toast.error(message);
        return;
      }

      const width = 600;
      const height = 700;
      const left = window.screenX + Math.max((window.outerWidth - width) / 2, 0);
      const top = window.screenY + Math.max((window.outerHeight - height) / 2, 0);
      const popup = window.open(
        authUrl,
        'oauth',
        `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
      );

      if (!popup) {
        const message = 'Unable to open the authorization window. Please disable your popup blocker and try again.';
        setError(message);
        toast.error(message);
        return;
      }

      popup.focus();
    } catch (err: any) {
      const message = err?.message || 'Failed to initiate OAuth authorization.';
      setError(message);
      toast.error(message);
    } finally {
      setIsAuthorizing(false);
    }
  };

  const handleTest = async (connectionId: string) => {
    try {
      const response = await authFetch(`/api/connections/${connectionId}/test`, {
        method: 'POST'
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        const message = result.error || 'Connection test failed';
        setError(message);
        toast.error(message);
        return;
      }
      toast.success('Connection test passed');
      await loadConnections();
    } catch (err: any) {
      const message = err?.message || 'Connection test failed';
      setError(message);
      toast.error(message);
    }
  };

  const handleRefresh = async (connection: ConnectionSummary) => {
    setRefreshingConnectionId(connection.id);
    try {
      const response = await authFetch('/api/oauth/refresh', {
        method: 'POST',
        body: JSON.stringify({ provider: connection.provider })
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        const message = result.error || 'Failed to refresh OAuth tokens.';
        toast.error(message);
        setError(message);
        return;
      }

      toast.success(`Refreshed ${prettifyProvider(connection.provider)} tokens`);
      await loadConnections();
    } catch (err: any) {
      const message = err?.message || 'Failed to refresh OAuth tokens.';
      setError(message);
      toast.error(message);
    } finally {
      setRefreshingConnectionId(null);
    }
  };

  const handleDelete = async (connectionId: string) => {
    try {
      const response = await authFetch(`/api/connections/${connectionId}`, {
        method: 'DELETE'
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        const message = result.error || 'Failed to delete connection';
        setError(message);
        toast.error(message);
        return;
      }
      toast.success('Connection deleted');
      await loadConnections();
    } catch (err: any) {
      const message = err?.message || 'Failed to delete connection';
      setError(message);
      toast.error(message);
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
          {selectedOAuthProvider && (
            <Alert variant={selectedOAuthProvider.configured ? 'default' : 'destructive'}>
              <AlertTitle>
                {selectedOAuthProvider.configured ? 'OAuth available' : 'OAuth unavailable'} for {prettifyProvider(selectedOAuthProvider.name)}
              </AlertTitle>
              <AlertDescription>
                {selectedOAuthProvider.configured
                  ? 'Connect securely without sharing API keys. Use the button below to authorize access.'
                  : selectedOAuthProvider.disabledReason || 'OAuth is not configured for this provider. Contact your administrator to enable it.'}
              </AlertDescription>
            </Alert>
          )}
          {selectedOAuthProvider?.configured && (
            <Button type="button" onClick={handleOAuthConnect} disabled={isAuthorizing}>
              {isAuthorizing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Opening authorization…
                </>
              ) : (
                'Connect with OAuth'
              )}
            </Button>
          )}
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
              required={!selectedOAuthProvider?.configured}
              disabled={selectedOAuthProvider?.configured}
            />
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="flex items-center gap-3">
            <Button
              type="submit"
              disabled={isSubmitting || !selectedProvider || Boolean(selectedOAuthProvider?.configured)}
            >
              {isSubmitting ? 'Saving…' : 'Save connection'}
            </Button>
            <Button type="button" variant="outline" disabled={isLoading} onClick={loadConnections}>
              <RefreshCcw className="mr-2 h-4 w-4" /> Refresh
            </Button>
          </div>
        </form>

        <Separator />

        <div className="space-y-4">
          {loadError && (
            <Alert variant="destructive">
              <AlertTitle>Connections service unavailable</AlertTitle>
              <AlertDescription>{loadError}</AlertDescription>
            </Alert>
          )}

          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase text-muted-foreground">Saved connections</h3>
            {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          </div>
          {connections.length === 0 && !isLoading ? (
            <p className="text-sm text-muted-foreground">
              {loadError
                ? 'We were unable to load your saved connections. They will appear here once the API is available again.'
                : 'No connections yet. Create one above to start using it inside your workflows.'}
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
                      {connection.metadata?.userInfo?.email && (
                        <p className="text-xs text-muted-foreground">
                          Signed in as {connection.metadata.userInfo.email}
                        </p>
                      )}
                      {connection.metadata?.expiresAt && (
                        <p className="text-xs text-muted-foreground">
                          Access token expires {new Date(connection.metadata.expiresAt).toLocaleString()}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {connection.metadata?.refreshToken && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRefresh(connection)}
                          disabled={refreshingConnectionId === connection.id}
                        >
                          {refreshingConnectionId === connection.id ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCcw className="mr-2 h-4 w-4" />
                          )}
                          Refresh tokens
                        </Button>
                      )}
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
