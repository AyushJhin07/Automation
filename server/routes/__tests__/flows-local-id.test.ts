import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import flowsRouter from '../flows.js';
import { WorkflowRepository } from '../../workflow/WorkflowRepository.js';

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const originalSaveWorkflowGraph = WorkflowRepository.saveWorkflowGraph;

const storedWorkflows = new Map<string, any>();

(WorkflowRepository as any).saveWorkflowGraph = async (input: any) => {
  assert.ok(input.id, 'saveWorkflowGraph should receive an id');
  assert.ok(uuidRegex.test(input.id), 'saveWorkflowGraph should receive a UUID id');

  const graph = input.graph ? { ...input.graph, id: input.id } : { id: input.id };
  const record = {
    id: input.id,
    organizationId: input.organizationId,
    userId: input.userId ?? null,
    name: input.name ?? graph.name ?? 'Untitled Workflow',
    description: input.description ?? null,
    graph,
    metadata: input.metadata ?? null,
  };

  storedWorkflows.set(record.id, record);
  return record;
};

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (req as any).organizationId = 'org-flows-local-id';
  (req as any).organizationStatus = 'active';
  (req as any).user = { id: 'user-flows-local-id' };
  (req as any).permissions = ['workflow:view'];
  next();
});
app.use('/api/flows', flowsRouter);

const server: Server = await new Promise((resolve) => {
  const listener = app.listen(0, () => resolve(listener));
});
server.unref();

try {
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const response = await fetch(`${baseUrl}/api/flows/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: 'local-123',
      name: 'Local draft workflow',
      graph: {
        id: 'local-123',
        name: 'Local draft workflow',
        nodes: [],
        edges: [],
      },
    }),
  });

  assert.equal(response.status, 200, 'persist flow endpoint should accept local id payloads');
  const body = await response.json();
  assert.equal(body.success, true, 'response should indicate success');
  assert.ok(uuidRegex.test(body.workflowId), 'response should return a canonical uuid workflow id');
  assert.equal(body.id, body.workflowId, 'response should echo canonical id on id field');

  const stored = storedWorkflows.get(body.workflowId);
  assert.ok(stored, 'workflow should be persisted with canonical id');
  assert.equal(stored.graph.id, body.workflowId, 'stored graph should use canonical id');
} finally {
  (WorkflowRepository as any).saveWorkflowGraph = originalSaveWorkflowGraph;
  storedWorkflows.clear();
  server.close();
}

console.log('Flows routes local id persistence test passed.');
process.exit(0);
