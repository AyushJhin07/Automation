import assert from 'node:assert/strict';

import { WorkflowRuntimeService } from '../WorkflowRuntimeService.js';

type ExecutionContext = Parameters<WorkflowRuntimeService['executeNode']>[1];

async function runSheetsAndTimeRegression(): Promise<void> {
  const runtime = new WorkflowRuntimeService();

  const context: ExecutionContext = {
    workflowId: 'workflow-sheets-time',
    executionId: 'exec-1',
    nodeOutputs: {},
    timezone: 'UTC'
  };

  const sheetsNode = {
    id: 'sheets-node',
    app: 'sheets',
    function: 'append_row',
    params: {
      spreadsheetId: 'spreadsheet-1',
      sheetName: 'Log',
      values: ['alpha', 'beta', 'gamma']
    },
    data: {
      app: 'sheets',
      function: 'append_row',
      credentials: { local: true }
    }
  };

  const sheetsResult = await runtime.executeNode(sheetsNode, context);

  assert.equal(sheetsResult.summary.includes('sheets'), true, 'Sheets execution summary should mention app');
  assert.deepEqual(
    sheetsResult.output,
    {
      spreadsheetId: 'spreadsheet-1',
      sheetName: 'Log',
      rowIndex: 0,
      values: ['alpha', 'beta', 'gamma']
    },
    'Sheets append_row should return the appended row metadata'
  );

  assert.ok(context.nodeOutputs['sheets-node'], 'Sheets node output should be stored in execution context');

  const timeNode = {
    id: 'time-node',
    app: 'time',
    function: 'delay',
    params: {
      hours: 0.0001
    },
    data: {
      app: 'time',
      function: 'delay',
      credentials: { local: true }
    }
  };

  const timeResult = await runtime.executeNode(timeNode, context);

  assert.equal(timeResult.summary.includes('time.delay'), true, 'Time delay summary should mention function');
  assert.ok(timeResult.output);
  assert.equal(typeof timeResult.output.delayedMs, 'number', 'Delay response should include milliseconds delayed');
  assert.ok(
    timeResult.output.delayedMs >= 0,
    'Delay response should report a non-negative delay duration'
  );

  assert.ok(context.nodeOutputs['time-node'], 'Time node output should be stored in execution context');
}

try {
  await runSheetsAndTimeRegression();
  console.log('WorkflowRuntimeService Sheets + Time execution regression passed.');
  process.exit(0);
} catch (error) {
  console.error('WorkflowRuntimeService regression failed.', error);
  process.exit(1);
}
