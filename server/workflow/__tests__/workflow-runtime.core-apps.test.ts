import assert from 'node:assert/strict';

import { WorkflowRuntimeService } from '../WorkflowRuntimeService.js';
import { integrationManager } from '../../integrations/IntegrationManager.js';

const runtime = new WorkflowRuntimeService();
const context = {
  workflowId: 'wf-core-apps',
  executionId: 'exec-core-apps',
  nodeOutputs: {} as Record<string, any>,
  timezone: 'UTC'
};

const sheetsNode = {
  id: 'node-sheets',
  type: 'action.sheets.append_row',
  data: {
    app: 'sheets',
    function: 'append_row',
    parameters: {
      spreadsheetId: 'sheet-123',
      sheetName: 'Entries',
      values: ['alpha', 'beta', 'gamma']
    },
    credentials: { mode: 'local' }
  }
};

const timeNode = {
  id: 'node-time',
  type: 'action.time.delay',
  data: {
    app: 'time',
    function: 'delay',
    parameters: {
      delayMs: 5,
      seconds: 0
    },
    credentials: { mode: 'local' }
  }
};

try {
  const sheetsResult = await runtime.executeNode(sheetsNode, context);
  assert.equal(sheetsResult.summary, 'Executed sheets.append_row', 'Sheets node should report successful execution');
  assert.ok(sheetsResult.output, 'Sheets node should produce output data');
  assert.equal(sheetsResult.output?.rowIndex, 1, 'Sheets node should append the first row');
  assert.deepEqual(
    context.nodeOutputs['node-sheets'],
    sheetsResult.output,
    'Sheets node output should be stored in execution context'
  );

  const timeResult = await runtime.executeNode(timeNode, context);
  assert.equal(timeResult.summary, 'Executed time.delay', 'Time node should report successful execution');
  assert.ok(timeResult.output, 'Time node should produce output data');
  assert.equal(timeResult.output?.requestedDelayMs, 5, 'Time node should capture requested delay');
  assert.equal(context.nodeOutputs['node-time'], timeResult.output, 'Time node output should be stored in execution context');

  console.log('WorkflowRuntimeService executes Sheets append row and Time delay nodes successfully.');
} finally {
  integrationManager.removeIntegration('sheets');
  integrationManager.removeIntegration('time');
}
