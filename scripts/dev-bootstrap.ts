#!/usr/bin/env tsx
// Development bootstrap: create a dev user + org and seed a simple workflow
import { env } from '../server/env';
import { authService } from '../server/services/AuthService';
import { WorkflowRepository } from '../server/workflow/WorkflowRepository';
import { randomUUID } from 'node:crypto';
import { db, organizationMembers } from '../server/database/schema';
import { eq } from 'drizzle-orm';

type AuthResult = Awaited<ReturnType<typeof authService.login>>;

async function ensureDevUser(): Promise<{ userId: string; orgId: string; token: string }> {
  const email = process.env.DEV_BOOTSTRAP_EMAIL || 'developer@local.test';
  const password = process.env.DEV_BOOTSTRAP_PASSWORD || 'Devpassw0rd!';

  // Try login first
  let auth: AuthResult = await authService.login({ email, password });
  if (!auth.success) {
    // Register if not exists
    const reg = await authService.register({ email, password, name: 'Local Developer' });
    if (!reg.success) {
      throw new Error(`Failed to register dev user: ${reg.error ?? 'unknown error'}`);
    }
    auth = await authService.login({ email, password });
    if (!auth.success) {
      throw new Error(`Failed to login after registration: ${auth.error ?? 'unknown error'}`);
    }
  }

  const userId = auth.user!.id;
  const orgId = auth.activeOrganization!.id;
  const token = auth.token!;

  if (db) {
    await db
      .update(organizationMembers)
      .set({ role: 'owner', isDefault: true })
      .where(eq(organizationMembers.userId, userId));
  }

  return { userId, orgId, token };
}

function buildHelloWorldGraph(): any {
  const nodeId = 'echo-1';
  return {
    id: randomUUID(),
    name: 'Hello World',
    description: 'Minimal test workflow that echoes input.',
    nodes: [
      {
        id: nodeId,
        type: 'function',
        data: {
          label: 'Echo',
          op: 'core.echo',
          params: { message: 'Hello, Automation!' },
        },
      },
    ],
    edges: [],
    metadata: { seeded: true },
  };
}

async function seedWorkflow(userId: string, orgId: string) {
  const graph = buildHelloWorldGraph();
  const record = await WorkflowRepository.saveWorkflowGraph({
    organizationId: orgId,
    userId,
    name: graph.name,
    description: graph.description,
    graph,
    metadata: { seededAt: new Date().toISOString(), seed: 'dev-bootstrap' },
  });
  return { workflowId: record.id, name: record.name };
}

async function main() {
  console.log(`NODE_ENV=${env.NODE_ENV} PORT=${env.PORT}`);

  const { userId, orgId, token } = await ensureDevUser();
  console.log(`✅ Dev user ready: ${userId}`);
  console.log(`✅ Active org: ${orgId}`);

  const { workflowId, name } = await seedWorkflow(userId, orgId);
  console.log(`✅ Seeded workflow: ${name} (${workflowId})`);

  const base = process.env.HOST ? `http://${process.env.HOST}:${env.PORT}` : `http://localhost:${env.PORT}`;
  console.log('\nTry a manual run (copy/paste):');
  console.log(
    `curl -X POST ${base}/api/executions \\\n+  -H "Authorization: Bearer ${token}" \\\n+  -H "x-organization-id: ${orgId}" \\\n+  -H "Content-Type: application/json" \\\n+  -d '{"workflowId":"${workflowId}","triggerType":"manual","triggerData":{"source":"dev-bootstrap"}}'\n`
  );
}

main().catch((err) => {
  console.error('❌ Dev bootstrap failed:', err?.message || err);
  process.exit(1);
});
