import assert from 'node:assert/strict';
import express from 'express';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const workflowReadModule = await import('../workflow-read.js');
const executionRoutesModule = await import('../executions.js');

const { WorkflowRepository } = await import('../../workflow/WorkflowRepository.js');
const { productionGraphCompiler } = await import('../../core/ProductionGraphCompiler.js');
const { productionDeployer } = await import('../../core/ProductionDeployer.js');
const { workflowRuntimeService } = await import('../../workflow/WorkflowRuntimeService.js');
const { executionQueueService } = await import('../../services/ExecutionQueueService.js');

const originalCompile = productionGraphCompiler.compile;
const originalDeploy = productionDeployer.deploy;
const originalExecuteNode = workflowRuntimeService.executeNode;
const originalSaveWorkflowGraph = WorkflowRepository.saveWorkflowGraph;
const originalGetWorkflowById = WorkflowRepository.getWorkflowById;
const originalCreateWorkflowExecution = WorkflowRepository.createWorkflowExecution;
const originalUpdateWorkflowExecution = WorkflowRepository.updateWorkflowExecution;
const originalEnqueue = executionQueueService.enqueue;

const storedWorkflows = new Map<string, any>();
(productionGraphCompiler as any).compile = () => ({
  success: true,
  files: [],
  requiredScopes: [],
  estimatedSize: 0,
});

(productionDeployer as any).deploy = async () => ({
  success: true,
  logs: ['preview deployment executed'],
  error: null,
});

(workflowRuntimeService as any).executeNode = async (node: any) => ({
  summary: `Executed ${node.id}`,
  output: { preview: { nodeId: node.id } },
  preview: { nodeId: node.id },
  logs: ['node executed'],
  diagnostics: { invoked: true },
  parameters: node.params ?? {},
});

(WorkflowRepository as any).saveWorkflowGraph = async (input: any) => {
  const id = input.id;
  const record = {
    id,
    organizationId: input.organizationId,
    userId: input.userId ?? null,
    graph: { ...(input.graph ?? {}), id },
    metadata: input.metadata ?? null,
    name: input.name ?? input.graph?.name ?? 'Untitled Workflow',
    updatedAt: new Date(),
  };
  storedWorkflows.set(id, record);
  return record;
};

(WorkflowRepository as any).getWorkflowById = async (id: string, organizationId: string) => {
  const record = storedWorkflows.get(id);
  if (!record || record.organizationId !== organizationId) {
    return null;
  }
  return record;
};

(WorkflowRepository as any).createWorkflowExecution = async () => ({
  id: 'preview-execution-id',
});

(WorkflowRepository as any).updateWorkflowExecution = async () => {};

let capturedEnqueue: any = null;
(executionQueueService as any).enqueue = async (params: any) => {
  capturedEnqueue = params;
  return { executionId: 'queued-manual-run' };
};

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (req as any).organizationId = 'org-preview-local-id';
  (req as any).organizationStatus = 'active';
  (req as any).user = { id: 'user-preview-local-id' };
  (req as any).permissions = ['execution:read', 'workflow:deploy'];
  next();
});
app.use('/api', workflowReadModule.workflowReadRouter);
app.use('/api/executions', executionRoutesModule.default);

const server: Server = await new Promise((resolve) => {
  const listener = createServer(app);
  listener.listen(0, () => resolve(listener));
});
server.unref();

