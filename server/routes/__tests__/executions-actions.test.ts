import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import executionRoutes from '../executions.js';
import { WorkflowRepository } from '../../workflow/WorkflowRepository.js';
import { executionQueueService } from '../../services/ExecutionQueueService.js';
import { ExecutionQuotaExceededError } from '../../services/ExecutionQuotaService.js';
import { productionDeployer } from '../../core/ProductionDeployer.js';

const organizationId = 'org-executions-test';
const userId = 'user-executions-test';

const sampleWorkflow = {
  id: 'wf-executions-test',
  name: 'Workflow API test',
  nodes: [
    {
      id: 'trigger-1',
      type: 'trigger.time.cron',
      label: 'Scheduled trigger',
      params: { schedule: '0 9 * * *', timezone: 'UTC', sampleValue: 1 },
      position: { x: 0, y: 0 },
      data: {
        label: 'Scheduled trigger',
        description: 'Synthetic trigger for testing',
        app: 'time',
        function: 'cron',
        parameters: { schedule: '0 9 * * *', timezone: 'UTC', sampleValue: 1 },
      },
    },
    {
      id: 'action-1',
      type: 'action.transform.utility.pass_through',
      label: 'Pass Through',
      params: { value: 'test' },
      position: { x: 200, y: 0 },
      data: {
        label: 'Pass Through',
        description: 'Echo value',
        app: 'transform',
        function: 'utility.pass_through',
        parameters: { value: 'test' },
      },
    },
  ],
  edges: [
    { id: 'edge-1', from: 'trigger-1', to: 'action-1', source: 'trigger-1', target: 'action-1' },
  ],
  metadata: { createdAt: new Date().toISOString(), version: '1.0.0' },
};

const originalGetWorkflowById = WorkflowRepository.getWorkflowById;
(WorkflowRepository as any).getWorkflowById = async (id: string, orgId: string) => {
  if (id === sampleWorkflow.id && orgId === organizationId) {
    return {
      id: sampleWorkflow.id,
      organizationId,
      graph: sampleWorkflow,
    };
  }
  return null;
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
app.use('/api/executions', executionRoutes);

const server: Server = await new Promise((resolve) => {
  const listener = app.listen(0, () => resolve(listener));
});
server.unref();

try {
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  {
    const originalEnqueue = executionQueueService.enqueue.bind(executionQueueService);
    let captured: any = null;
    (executionQueueService as any).enqueue = async (params: any) => {
      captured = params;
      return { executionId: 'exec-manual' };
    };

    const response = await fetch(`${baseUrl}/api/executions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workflowId: sampleWorkflow.id }),
    });

    assert.equal(response.status, 202, 'manual run should enqueue with 202');
    const body = await response.json();
    assert.equal(body.success, true, 'manual run response should be successful');
    assert.equal(body.executionId, 'exec-manual', 'manual run should return execution id');
    assert.equal(captured.workflowId, sampleWorkflow.id, 'enqueue should receive workflow id');
    assert.equal(captured.organizationId, organizationId, 'enqueue should include organization id');
    assert.equal(captured.userId, userId, 'enqueue should include user id');

    (executionQueueService as any).enqueue = originalEnqueue;
  }

  {
    const originalEnqueue = executionQueueService.enqueue.bind(executionQueueService);
    (executionQueueService as any).enqueue = async () => {
      throw new ExecutionQuotaExceededError({
        organizationId,
        reason: 'concurrency',
        limit: 5,
        current: 5,
      });
    };

    const response = await fetch(`${baseUrl}/api/executions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workflowId: sampleWorkflow.id }),
    });

    assert.equal(response.status, 429, 'quota violation should return 429');
    const body = await response.json();
    assert.equal(body.error, 'EXECUTION_QUOTA_EXCEEDED', 'error code should reflect quota');

    (executionQueueService as any).enqueue = originalEnqueue;
  }

  {
    const originalDeploy = productionDeployer.deploy;
    (productionDeployer as any).deploy = async () => ({ success: true, logs: ['dry-run'] });

    const response = await fetch(`${baseUrl}/api/executions/dry-run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workflowId: sampleWorkflow.id }),
    });

    assert.equal(response.status, 200, 'dry-run should return 200');
    const body = await response.json();
    assert.equal(body.success, true, 'dry-run should succeed');
    assert.equal(body.execution.status, 'completed', 'dry-run execution should be completed');
    assert.ok(body.execution.nodes['trigger-1'], 'dry-run should include trigger results');

    (productionDeployer as any).deploy = originalDeploy;
  }
} finally {
  (WorkflowRepository as any).getWorkflowById = originalGetWorkflowById;
  server.close();
}

console.log('Execution routes manual/dry-run tests passed.');
process.exit(0);
