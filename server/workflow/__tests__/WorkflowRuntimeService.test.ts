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

async function runConnectionIdAuthRegression(): Promise<void> {
  const runtime = new WorkflowRuntimeService();

  const context: ExecutionContext = {
    workflowId: 'workflow-auth-connection',
    executionId: 'exec-2',
    nodeOutputs: {},
    timezone: 'UTC',
    userId: 'user-auth'
  };

  const mockConnectionService = {
    async getConnection(connectionId: string, userId: string) {
      assert.equal(connectionId, 'conn-auth-1', 'Runtime should request the configured connection id');
      assert.equal(userId, 'user-auth', 'Runtime should request connection for current user');
      return {
        id: connectionId,
        userId,
        name: 'Auth Connection',
        provider: 'sheets',
        type: 'saas',
        credentials: { local: true },
        metadata: { additionalConfig: { sandbox: true } },
        iv: 'iv',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };
    }
  };

  (runtime as any).getConnectionService = async () => mockConnectionService;

  const actionNode = {
    id: 'sheets-connection-node',
    app: 'sheets',
    function: 'append_row',
    params: {
      spreadsheetId: 'spreadsheet-auth',
      sheetName: 'Logs',
      values: ['delta', 'epsilon']
    },
    data: {
      app: 'sheets',
      function: 'append_row',
      auth: { connectionId: 'conn-auth-1' },
      parameters: {
        spreadsheetId: 'spreadsheet-auth',
        sheetName: 'Logs',
        values: ['delta', 'epsilon']
      }
    }
  };

  const result = await runtime.executeNode(actionNode, context);

  assert.equal(result.summary, 'Executed sheets.append_row', 'Action node should execute successfully');
  assert.deepEqual(
    result.output,
    {
      spreadsheetId: 'spreadsheet-auth',
      sheetName: 'Logs',
      rowIndex: 0,
      values: ['delta', 'epsilon']
    },
    'Action node should return append_row metadata when using stored connection'
  );

  assert.ok(
    context.nodeOutputs['sheets-connection-node'],
    'Node output should be stored when connection is resolved from data.auth'
  );
}

try {
  await runSheetsAndTimeRegression();
  await runConnectionIdAuthRegression();
  console.log('WorkflowRuntimeService regressions passed.');
  process.exit(0);
} catch (error) {
  console.error('WorkflowRuntimeService regression failed.', error);
  process.exit(1);
}
