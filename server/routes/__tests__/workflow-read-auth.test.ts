import assert from 'node:assert/strict';
import express from 'express';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

const originalNodeEnv = process.env.NODE_ENV;
const originalDatabaseUrl = process.env.DATABASE_URL;
const originalEncryptionKey = process.env.ENCRYPTION_MASTER_KEY;
const originalJwtSecret = process.env.JWT_SECRET;

process.env.NODE_ENV = 'development';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://user:password@localhost:5432/testdb';
process.env.ENCRYPTION_MASTER_KEY =
  process.env.ENCRYPTION_MASTER_KEY ?? '0123456789abcdef0123456789abcdef';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-jwt-secret';

const { registerRoutes } = await import('../../routes.ts');
const workflowRepositoryModule = await import('../../workflow/WorkflowRepository.js');

const originalGetWorkflowById = workflowRepositoryModule.WorkflowRepository.getWorkflowById;

let capturedOrganizationId: string | null = null;

(workflowRepositoryModule.WorkflowRepository as any).getWorkflowById = async (
  workflowId: string,
  organizationId: string,
) => {
  capturedOrganizationId = organizationId;
  return {
    id: workflowId,
    organizationId,
    graph: {
      id: workflowId,
      name: 'Test Workflow',
      version: 1,
      nodes: [],
      edges: [],
    },
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  };
};

const app = express();
app.use(express.json());

let server: Server | null = null;
let exitCode = 0;

try {
  await registerRoutes(app);
  server = createServer(app);

  await new Promise<void>((resolve, reject) =>
    server!.listen(0, (err?: Error) => (err ? reject(err) : resolve())),
  );

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const devResponse = await fetch(`${baseUrl}/api/workflows/test-workflow`);
  assert.equal(devResponse.status, 200, 'development fallback should allow workflow reads');
  const devBody = await devResponse.json();
  assert.equal(devBody.success, true, 'dev request should resolve successfully');
  assert.equal(
    capturedOrganizationId,
    'dev-org',
    'optional auth should inject the dev organization id',
  );

  capturedOrganizationId = null;
  process.env.NODE_ENV = 'production';

  const prodResponse = await fetch(`${baseUrl}/api/workflows/test-workflow`);
  assert.equal(
    prodResponse.status,
    403,
    'production should still require authentication for workflow reads',
  );
  assert.equal(
    capturedOrganizationId,
    null,
    'unauthenticated production requests should not reach the repository',
  );

  console.log(
    'Optional auth populates development workflow requests while production rejects unauthenticated access.',
  );
} catch (error) {
  exitCode = 1;
  console.error(error);
} finally {
  if (server) {
    await new Promise<void>((resolve, reject) =>
      server!.close((err) => (err ? reject(err) : resolve())),
    );
  }

  (workflowRepositoryModule.WorkflowRepository as any).getWorkflowById = originalGetWorkflowById;

  const restore = (key: 'NODE_ENV' | 'DATABASE_URL' | 'ENCRYPTION_MASTER_KEY' | 'JWT_SECRET', value: string | undefined) => {
    if (value) {
      process.env[key] = value;
    } else {
      delete process.env[key];
    }
  };

  restore('NODE_ENV', originalNodeEnv);
  restore('DATABASE_URL', originalDatabaseUrl);
  restore('ENCRYPTION_MASTER_KEY', originalEncryptionKey);
  restore('JWT_SECRET', originalJwtSecret);

  process.exit(exitCode);
}
