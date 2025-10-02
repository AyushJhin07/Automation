import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';

const prettifyProvider = (provider: string) =>
  provider.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

type CallbackStatus = 'idle' | 'redirecting' | 'success' | 'error';

const OAuthCallback = () => {
  const { provider = '' } = useParams<{ provider: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [status, setStatus] = useState<CallbackStatus>('idle');
  const [message, setMessage] = useState<string>('Finishing OAuth connection…');
  const [details, setDetails] = useState<string | undefined>();

  const formattedProvider = useMemo(() => prettifyProvider(provider || 'integration'), [provider]);
  const connectionId = searchParams.get('connectionId') || undefined;
  const label = searchParams.get('label') || undefined;

  const notifyParent = useCallback((payload: { success: boolean; error?: string }) => {
    if (!window.opener) {
      return;
    }
    try {
      window.opener.postMessage(
        {
          type: 'oauth:connection',
          success: payload.success,
          provider,
          error: payload.error,
          connectionId,
          label
        },
        window.location.origin
      );
    } catch (err) {
      console.warn('Failed to notify parent window about OAuth completion', err);
    }
  }, [connectionId, label, provider]);

  useEffect(() => {
    if (!provider) {
      const errorMessage = 'Missing provider in callback URL.';
      setStatus('error');
      setMessage(errorMessage);
      setDetails(undefined);
      notifyParent({ success: false, error: errorMessage });
      return;
    }

    const state = searchParams.get('state');
    const code = searchParams.get('code');
    const providerError = searchParams.get('error');
    const storageKey = state ? `oauth:processed:${state}` : undefined;

    if (providerError) {
      const decodedError = decodeURIComponent(providerError);
      if (storageKey) {
        window.sessionStorage.removeItem(storageKey);
      }
      setStatus('error');
      setMessage(decodedError || 'The provider reported an OAuth error.');
      setDetails(undefined);
      notifyParent({ success: false, error: decodedError || undefined });
      return;
    }

    if (!code || !state) {
      const errorMessage = 'Missing authorization code or state in callback URL.';
      if (storageKey) {
        window.sessionStorage.removeItem(storageKey);
      }
      setStatus('error');
      setMessage(errorMessage);
      setDetails(undefined);
      notifyParent({ success: false, error: errorMessage });
      return;
    }

    if (!storageKey) {
      const errorMessage = 'Unable to determine OAuth state from callback parameters.';
      setStatus('error');
      setMessage(errorMessage);
      setDetails(undefined);
      notifyParent({ success: false, error: errorMessage });
      return;
    }

    try {
      const session = window.sessionStorage;
      const progress = session.getItem(storageKey);

      if (!progress) {
        session.setItem(storageKey, 'pending');
        setStatus('redirecting');
        setMessage('Finalizing secure connection…');
        setDetails(undefined);
        window.location.replace(`/api/oauth/callback/${provider}${window.location.search}`);
        return;
      }

      if (progress === 'pending') {
        session.setItem(storageKey, 'complete');
      }

      setStatus('success');
      const successMessage = label
        ? `Connected ${label}. You can close this window.`
        : 'Connection established successfully. You can close this window.';
      setMessage(successMessage);
      setDetails('This window will close automatically once the secure redirect completes.');
      notifyParent({ success: true });
      if (window.opener) {
        setTimeout(() => window.close(), 1500);
      }
    } catch (error) {
      console.warn('Failed to finalize OAuth redirect flow', error);
      const errorMessage = 'Failed to finalize the OAuth connection. Please try again.';
      if (storageKey) {
        window.sessionStorage.removeItem(storageKey);
      }
      setStatus('error');
      setMessage(errorMessage);
      setDetails(undefined);
      notifyParent({ success: false, error: errorMessage });
    }
  }, [label, notifyParent, provider, searchParams]);

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
          {(status === 'idle' || status === 'redirecting') && (
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
