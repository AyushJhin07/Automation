import assert from 'node:assert/strict';

import { WorkflowRuntimeService } from '../WorkflowRuntimeService.js';
import { integrationManager } from '../../integrations/IntegrationManager.js';

const runtime = new WorkflowRuntimeService();

integrationManager.removeIntegration('sheets');
integrationManager.removeIntegration('google sheets');
integrationManager.removeIntegration('google-sheets');
integrationManager.removeIntegration('time');

const context = {
  workflowId: 'wf-core-apps-test',
  executionId: 'exec-core-apps',
  nodeOutputs: {} as Record<string, any>
};

const sheetsNode = {
  id: 'node-sheets',
  type: 'action.sheets.append_row',
  app: 'sheets',
  function: 'append_row',
  params: {
    sheet_url: 'https://docs.google.com/spreadsheets/d/demo-sheet-id/edit#gid=0',
    worksheetName: 'Sheet1',
    row: { id: '123', name: 'Alice Example' }
  },
  data: {
    role: 'action',
    app: 'sheets',
    operation: 'append_row',
    config: {
      sheet_url: 'https://docs.google.com/spreadsheets/d/demo-sheet-id/edit#gid=0',
      worksheetName: 'Sheet1',
      row: { id: '123', name: 'Alice Example' }
    },
    credentials: { accessToken: 'local-testing' }
  }
};

const sheetsResult = await runtime.executeNode(sheetsNode as any, context);

assert.equal(sheetsResult.summary.includes('sheets.append_row'), true, 'summary should mention sheets.append_row');
assert.equal(sheetsResult.output?.operation, 'append_row', 'sheets client should report append_row operation');
assert.equal(sheetsResult.output?.appendedRowCount, 1, 'should append exactly one row');
assert.deepEqual(
  sheetsResult.output?.appendedRows?.[0],
  { id: '123', name: 'Alice Example' },
  'sheets client should echo the appended row payload'
);

const timeNode = {
  id: 'node-time-delay',
  type: 'action.time.delay',
  app: 'time',
  function: 'delay',
  params: {
    hours: 1,
    minutes: 30
  },
  data: {
    role: 'action',
    app: 'time',
    operation: 'delay',
    config: {
      hours: 1,
      minutes: 30
    },
    credentials: { token: 'local-testing' }
  }
};

const timeResult = await runtime.executeNode(timeNode as any, context);

assert.equal(timeResult.summary.includes('time.delay'), true, 'summary should mention time.delay');
assert.equal(timeResult.output?.operation, 'delay', 'time client should report delay operation');
assert.equal(timeResult.output?.mode, 'local', 'time client should run locally');
assert.equal(timeResult.output?.delayMs, 90 * 60 * 1000, 'time client should calculate delay in milliseconds');
assert.equal(typeof timeResult.output?.scheduledTime, 'string', 'time client should provide an ISO timestamp');

console.log('WorkflowRuntimeService executes Sheets append row and Time delay nodes using local clients.');
