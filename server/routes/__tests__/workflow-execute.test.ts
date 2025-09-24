import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import workflowReadRouter from '../workflow-read.js';
import { WorkflowStoreService } from '../../workflow/workflow-store.js';

const workflowId = 'wf-integration-test';

const funkyWorkflowId = 'wf-invalid-identifiers';

const collectEvents = async (response: any) => {
  if (!response.body) {
    throw new Error('Response is missing a body stream');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const events: any[] = [];
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newlineIndex = buffer.indexOf('\n');
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line) {
        events.push(JSON.parse(line));
      }
      newlineIndex = buffer.indexOf('\n');
    }
  }

  const remaining = buffer.trim();
  if (remaining) {
    events.push(JSON.parse(remaining));
  }

  return events;
};

const sampleWorkflow = {
  id: workflowId,
  name: 'Integration Test Workflow',
  version: 1,
  nodes: [
    {
      id: 'node-1',
      type: 'trigger.time.cron',
      label: 'Scheduled trigger',
      params: { schedule: '0 9 * * *', timezone: 'America/New_York' },
      position: { x: 100, y: 120 },
      data: {
        label: 'Scheduled trigger',
        description: 'Runs every morning at 9AM',
        app: 'time',
        function: 'cron',
        parameters: { schedule: '0 9 * * *', timezone: 'America/New_York' },
        metadata: {
          description: 'Runs every day at 9AM',
        }
      }
    },
    {
      id: 'node-2',
      type: 'action.sheets.append_row',
      label: 'Append row',
      params: { spreadsheetId: 'sheet-123', sheetName: 'Sheet1', range: 'A1:B1', values: ['A', 'B'] },
      position: { x: 360, y: 180 },
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
    }
  ],
  edges: [
    { id: 'edge-1', from: 'node-1', to: 'node-2', source: 'node-1', target: 'node-2' }
  ],
  scopes: [],
  secrets: [],
  metadata: {
    createdBy: 'integration-test',
    createdAt: new Date().toISOString(),
    version: '1.0.0'
  }
};

WorkflowStoreService.store(workflowId, sampleWorkflow);

const app = express();
app.use(express.json());
app.use('/api', workflowReadRouter);

const server: Server = await new Promise((resolve) => {
  const listener = app.listen(0, () => resolve(listener));
});

try {
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const response = await fetch(`${baseUrl}/api/workflows/${workflowId}/execute`, {
    method: 'POST'
  });

  assert.equal(response.status, 200, 'endpoint should respond with 200');
  const events = await collectEvents(response);

  assert.ok(events.some((event) => event.type === 'node-start'), 'should emit node-start events');

  const completed = events.find((event) => event.type === 'node-complete');
  assert.ok(completed, 'should emit node-complete events');
  assert.ok(['node-1', 'node-2'].includes(completed.nodeId), 'node-complete should reference a workflow node');
  assert.ok(completed.result?.preview?.app, 'node-complete event should include preview metadata');

  const summary = events.find((event) => event.type === 'summary');
  assert.ok(summary, 'should emit summary event at the end');
  assert.equal(summary.success, true, 'summary should report success for sample workflow');
  assert.ok(summary.results?.['node-2'], 'summary should include per-node results');

  const funkyGraph = {
    id: 'Funky Workflow 1',
    name: 'Funky Workflow 1',
    version: 1,
    nodes: [
      {
        id: 'trigger.google-sheets-enhanced.new_row-1',
        type: 'trigger.google-sheets-enhanced.new_row',
        label: 'Weird Sheets Trigger',
        params: { spreadsheetId: 'sheet funky', sheetName: 'Emails' },
        position: { x: 120, y: 90 },
        data: {
          label: 'Weird Sheets Trigger',
          description: 'Watches for new rows',
          app: 'google-sheets-enhanced',
          function: 'new_row',
          parameters: { spreadsheetId: 'sheet funky', sheetName: 'Emails' },
          metadata: {
            headers: ['Email'],
            sampleRow: { Email: 'user@example.com' }
          }
        }
      },
      {
        id: 'action.gmail.send_email-1',
        type: 'action.gmail.send_email',
        label: 'Send Gmail Message',
        params: {
          recipient: 'user@example.com',
          subject: 'Hello',
          body: 'Testing sanitized ids'
        },
        position: { x: 360, y: 220 },
        data: {
          label: 'Send Gmail Message',
          app: 'gmail',
          function: 'send_email',
          parameters: {
            recipient: 'user@example.com',
            subject: 'Hello',
            body: 'Testing sanitized ids'
          },
          metadata: { }
        }
      }
    ],
    edges: [
      { id: 'edge trigger -> action', source: 'trigger.google-sheets-enhanced.new_row-1', target: 'action.gmail.send_email-1' }
    ],
    scopes: [],
    secrets: [],
    metadata: {
      createdAt: new Date().toISOString(),
      version: '0.0.1'
    }
  };

  const funkyResponse = await fetch(`${baseUrl}/api/workflows/${funkyWorkflowId}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ graph: funkyGraph })
  });

  assert.equal(funkyResponse.status, 200, 'sanitization should allow execution of graphs with unsafe identifiers');
  const funkyEvents = await collectEvents(funkyResponse);

  const funkySummary = funkyEvents.find((event) => event.type === 'summary');
  assert.ok(funkySummary, 'sanitized workflow should emit summary event');
  assert.equal(funkySummary.success, true, 'sanitized workflow should compile successfully');
  assert.ok(funkySummary.results?.['trigger.google-sheets-enhanced.new_row-1'], 'summary should be keyed by original trigger id');
  assert.ok(funkySummary.results?.['action.gmail.send_email-1'], 'summary should include gmail action results under original id');
  const gmailSummary = funkySummary.results?.['action.gmail.send_email-1'];
  assert.ok(gmailSummary?.internalId, 'summary should expose sanitized internal id for gmail node');
  assert.match(gmailSummary.internalId, /^[a-zA-Z0-9_-]+$/, 'summary internal id should follow schema-safe pattern');
  assert.notEqual(gmailSummary.internalId, 'action.gmail.send_email-1', 'summary internal id should differ from original when sanitized');

  const funkyTriggerStart = funkyEvents.find((event) => event.type === 'node-start' && event.nodeId === 'trigger.google-sheets-enhanced.new_row-1');
  assert.ok(funkyTriggerStart, 'should stream node-start for original trigger id');
  assert.match(funkyTriggerStart.internalId, /^[a-zA-Z0-9_-]+$/, 'trigger internal id should be schema-safe');
  assert.notEqual(funkyTriggerStart.internalId, funkyTriggerStart.nodeId, 'sanitized trigger id should differ from original when invalid characters exist');

  const funkyGmailComplete = funkyEvents.find((event) => event.type === 'node-complete' && event.nodeId === 'action.gmail.send_email-1');
  assert.ok(funkyGmailComplete, 'should stream node-complete for gmail action');
  assert.match(funkyGmailComplete.internalId, /^[a-zA-Z0-9_-]+$/, 'gmail internal id should be schema-safe');
  assert.notEqual(funkyGmailComplete.internalId, funkyGmailComplete.nodeId, 'gmail internal id should strip unsafe characters');
  assert.ok(funkyGmailComplete.result?.preview?.parameters, 'gmail preview should still include parameters after sanitization');

  console.log('Workflow execute endpoint emits streaming step results.');
} finally {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
  WorkflowStoreService.stopCleanupTimer();
  WorkflowStoreService.clear(workflowId);
  WorkflowStoreService.clear(funkyWorkflowId);
}