try {
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const localWorkflowId = `local-${Date.now()}`;
  const draftGraph = {
    id: localWorkflowId,
    name: 'Preview run local workflow',
    nodes: [
      {
        id: 'trigger-1',
        type: 'trigger.time.manual',
        label: 'Manual trigger',
        position: { x: 0, y: 0 },
        data: { label: 'Manual trigger', app: 'time', function: 'manual' },
      },
      {
        id: 'action-1',
        type: 'action.gmail.send_email',
        label: 'Send email',
        position: { x: 200, y: 0 },
        data: { label: 'Send email', app: 'gmail', function: 'send_email' },
      },
    ],
    edges: [
      { id: 'edge-1', source: 'trigger-1', target: 'action-1' },
    ],
    metadata: { createdBy: 'preview-test' },
  };

  const previewResponse = await fetch(`${baseUrl}/api/workflows/${localWorkflowId}/execute`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ graph: draftGraph }),
  });

  assert.equal(previewResponse.status, 200, 'preview execution should start successfully');

  const resolvedHeader = previewResponse.headers.get('x-resolved-workflow-id');
  assert.ok(resolvedHeader && uuidRegex.test(resolvedHeader), 'resolved header should contain a UUID');
  assert.equal(
    previewResponse.headers.get('x-requested-workflow-id'),
    localWorkflowId,
    'requested header should echo the local id',
  );

  const reader = previewResponse.body?.getReader();
  assert.ok(reader, 'preview response should stream events');

  const decoder = new TextDecoder();
  let buffer = '';
  let canonicalWorkflowId: string | null = null;
  let summaryEvent: any = null;

  while (true) {
    const { value, done } = await reader!.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });

    let newlineIndex = buffer.indexOf('\n');
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line) {
        const event = JSON.parse(line);
        if (event.type === 'workflow-id') {
          canonicalWorkflowId = event.workflowId;
          assert.equal(
            event.requestedWorkflowId,
            localWorkflowId,
            'workflow-id event should include requested id',
          );
        }
        if (event.type === 'summary') {
          summaryEvent = event;
        }
      }
      newlineIndex = buffer.indexOf('\n');
    }
  }

  const remaining = buffer.trim();
  if (remaining) {
    const event = JSON.parse(remaining);
    if (event.type === 'workflow-id') {
      canonicalWorkflowId = event.workflowId;
    }
    if (event.type === 'summary') {
      summaryEvent = event;
    }
  }

  assert.ok(canonicalWorkflowId, 'canonical workflow id should be emitted');
  assert.equal(canonicalWorkflowId, resolvedHeader, 'workflow id event should match header');
  assert.ok(summaryEvent, 'summary event should be emitted');
  assert.equal(summaryEvent.workflowId, canonicalWorkflowId, 'summary should report canonical workflow id');
  assert.equal(summaryEvent.success, true, 'summary event should report success');

  const storedRecord = canonicalWorkflowId ? storedWorkflows.get(canonicalWorkflowId) : null;
  assert.ok(storedRecord, 'preview should persist workflow with canonical id');
  assert.equal(storedRecord?.graph?.id, canonicalWorkflowId, 'stored graph should use canonical id');

  const manualRunResponse = await fetch(`${baseUrl}/api/executions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ workflowId: canonicalWorkflowId, triggerType: 'manual' }),
  });

  assert.equal(manualRunResponse.status, 202, 'manual run should accept canonical workflow id');
  const manualBody = await manualRunResponse.json();
  assert.equal(manualBody.success, true, 'manual run response should indicate success');
  assert.equal(manualBody.workflowId, canonicalWorkflowId, 'manual run should echo canonical workflow id');
  assert.equal(manualBody.executionId, 'queued-manual-run', 'manual run should report queued execution id');

  assert.ok(capturedEnqueue, 'manual run should enqueue execution');
  assert.equal(capturedEnqueue.workflowId, canonicalWorkflowId, 'enqueue should use canonical workflow id');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  (productionGraphCompiler as any).compile = originalCompile;
  (productionDeployer as any).deploy = originalDeploy;
  (workflowRuntimeService as any).executeNode = originalExecuteNode;
  (WorkflowRepository as any).saveWorkflowGraph = originalSaveWorkflowGraph;
  (WorkflowRepository as any).getWorkflowById = originalGetWorkflowById;
  (WorkflowRepository as any).createWorkflowExecution = originalCreateWorkflowExecution;
  (WorkflowRepository as any).updateWorkflowExecution = originalUpdateWorkflowExecution;
  (executionQueueService as any).enqueue = originalEnqueue;

  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

if (!process.exitCode || process.exitCode === 0) {
  console.log('Workflow preview endpoint resolves local ids to canonical UUIDs before execution.');
}
