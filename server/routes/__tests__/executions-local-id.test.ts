import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';

import flowsRouter from '../flows.js';
import executionRoutes from '../executions.js';
import { WorkflowRepository } from '../../workflow/WorkflowRepository.js';
import { executionQueueService } from '../../services/ExecutionQueueService.js';

const organizationId = 'org-executions-local';
const userId = 'user-executions-local';

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const storedWorkflows = new Map<string, any>();

const originalSaveWorkflowGraph = WorkflowRepository.saveWorkflowGraph;
const originalGetWorkflowById = WorkflowRepository.getWorkflowById;
const originalEnqueue = executionQueueService.enqueue;

(WorkflowRepository as any).saveWorkflowGraph = async (input: any) => {
  if (input.id && !uuidRegex.test(input.id)) {
    const error = new Error(`invalid input syntax for type uuid: "${input.id}"`);
    (error as any).name = 'error';
    (error as any).code = '22P02';
    throw error;
  }

  const id = input.id ?? randomUUID();
  const graph = input.graph ? { ...input.graph, id } : { id, nodes: [], edges: [] };
  const record = {
    id,
    organizationId: input.organizationId,
    userId: input.userId ?? null,
    name: input.name ?? graph.name ?? 'Untitled Workflow',
    description: input.description ?? null,
    graph,
    metadata: input.metadata ?? null,
  };
  storedWorkflows.set(id, record);
  return record;
};

(WorkflowRepository as any).getWorkflowById = async (id: string, orgId: string) => {
  const record = storedWorkflows.get(id);
  if (!record || record.organizationId !== orgId) {
    return null;
  }
  return record;
};

let capturedEnqueue: any = null;
(executionQueueService as any).enqueue = async (params: any) => {
  capturedEnqueue = params;
  return { executionId: 'exec-local-id' };
};

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (req as any).organizationId = organizationId;
  (req as any).organizationStatus = 'active';
  (req as any).user = { id: userId };
  (req as any).permissions = ['workflow:view', 'workflow:deploy'];
  next();
});
app.use('/api/flows', flowsRouter);
app.use('/api/executions', executionRoutes);

const server: Server = await new Promise((resolve) => {
  const listener = app.listen(0, () => resolve(listener));
});
server.unref();

try {
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const localWorkflowId = `local-${Date.now()}`;
  const draftGraph = {
    id: localWorkflowId,
    name: 'Local workflow run test',
    nodes: [
      {
        id: 'trigger-1',
        type: 'trigger.time.manual',
        label: 'Manual Trigger',
        position: { x: 0, y: 0 },
        data: { label: 'Manual Trigger', app: 'time', function: 'manual' },
      },
    ],
    edges: [],
    metadata: { createdBy: 'integration-test' },
  };

  const creationResponse = await fetch(`${baseUrl}/api/flows/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: draftGraph.name, graph: draftGraph }),
  });

  assert.equal(creationResponse.status, 200, 'initial flow creation should succeed');
  const createdBody = await creationResponse.json();
  assert.equal(createdBody.success, true, 'flow creation response should be successful');
  assert.ok(uuidRegex.test(createdBody.workflowId), 'server should return a UUID workflow id');

  const resolvedWorkflowId: string = createdBody.workflowId;
  const finalizedGraph = { ...draftGraph, id: resolvedWorkflowId };

  const saveResponse = await fetch(`${baseUrl}/api/flows/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: resolvedWorkflowId, name: finalizedGraph.name, graph: finalizedGraph }),
  });

  assert.equal(saveResponse.status, 200, 'updating flow with resolved id should succeed');
  const savedBody = await saveResponse.json();
  assert.equal(savedBody.success, true, 'save response should indicate success');
  assert.equal(savedBody.workflowId, resolvedWorkflowId, 'save response should echo resolved id');

  const runResponse = await fetch(`${baseUrl}/api/executions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workflowId: resolvedWorkflowId, triggerType: 'manual', initialData: {} }),
  });

  assert.equal(runResponse.status, 202, 'manual run should accept resolved workflow id');
  const runBody = await runResponse.json();
  assert.equal(runBody.success, true, 'manual run response should be successful');
  assert.equal(runBody.workflowId, resolvedWorkflowId, 'run response should include workflow id');
  assert.equal(runBody.executionId, 'exec-local-id', 'run response should echo execution id');

  assert.ok(capturedEnqueue, 'enqueue should be invoked');
  assert.equal(capturedEnqueue.workflowId, resolvedWorkflowId, 'enqueue should receive resolved workflow id');
  assert.equal(capturedEnqueue.organizationId, organizationId, 'enqueue should receive organization id');
  assert.equal(capturedEnqueue.userId, userId, 'enqueue should receive user id');
} finally {
  (WorkflowRepository as any).saveWorkflowGraph = originalSaveWorkflowGraph;
  (WorkflowRepository as any).getWorkflowById = originalGetWorkflowById;
  (executionQueueService as any).enqueue = originalEnqueue;
  server.close();
}

console.log('Execution routes local id run test passed.');
process.exit(0);
