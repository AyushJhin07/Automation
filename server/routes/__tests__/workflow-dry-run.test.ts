import assert from 'node:assert/strict';
import express from 'express';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

const originalNodeEnv = process.env.NODE_ENV;
process.env.NODE_ENV = 'development';

const executionModule = await import('../executions.js');
const executionRouter = executionModule.default;

const { productionDeployer } = await import('../../core/ProductionDeployer.js');
const { workflowRuntimeService } = await import('../../workflow/WorkflowRuntimeService.js');
const auditLogModule = await import('../../services/AuditLogService.js');
const actionLogModule = await import('../../utils/actionLog.js');

const originalDeploy = productionDeployer.deploy;
const originalExecuteNode = workflowRuntimeService.executeNode;
const originalAuditRecord = auditLogModule.auditLogService.record;
const originalLogAction = actionLogModule.logAction;

(productionDeployer as any).deploy = async () => ({
  success: true,
  logs: ['Dry run preview executed'],
  error: null,
});

(workflowRuntimeService as any).executeNode = async (node: any, _context: any) => ({
  summary: `Previewed ${node.id}`,
  output: { preview: { nodeId: node.id } },
  preview: { nodeId: node.id, sample: true },
  logs: ['Executed in test harness'],
  diagnostics: { invoked: true },
  parameters: node.params ?? {},
});

(auditLogModule.auditLogService as any).record = async () => {};
(actionLogModule as any).logAction = () => {};

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (req as any).organizationId = 'org-dry-run-test';
  (req as any).organizationStatus = 'active';
  (req as any).user = {
    id: 'dry-run-user',
    organizationRole: 'owner',
    permissions: ['execution:read'],
  };
  (req as any).permissions = ['execution:read'];
  next();
});
app.use('/api/executions', executionRouter);

let server: Server | undefined;
let exitCode = 0;

try {
  server = createServer(app);
  await new Promise<void>((resolve) => {
    server!.listen(0, () => resolve());
  });

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const payload = {
    workflowId: 'wf-dry-run-action-only',
    graph: {
      id: 'wf-dry-run-action-only',
      name: 'Action-only dry run',
      nodes: [
        {
          id: 'gmail-1',
          type: 'action.gmail.send_email',
          label: 'Send email',
          params: {
            recipient: 'qa@example.com',
            subject: 'Test dry run',
            body: 'Hello from the dry-run test',
          },
          data: {
            label: 'Send email',
            app: 'gmail',
            function: 'send_email',
            parameters: {
              recipient: 'qa@example.com',
              subject: 'Test dry run',
              body: 'Hello from the dry-run test',
            },
          },
        },
      ],
      edges: [],
    },
  };

  const response = await fetch(`${baseUrl}/api/executions/dry-run`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  assert.equal(response.status, 200, 'dry-run endpoint should respond with 200');
  const body = await response.json();

  assert.equal(body.success, true, 'response should indicate success');
  assert.equal(body.workflowId, payload.workflowId, 'workflowId should echo input');
  assert.equal(body.encounteredError, false, 'action-only dry run should not flag errors');
  assert.ok(body.preview?.success, 'preview should report success');
  assert.ok(Array.isArray(body.preview?.logs), 'preview logs should be returned');

  const execution = body.execution;
  assert.ok(execution, 'execution metadata should be present');
  assert.equal(execution.status, 'completed', 'execution status should report completed');
  assert.ok(Array.isArray(execution.order), 'execution order should be provided');
  assert.ok(execution.order.includes('gmail-1'), 'execution order should include the Gmail node');

  const nodeResult = execution.nodes?.['gmail-1'];
  assert.ok(nodeResult, 'node result should include the Gmail node');
  assert.equal(nodeResult.status, 'success', 'Gmail node should complete successfully');
  assert.ok(nodeResult.result?.preview?.sample, 'preview payload should bubble through to the response');

  console.log('Workflow dry-run endpoint returns preview data for action-only graphs.');
} catch (error) {
  exitCode = 1;
  console.error(error);
} finally {
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server!.close((err) => (err ? reject(err) : resolve()));
    });
  }

  (productionDeployer as any).deploy = originalDeploy;
  (workflowRuntimeService as any).executeNode = originalExecuteNode;
  (auditLogModule.auditLogService as any).record = originalAuditRecord;
  (actionLogModule as any).logAction = originalLogAction;

  if (originalNodeEnv) {
    process.env.NODE_ENV = originalNodeEnv;
  } else {
    delete process.env.NODE_ENV;
  }

  process.exit(exitCode);
}
