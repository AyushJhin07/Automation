#!/usr/bin/env tsx
import { env } from '../server/env';
import { authService } from '../server/services/AuthService';
import { WorkflowRepository } from '../server/workflow/WorkflowRepository';

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
    userId: auth.user!.id,
  };
}

async function ensureWorkflow(orgId: string): Promise<string> {
  const workflows = await WorkflowRepository.listWorkflows({ organizationId: orgId, limit: 1, offset: 0 });
  if (!workflows.workflows.length) {
    throw new Error('No workflows available. Run npm run dev:bootstrap first.');
  }
  return workflows.workflows[0].id;
}

async function main() {
  const base = process.env.HOST ? `http://${process.env.HOST}:${env.PORT}` : `http://127.0.0.1:${env.PORT}`;
  const { token, orgId } = await ensureAuth();
  const workflowId = await ensureWorkflow(orgId);

  const registerResp = await fetch(`${base}/api/webhooks/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Organization-Id': orgId,
    },
    body: JSON.stringify({
      appId: 'dev-app',
      triggerId: 'manual-event',
      workflowId,
      metadata: { source: 'dev-webhook-smoke' },
    }),
  });

  const registerBody = await registerResp.json().catch(() => ({}));
  if (!registerResp.ok || !registerBody.success) {
    throw new Error(`Webhook registration failed: ${registerBody.error || registerResp.statusText}`);
  }

  const endpoint: string = registerBody.endpoint;
  console.log(`✅ Registered webhook at ${endpoint}`);

  const payload = {
    event: 'dev.smoke',
    timestamp: new Date().toISOString(),
    data: { message: 'Hello from dev-webhook-smoke' },
  };

  const postResp = await fetch(`${base}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Test-Webhook': 'dev-smoke',
    },
    body: JSON.stringify(payload),
  });

  const postText = await postResp.text();
  console.log(`Webhook delivery ${postResp.status}: ${postText}`);
}

main().catch((err) => {
  console.error('❌ dev-webhook-smoke failed:', err?.message || err);
  process.exit(1);
});
