#!/usr/bin/env tsx
import { env } from '../server/env';
import { authService } from '../server/services/AuthService';

async function ensureAuth() {
  const email = process.env.DEV_BOOTSTRAP_EMAIL || 'developer@local.test';
  const password = process.env.DEV_BOOTSTRAP_PASSWORD || 'Devpassw0rd!';
  let auth = await authService.login({ email, password });
  if (!auth.success) {
    const reg = await authService.register({ email, password, name: 'Local Developer' });
    if (!reg.success) throw new Error(reg.error || 'register failed');
    auth = await authService.login({ email, password });
    if (!auth.success) throw new Error(auth.error || 'login failed');
  }
  return {
    token: auth.token!,
    orgId: auth.activeOrganization!.id,
  };
}

async function main() {
  const base = process.env.HOST ? `http://${process.env.HOST}:${env.PORT}` : `http://127.0.0.1:${env.PORT}`;
  const { token, orgId } = await ensureAuth();

  const storeResp = await fetch(`${base}/api/oauth/store-connection`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Organization-Id': orgId,
    },
    body: JSON.stringify({
      provider: 'dev-fake',
      tokens: {
        accessToken: 'dev-access-token',
        refreshToken: 'dev-refresh-token',
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      },
      userInfo: {
        id: 'dev-user',
        email: 'developer@local.test',
      },
      additionalConfig: { note: 'Stored via dev-oauth-smoke' },
    }),
  });

  const storeBody = await storeResp.json().catch(() => ({}));
  if (!storeResp.ok || !storeBody.success) {
    throw new Error(`Connection store failed: ${storeBody.error || storeResp.statusText}`);
  }

  console.log('✅ Stored dev connection successfully');
}

main().catch((err) => {
  console.error('❌ dev-oauth-smoke failed:', err?.message || err);
  process.exit(1);
});
