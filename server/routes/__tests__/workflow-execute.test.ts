import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { ReadableStream, ReadableStreamDefaultReader } from 'node:stream/web';

import workflowReadRouter from '../workflow-read.js';
import { WorkflowRepository } from '../../workflow/WorkflowRepository.js';
import { llmBudgetAndCache } from '../../llm/LLMBudgetAndCache.js';

const workflowId = 'wf-integration-test';

const organizationId = 'org-route-test';

const sampleWorkflow = {
  id: workflowId,
  name: 'Integration Test Workflow',
  version: 1,
  nodes: [
    {
      id: 'node-1',
      type: 'trigger.time.cron',
      label: 'Scheduled trigger',
      params: { schedule: '0 9 * * *', timezone: 'America/New_York', sampleValue: 99 },
      position: { x: 100, y: 120 },
      data: {
        label: 'Scheduled trigger',
        description: 'Runs every morning at 9AM',
        app: 'time',
        function: 'cron',
        parameters: { schedule: '0 9 * * *', timezone: 'America/New_York', sampleValue: 99 },
        metadata: {
          description: 'Runs every day at 9AM',
        }
      }
    },
    {
      id: 'node-condition',
      type: 'condition.path.boolean',
      label: 'Check sample value',
      params: { rule: 'nodeOutputs["node-1"].sampleValue > 50' },
      position: { x: 320, y: 150 },
      data: {
        label: 'Check sample value',
        description: 'Route based on the trigger sample value',
        role: 'condition',
        config: {
          rule: 'nodeOutputs["node-1"].sampleValue > 50',
          branches: [
            { label: 'true', value: 'true' },
            { label: 'false', value: 'false' }
          ]
        }
      }
    },
    {
      id: 'node-2',
      type: 'action.sheets.append_row',
      label: 'Append row',
      params: { spreadsheetId: 'sheet-123', sheetName: 'Sheet1', range: 'A1:B1', values: ['A', 'B'] },
      position: { x: 560, y: 120 },
      data: {
        label: 'Append row',
        description: 'Add a new row to Sheets',
        app: 'sheets',
        function: 'append_row',
        parameters: { spreadsheetId: 'sheet-123', sheetName: 'Sheet1', range: 'A1:B1', values: ['A', 'B'] },
        metadata: {
          sample: { sheetId: 'sheet-123', values: ['A', 'B'] }
        }
      }
    },
    {
      id: 'node-3',
      type: 'transform.utility.pass_through',
      label: 'False branch log',
      params: { value: 'no-op' },
      position: { x: 560, y: 260 },
      data: {
        label: 'False branch log',
        description: 'Provides an alternate branch for testing',
        role: 'transform',
        parameters: { value: 'no-op' }
      }
    }
  ],
  edges: [
    { id: 'edge-1', from: 'node-1', to: 'node-condition', source: 'node-1', target: 'node-condition' },
    {
      id: 'edge-condition-true',
      from: 'node-condition',
      to: 'node-2',
      source: 'node-condition',
      target: 'node-2',
      label: 'true'
    },
    {
      id: 'edge-condition-false',
      from: 'node-condition',
      to: 'node-3',
      source: 'node-condition',
      target: 'node-3',
      label: 'false'
    }
  ],
  scopes: [],
  secrets: [],
  metadata: {
    createdBy: 'integration-test',
    createdAt: new Date().toISOString(),
    version: '1.0.0'
  }
};

await WorkflowRepository.saveWorkflowGraph({
  id: workflowId,
  userId: 'integration-test-user',
  organizationId,
  name: sampleWorkflow.name,
  description: sampleWorkflow.metadata?.description ?? null,
  graph: sampleWorkflow,
  metadata: sampleWorkflow.metadata ?? null,
});

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (req as any).organizationId = organizationId;
  (req as any).organizationStatus = 'active';
  (req as any).user = { id: 'integration-test-user' };
  next();
});
app.use('/api', workflowReadRouter);

const server: Server = await new Promise((resolve) => {
  const listener = app.listen(0, () => resolve(listener));
});
server.unref();

