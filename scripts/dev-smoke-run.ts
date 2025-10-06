#!/usr/bin/env tsx
// Log in (or register) and run the latest seeded workflow via API
import { env } from '../server/env';
import { authService } from '../server/services/AuthService';
import { db, workflows } from '../server/database/schema';
import { desc, eq } from 'drizzle-orm';

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
  return { token: auth.token!, orgId: auth.activeOrganization!.id, userId: auth.user!.id };
}

async function pickWorkflow(orgId: string): Promise<string> {
  const rows = await db
    .select({ id: workflows.id, updatedAt: workflows.updatedAt })
    .from(workflows)
    .where(eq(workflows.organizationId, orgId))
    .orderBy(desc(workflows.updatedAt))
    .limit(1);
  if (!rows.length) throw new Error('No workflows found for organization');
  return rows[0].id;
}

async function run() {
  const { token, orgId } = await ensureAuth();
  const workflowId = await pickWorkflow(orgId);
  const base = process.env.HOST ? `http://${process.env.HOST}:${env.PORT}` : `http://127.0.0.1:${env.PORT}`;

  const res = await fetch(`${base}/api/executions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'x-organization-id': orgId,
    },
    body: JSON.stringify({ workflowId, triggerType: 'manual', triggerData: { source: 'dev-smoke' } }),
  });

  const body = await res.text();
  console.log(res.status, body);
}

run().catch((e) => {
  console.error('❌ dev-smoke-run failed:', e?.message || e);
  process.exit(1);
});

