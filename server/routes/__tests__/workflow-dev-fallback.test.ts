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

let flowSaveStatus: string | null = null;
let workflowValidateStatus: string | null = null;

app.use((req, res, next) => {
  const organizationIdHeader = req.headers['x-organization-id'];
  const organizationStatusHeader = req.headers['x-organization-status'];

  if (typeof organizationIdHeader === 'string') {
    (req as any).organizationId = organizationIdHeader;
  }

  if (typeof organizationStatusHeader === 'string') {
    (req as any).organizationStatus = organizationStatusHeader;
  }

  res.on('finish', () => {
    const originalUrl = req.originalUrl || '';
    if (req.method === 'POST' && originalUrl.startsWith('/api/flows/save')) {
      flowSaveStatus = (req as any).organizationStatus ?? null;
    }

    if (req.method === 'POST' && originalUrl.startsWith('/api/workflows/validate')) {
      workflowValidateStatus = (req as any).organizationStatus ?? null;
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
  assert.equal(flowSaveStatus, 'active', 'flow save should run with an active organization context');
  assert.equal(
    capturedSavePayload?.organizationId,
    'dev-org',
    'dev fallback should inject the development organization id for flow saves',
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
  assert.equal(
    workflowValidateStatus,
    'active',
    'workflow validation should run with an active organization context',
  );

  const dryRunValidateResponse = await fetch(`${baseUrl}/api/workflows/validate`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      graph: {
        id: 'action-only-preview',
        name: 'Action Only Preview',
        nodes: [
          {
            id: 'action-1',
            type: 'action.gmail.send',
            params: {
              recipient: 'preview@example.com',
            },
            data: {
              label: 'Send Gmail',
              app: 'gmail',
              nodeType: 'action.gmail.send',
              type: 'action.gmail.send',
              parameters: {
                recipient: 'preview@example.com',
              },
            },
            position: { x: 0, y: 0 },
          },
        ],
        edges: [],
        metadata: {
          runPreview: true,
          mode: 'preview',
        },
      },
    }),
  });

  assert.equal(
    dryRunValidateResponse.status,
    200,
    'action-only dry run validation should respond with 200',
  );
  const dryRunValidateBody = await dryRunValidateResponse.json();
  assert.equal(dryRunValidateBody.success, true, 'dry-run validation should return success payload');
  const dryRunErrors = Array.isArray(dryRunValidateBody?.validation?.errors)
    ? dryRunValidateBody.validation.errors
    : [];
  const triggerErrors = dryRunErrors.filter((error: any) =>
    typeof error?.message === 'string' && error.message.toLowerCase().includes('trigger'),
  );
  assert.equal(
    triggerErrors.length,
    0,
    'dry-run validation should not report missing trigger errors for action-only drafts',
  );

  const manualPreviewResponse = await fetch(`${baseUrl}/api/workflows/validate`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-workflow-preview': 'manual-preview',
    },
    body: JSON.stringify({
      manual: true,
      mode: 'manual-preview',
      graph: {
        id: 'gmail-manual-preview',
        name: 'Gmail Manual Preview',
        nodes: [
          {
            id: 'gmail-action',
            type: 'action.gmail.send',
            params: {
              recipient: 'manual-preview@example.com',
              subject: 'Preview Subject',
              body: 'Preview body',
            },
            data: {
              label: 'Send Gmail',
              app: 'gmail',
              nodeType: 'action.gmail.send',
              type: 'action.gmail.send',
              parameters: {
                recipient: 'manual-preview@example.com',
                subject: 'Preview Subject',
                body: 'Preview body',
              },
            },
            position: { x: 0, y: 0 },
          },
        ],
        edges: [],
      },
    }),
  });

  assert.equal(
    manualPreviewResponse.status,
    200,
    'manual preview validation should respond with 200',
  );
  const manualPreviewBody = await manualPreviewResponse.json();
  assert.equal(
    manualPreviewBody.success,
    true,
    'manual preview validation should return success payload',
  );
  const manualPreviewErrors = Array.isArray(manualPreviewBody?.validation?.errors)
    ? manualPreviewBody.validation.errors
    : [];
  const manualTriggerErrors = manualPreviewErrors.filter((error: any) =>
    typeof error?.message === 'string' && error.message.toLowerCase().includes('trigger'),
  );
  assert.equal(
    manualTriggerErrors.length,
    0,
    'manual preview validation should not report missing trigger errors for Gmail-only drafts',
  );

  const inactiveValidateResponse = await fetch(`${baseUrl}/api/workflows/validate`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-organization-id': 'dev-org',
      'x-organization-status': 'inactive',
    },
    body: JSON.stringify({
      graph: {
        id: 'validate-flow-inactive',
        name: 'Validate Flow Inactive',
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
    inactiveValidateResponse.status,
    200,
    'workflow validation should succeed for inactive dev organizations',
  );
  const inactiveValidateBody = await inactiveValidateResponse.json();
  assert.equal(
    inactiveValidateBody.success,
    true,
    'workflow validation should return success payload when forcing active fallback',
  );
  assert.equal(
    workflowValidateStatus,
    'active',
    'workflow validation should override inactive organization status with active fallback',
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
