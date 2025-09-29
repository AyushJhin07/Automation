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

async function runLoopIterationTest(): Promise<void> {
  const runtime = new WorkflowRuntimeService();

  const loopNode = {
    id: 'loop-1',
    type: 'loop.collection.for_each',
    label: 'Loop over names',
    params: {
      collection: ['alpha', 'beta', 'gamma'],
      itemAlias: 'name'
    },
    data: {
      parameters: {
        collection: ['alpha', 'beta', 'gamma'],
        itemAlias: 'name'
      },
      bodyNodeIds: ['transform-1']
    }
  };

  const transformNode = {
    id: 'transform-1',
    type: 'transform.utility.capture',
    params: {
      value: { mode: 'ref', nodeId: 'loop-1', path: 'name' }
    },
    data: {
      parameters: {
        value: { mode: 'ref', nodeId: 'loop-1', path: 'name' }
      }
    }
  };

  const context: ExecutionContext = {
    workflowId: 'workflow-loop-test',
    executionId: 'exec-loop-1',
    nodeOutputs: {},
    nodeMap: new Map([
      ['loop-1', loopNode],
      ['transform-1', transformNode]
    ]),
    edges: [
      { source: 'loop-1', target: 'transform-1', sourceHandle: 'body' }
    ],
    skipNodes: new Set<string>(),
    timezone: 'UTC'
  } as any;

  const loopResult = await runtime.executeNode(loopNode, context);

  assert.equal(loopResult.output.total, 3, 'Loop should iterate over three items');
  assert.equal(loopResult.output.iterations.length, 3, 'Loop should record each iteration output');
  assert.deepEqual(
    loopResult.output.iterations.map((entry: any) => entry.outputs['transform-1']?.value ?? entry.outputs['transform-1']),
    ['alpha', 'beta', 'gamma'],
    'Child node output should match each collection item'
  );
  assert.ok(context.skipNodes?.has('transform-1'), 'Loop execution should mark child nodes as skipped for global run');
  assert.equal(
    context.nodeOutputs['transform-1']?.value,
    'gamma',
    'Transform node should store the most recent iteration output'
  );
}

try {
  await runSheetsAndTimeRegression();
  await runLoopIterationTest();
  console.log('WorkflowRuntimeService Sheets + Time execution regression passed.');
  process.exit(0);
} catch (error) {
  console.error('WorkflowRuntimeService regression failed.', error);
  process.exit(1);
}
