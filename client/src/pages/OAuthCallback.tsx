import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';

const prettifyProvider = (provider: string) =>
  provider.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

type CallbackStatus = 'idle' | 'exchanging' | 'storing' | 'success' | 'error';

type CallbackResponse = {
  success: boolean;
  data?: {
    provider?: string;
    tokens?: Record<string, any>;
    userInfo?: Record<string, any>;
    message?: string;
  };
  error?: string;
};

const OAuthCallback = () => {
  const { provider = '' } = useParams<{ provider: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const authFetch = useAuthStore((state) => state.authFetch);
  const token = useAuthStore((state) => state.token);

  const [status, setStatus] = useState<CallbackStatus>('idle');
  const [message, setMessage] = useState<string>('Finishing OAuth connection…');
  const [details, setDetails] = useState<string | undefined>();

  const formattedProvider = useMemo(() => prettifyProvider(provider || 'integration'), [provider]);

  const notifyParent = useCallback((success: boolean, errorMessage?: string) => {
    if (!window.opener) {
      return;
    }
    try {
      window.opener.postMessage(
        {
          type: 'oauth:connection',
          success,
          provider,
          error: errorMessage
        },
        window.location.origin
      );
    } catch (err) {
      console.warn('Failed to notify parent window about OAuth completion', err);
    }
  }, [provider]);

  useEffect(() => {
    const providerError = searchParams.get('error');
    if (providerError) {
      const decodedError = decodeURIComponent(providerError);
      setStatus('error');
      setMessage(decodedError || 'The provider reported an OAuth error.');
      setDetails(undefined);
      notifyParent(false, decodedError || undefined);
      return;
    }

    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const shop = searchParams.get('shop');

    if (!provider) {
      const errorMessage = 'Missing provider in callback URL.';
      setStatus('error');
      setMessage(errorMessage);
      notifyParent(false, errorMessage);
      return;
    }

    if (!code || !state) {
      const errorMessage = 'Missing authorization code or state in callback URL.';
      setStatus('error');
      setMessage(errorMessage);
      notifyParent(false, errorMessage);
      return;
    }

    const completeOAuth = async () => {
      setStatus('exchanging');
      setMessage('Exchanging authorization code for tokens…');
      setDetails(undefined);

      try {
        const callbackUrl = new URL(`/api/oauth/callback/${provider}`, window.location.origin);
        callbackUrl.searchParams.set('code', code);
        callbackUrl.searchParams.set('state', state);
        if (shop) {
          callbackUrl.searchParams.set('shop', shop);
        }

        const response = await fetch(callbackUrl.toString());
        const result: CallbackResponse = await response.json();

        if (!response.ok || !result.success) {
          const errorMessage = result.error || 'OAuth token exchange failed.';
          throw new Error(errorMessage);
        }

        const tokens = result.data?.tokens;
        const userInfo = result.data?.userInfo;

        if (!tokens) {
          throw new Error('The OAuth callback did not return any tokens.');
        }

        if (!token) {
          const authMessage = 'You must sign in before storing OAuth connections.';
          setStatus('error');
          setMessage(authMessage);
          notifyParent(false, authMessage);
          return;
        }

        setStatus('storing');
        setMessage('Storing secure connection…');

        const storeResponse = await authFetch('/api/oauth/store-connection', {
          method: 'POST',
          body: JSON.stringify({ provider, tokens, userInfo })
        });
        const storeResult = await storeResponse.json();

        if (!storeResponse.ok || !storeResult.success) {
          const errorMessage = storeResult.error || 'Failed to store OAuth connection.';
          throw new Error(errorMessage);
        }

        setStatus('success');
        setMessage('Connection established successfully. You can close this window.');
        setDetails(storeResult.data?.message);
        notifyParent(true);
        if (window.opener) {
          setTimeout(() => window.close(), 1500);
        }
      } catch (error: any) {
        const errorMessage = error?.message || 'An unexpected error occurred while completing OAuth.';
        setStatus('error');
        setMessage(errorMessage);
        notifyParent(false, errorMessage);
      }
    };

    void completeOAuth();
  }, [authFetch, notifyParent, provider, searchParams, token]);

  const handleClose = () => {
    if (window.opener) {
      window.close();
    } else {
      navigate('/admin/settings');
    }
  };

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center bg-muted/20 p-6">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle>Connecting to {formattedProvider}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {status === 'success' && (
            <div className="flex items-center gap-3 text-sm text-emerald-600">
              <CheckCircle2 className="h-6 w-6" />
              <span>{message}</span>
            </div>
          )}
          {status === 'error' && (
            <Alert variant="destructive">
              <XCircle className="mr-2 h-4 w-4" />
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}
          {(status === 'idle' || status === 'exchanging' || status === 'storing') && (
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>{message}</span>
            </div>
          )}
          {details && status !== 'error' && (
            <p className="text-sm text-muted-foreground">{details}</p>
          )}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button variant="secondary" onClick={handleClose}>
              {window.opener ? 'Close window' : 'Return to settings'}
            </Button>
            <Button variant="ghost" onClick={() => navigate('/admin/settings')}>
              Go to Connections
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default OAuthCallback;
