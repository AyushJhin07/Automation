import assert from 'node:assert/strict';

import { compileToAppsScript } from '../compile-to-appsscript';
import { WorkflowGraph } from '../../../common/workflow-types';

const graph: WorkflowGraph = {
  id: 'ref-regression-workflow',
  name: 'Reference Regression Workflow',
  nodes: [
    {
      id: 'node-1',
      type: 'action.sheets',
      app: 'sheets',
      name: 'Lookup candidate row',
      op: 'action.sheets:getRow',
      params: {},
      data: {
        operation: 'getRow',
        config: {
          spreadsheetId: 'spreadsheet-123',
          sheetName: 'Candidates'
        }
      }
    },
    {
      id: 'node-2',
      type: 'action.gmail',
      app: 'gmail',
      name: 'Email candidate',
      op: 'action.gmail:sendEmail',
      params: {},
      data: {
        operation: 'sendEmail',
        config: {
          to: { mode: 'ref', nodeId: 'node-1', path: 'candidate_email' },
          subject: 'Interview update',
          body: 'Hello from automation'
        }
      }
    }
  ],
  edges: [
    { id: 'edge-1', from: 'node-1', to: 'node-2', source: 'node-1', target: 'node-2' }
  ],
  meta: {
    prompt: 'Regression reference workflow'
  }
};

const result = compileToAppsScript(graph);
const codeFile = result.files.find(file => file.path === 'Code.gs');

assert.ok(codeFile, 'Code.gs should be emitted for Apps Script compilation');

const code = codeFile!.content;

assert.ok(
  code.includes("var __nodeOutputs = {}"),
  'compiled script should initialise node output tracking map'
);

assert.ok(
  code.includes("__storeNodeOutput('node-1', ctx)"),
  'main execution should store outputs for the upstream node'
);

assert.ok(
  code.includes("__getNodeOutputValue('node-1', 'candidate_email')"),
  'downstream node parameter should resolve via node output helper'
);

assert.ok(
  !code.includes('__APPSSCRIPT_REF__'),
  'no raw reference placeholders should remain in the generated Apps Script'
);

console.log('Reference parameter compilation regression checks passed.');
