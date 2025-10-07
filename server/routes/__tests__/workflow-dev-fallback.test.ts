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

const originalSaveWorkflowGraph = workflowRepositoryModule.WorkflowRepository.saveWorkflowGraph;

let capturedSavePayload: any = null;
const capturedRequestContexts: Array<{
  path: string;
  status: string | undefined;
  id: string | undefined;
  role: string | undefined;
  plan: string | undefined;
}> = [];

(workflowRepositoryModule.WorkflowRepository as any).saveWorkflowGraph = async (
  payload: any,
) => {
  capturedSavePayload = payload;
  return {
    id: payload?.id ?? 'saved-workflow',
    organizationId: payload?.organizationId,
    graph: payload?.graph ?? {},
  };
};

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.on('finish', () => {
    if (
      req.path === '/api/flows/save' ||
      req.path === '/api/workflows/validate'
    ) {
      capturedRequestContexts.push({
        path: req.path,
        status: (req as any).organizationStatus,
        id: (req as any).organizationId,
        role: (req as any).organizationRole,
        plan: (req as any).organizationPlan,
      });
    }
  });
  next();
});

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

  const flowResponse = await fetch(`${baseUrl}/api/flows/save`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      graph: {
        id: 'test-flow',
        name: 'Dev Flow',
        nodes: [],
        edges: [],
      },
    }),
  });

  assert.equal(flowResponse.status, 200, 'flows save should succeed without auth in development');
  const flowBody = await flowResponse.json();
  assert.equal(flowBody.success, true, 'flows save should return success');
  assert.equal(
    capturedSavePayload?.organizationId,
    'dev-org',
    'dev fallback should inject the development organization id for flow saves',
  );
  const flowContext = capturedRequestContexts.find((entry) => entry.path === '/api/flows/save');
  assert.ok(flowContext, 'flow save should record a captured organization context');
  assert.equal(
    flowContext?.status,
    'active',
    'dev fallback should mark the flow save organization status as active',
  );

  const validateResponse = await fetch(`${baseUrl}/api/workflows/validate`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      graph: {
        id: 'validate-flow',
        name: 'Validate Flow',
        nodes: [
          {
            id: 'node-1',
            type: 'trigger',
            data: { label: 'Start' },
            position: { x: 0, y: 0 },
          },
        ],
        edges: [],
      },
    }),
  });

  assert.equal(
    validateResponse.status,
    200,
    'workflow validation should succeed without auth in development',
  );
  const validateBody = await validateResponse.json();
  assert.equal(validateBody.success, true, 'workflow validation should return success payload');
  const validateContext = capturedRequestContexts.find(
    (entry) => entry.path === '/api/workflows/validate',
  );
  assert.ok(validateContext, 'workflow validation should record a captured organization context');
  assert.equal(
    validateContext?.status,
    'active',
    'dev fallback should mark the workflow validation organization status as active',
  );
  assert.equal(
    validateContext?.id,
    'dev-org',
    'dev fallback should inject the development organization id for workflow validation',
  );

  console.log(
    'Development organization fallback allows unauthenticated flow saves and workflow validation.',
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

  (workflowRepositoryModule.WorkflowRepository as any).saveWorkflowGraph = originalSaveWorkflowGraph;

  const restore = (
    key: 'NODE_ENV' | 'DATABASE_URL' | 'ENCRYPTION_MASTER_KEY' | 'JWT_SECRET',
    value: string | undefined,
  ) => {
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
