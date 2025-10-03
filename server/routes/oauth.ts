import { Router } from 'express';
import { oauthManager } from '../oauth/OAuthManager';
import { authenticateToken } from '../middleware/auth';
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

oauthRouter.post('/authorize/:provider', authenticateToken, async (req, res) => {
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

    return res.json({
      success: true,
      data: {
        provider: providerId,
        authUrl,
        state,
      },
    });
  } catch (error) {
    console.error('OAuth authorize error:', error);
    return res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

oauthRouter.get('/callback/:provider', async (req, res) => {
  try {
    const providerId = String(req.params.provider || '').toLowerCase();
    const code = typeof req.query.code === 'string' ? req.query.code : undefined;
    const state = typeof req.query.state === 'string' ? req.query.state : undefined;

    if (!providerId) {
      throw new Error('Provider is required');
    }

    if (!code || !state) {
      throw new Error('Missing OAuth code or state');
    }

    if (!oauthManager.supportsOAuth(providerId)) {
      throw new Error(`Unsupported OAuth provider: ${providerId}`);
    }

    const { tokens, userInfo, returnUrl, connectionId, label, userInfoError } = await oauthManager.handleCallback(
      code,
      state,
      providerId
    );

    if (!tokens?.accessToken) {
      throw new Error('OAuth token exchange failed');
    }

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
    console.error('OAuth callback error:', error);
    const providerId = String(req.params.provider || '');
    const fallbackUrl = new URL(
      `${process.env.BASE_URL || process.env.SERVER_PUBLIC_URL || 'http://localhost:5000'}/oauth/callback/${providerId}`
    );
    fallbackUrl.searchParams.set('error', getErrorMessage(error));
    return res.redirect(302, fallbackUrl.toString());
  }
});

export default oauthRouter;
