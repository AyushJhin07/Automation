import { Router } from 'express';
import { oauthManager } from '../oauth/OAuthManager';
import { oauthStateStore } from '../oauth/stateStore';
import { authenticateToken, requirePermission } from '../middleware/auth';
import { getErrorMessage } from '../types/common';

const oauthRouter = Router();

function normalizeRedirectUrl(url: string, providerId: string): URL {
  const target = new URL(url);
  if (target.pathname.startsWith('/api/oauth/callback')) {
    target.pathname = target.pathname.replace('/api/oauth/callback', '/oauth/callback');
  }
  if (target.pathname === '/oauth/callback') {
    target.pathname = `/oauth/callback/${providerId}`;
  }
  return target;
}

oauthRouter.post('/authorize/:provider', authenticateToken, requirePermission('connections:write'), async (req, res) => {
  try {
    const providerId = String(req.params.provider || '').toLowerCase();
    if (!providerId) {
      return res.status(400).json({ success: false, error: 'Provider is required' });
    }

    if (!oauthManager.supportsOAuth(providerId)) {
      return res.status(404).json({ success: false, error: `Unsupported OAuth provider: ${providerId}` });
    }

    const user = req.user;
    const organizationId = req.organizationId || user?.organizationId;

    if (!user?.id || !organizationId) {
      return res.status(400).json({ success: false, error: 'Missing authentication context' });
    }

    const { returnUrl, scopes, connectionId, label } = req.body || {};

    const additionalScopes = Array.isArray(scopes)
      ? scopes.filter((scope): scope is string => typeof scope === 'string')
      : undefined;

    const { authUrl, state } = await oauthManager.generateAuthUrl(
      providerId,
      user.id,
      organizationId,
      typeof returnUrl === 'string' && returnUrl.length > 0 ? returnUrl : undefined,
      additionalScopes,
      {
        connectionId: typeof connectionId === 'string' ? connectionId : undefined,
        label: typeof label === 'string' ? label : undefined,
      }
    );

    console.info('OAuth authorize state stored', {
      providerId,
      state,
      userId: user.id,
      organizationId,
      hasReturnUrl: Boolean(returnUrl),
    });

    return res.json({
      success: true,
      data: {
        provider: providerId,
        authUrl,
        state,
      },
    });
  } catch (error) {
    console.error('OAuth authorize error', {
      providerId: String(req.params.provider || '').toLowerCase(),
      error: getErrorMessage(error),
    });
    return res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

oauthRouter.get('/callback/:provider', async (req, res) => {
  const providerId = String(req.params.provider || '').toLowerCase();
  const code = typeof req.query.code === 'string' ? req.query.code : undefined;
  const state = typeof req.query.state === 'string' ? req.query.state : undefined;

  const sendPopupResponse = (
    status: number,
    payload: {
      success: boolean;
      provider: string;
      state?: string;
      returnUrl?: string;
      connectionId?: string;
      label?: string;
      error?: string;
      userInfoError?: string;
    }
  ) => {
    const messagePayload = {
      type: 'oauth:connection',
      ...payload,
    };
    const serializedPayload = JSON.stringify(messagePayload).replace(/</g, '\\u003c');
    const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>OAuth Complete</title>
  </head>
  <body>
    <script>
      const payload = ${serializedPayload};
      try {
        window.opener?.postMessage(payload, window.location.origin);
      } catch (err) {
        console.warn('Failed to notify opener about OAuth result', err);
      }
      window.close();
    </script>
    <p>OAuth flow complete. You may close this window.</p>
  </body>
</html>`;
    res.status(status).set('Content-Type', 'text/html; charset=utf-8').send(html);
  };

  try {
    if (!providerId) {
      return sendPopupResponse(400, { success: false, provider: providerId, state, error: 'Provider is required' });
    }
    if (!code || !state) {
      return sendPopupResponse(400, { success: false, provider: providerId, state, error: 'Missing OAuth code or state' });
    }
    if (!oauthManager.supportsOAuth(providerId)) {
      return sendPopupResponse(404, { success: false, provider: providerId, state, error: `Unsupported OAuth provider: ${providerId}` });
    }

    console.info('OAuth callback received', { providerId, state });

    // If already consumed, short-circuit as success
    const consumed = state ? oauthStateStore.getConsumed(state) : { found: false };
    if (consumed.found) {
      const data = consumed.data || {};
      console.info('OAuth callback consumed marker hit; returning success without re-processing', { providerId, state });
      return sendPopupResponse(200, {
        success: true,
        provider: providerId,
        state,
        returnUrl: typeof data.returnUrl === 'string' ? data.returnUrl : undefined,
        connectionId: data.connectionId,
        label: data.label,
        userInfoError: data.userInfoError,
      });
    }

    const { tokens, userInfo, returnUrl, connectionId, label, userInfoError } = await oauthManager.handleCallback(
      code,
      state,
      providerId
    );

    console.info('OAuth callback state resolved', {
      providerId,
      state,
      hasTokens: Boolean(tokens?.accessToken),
      connectionId,
      label,
      hasUserInfo: Boolean(userInfo),
    });
    // Redirect to front-end handler (kept for compatibility with existing flow/tests)
    const redirectUrl = normalizeRedirectUrl(returnUrl, providerId);
    redirectUrl.searchParams.set('code', code);
    redirectUrl.searchParams.set('state', state);
    redirectUrl.searchParams.set('provider', providerId);
    if (connectionId) {
      redirectUrl.searchParams.set('connectionId', connectionId);
    }
    if (label) {
      redirectUrl.searchParams.set('label', label);
    }
    if (userInfo?.email) {
      redirectUrl.searchParams.set('email', userInfo.email);
    }
    if (userInfoError) {
      redirectUrl.searchParams.set('userInfoError', userInfoError);
    }

    return res.redirect(302, redirectUrl.toString());
  } catch (error) {
    console.error('OAuth callback error', {
      providerId,
      state,
      error: getErrorMessage(error),
    });
    return sendPopupResponse(400, { success: false, provider: providerId, state, error: getErrorMessage(error) });
  }
});

export default oauthRouter;