const controller = new AbortController();
let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
let responseBody: ReadableStream<Uint8Array> | null = null;
let errorOccurred = false;

try {
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const response = await fetch(`${baseUrl}/api/workflows/${workflowId}/execute`, {
    method: 'POST',
    headers: {
      Connection: 'close'
    },
    signal: controller.signal
  });

  assert.equal(response.status, 200, 'endpoint should respond with 200');

  if (!response.body) {
    throw new Error('Response did not include a readable body');
  }

  responseBody = response.body;
  reader = responseBody.getReader();
  const decoder = new TextDecoder();
  const events: any[] = [];
  let buffer = '';
  let summaryReceived = false;

  while (!summaryReceived) {
    const { value, done } = await reader.read();
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
        events.push(event);
        if (event.type === 'summary') {
          summaryReceived = true;
          controller.abort();
          break;
        }
      }
      newlineIndex = buffer.indexOf('\n');
    }
  }

  if (!summaryReceived) {
    const remaining = buffer.trim();
    if (remaining) {
      const event = JSON.parse(remaining);
      events.push(event);
      if (event.type === 'summary') {
        summaryReceived = true;
      }
    }
  }

  if (summaryReceived) {
    controller.abort();
  }

  assert.ok(events.some((event) => event.type === 'node-start'), 'should emit node-start events');

  const triggerCompleted = events.find((event) => event.type === 'node-complete' && event.nodeId === 'node-1');
  assert.ok(triggerCompleted, 'trigger node should emit node-complete event');
  assert.ok(triggerCompleted.result?.preview, 'trigger completion should include preview payload');

  const conditionCompleted = events.find((event) => event.type === 'node-complete' && event.nodeId === 'node-condition');
  assert.ok(conditionCompleted, 'condition node should emit node-complete event');
  assert.equal(conditionCompleted.result?.diagnostics?.matchedBranch, 'true', 'condition should select the true branch');
  assert.equal(conditionCompleted.result?.diagnostics?.matchedEdgeId, 'edge-condition-true', 'condition diagnostics should include the selected edge id');
  const branches = conditionCompleted.result?.diagnostics?.availableBranches;
  assert.ok(Array.isArray(branches), 'condition diagnostics should include available branches');
  assert.ok(branches.some((branch: any) => branch?.edgeId === 'edge-condition-true'), 'true branch metadata should be present');

  const actionError = events.find((event) => event.type === 'node-error' && event.nodeId === 'node-2');
  assert.ok(actionError, 'action node should emit node-error event when credentials are missing');
  assert.match(actionError.error?.message || '', /connection/i, 'node-error should explain missing connection');

  const summary = events.find((event) => event.type === 'summary');
  assert.ok(summary, 'should emit summary event at the end');
  assert.equal(summary.success, false, 'summary should report failure when a node errors');
  assert.ok(summary.message?.toLowerCase().includes('error'), 'summary message should mention errors');
  assert.equal(summary.results?.['node-2']?.status, 'error', 'summary should capture per-node error status');

  console.log('Workflow execute endpoint emits streaming step results.');
} catch (error) {
  errorOccurred = true;
  console.error(error);
} finally {
  if (reader) {
    try {
      await reader.cancel();
    } catch {}
    try {
      reader.releaseLock();
    } catch {}
    reader = null;
  }

  if (responseBody) {
    try {
      await responseBody.cancel();
    } catch {}
    responseBody = null;
  }

  controller.abort();

  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
  await WorkflowRepository.deleteWorkflow(workflowId, organizationId);
  llmBudgetAndCache.dispose();
  const activeHandles = (process as any)._getActiveHandles?.() ?? [];
  for (const handle of activeHandles) {
    if (handle?.constructor?.name === 'Socket' && typeof handle.unref === 'function') {
      handle.unref();
    }
  }
  const exitCode = errorOccurred ? 1 : (typeof process.exitCode === 'number' ? process.exitCode : 0);
  setImmediate(() => process.exit(exitCode)).unref?.();
}
