// DEBUG GRAPH VALIDATION
import { simpleGraphValidator } from './server/core/SimpleGraphValidator';

console.log('🔍 Testing graph validation...\n');

const validGraph = {
  nodes: [
    {
      id: 'trigger-1',
      type: 'trigger',
      appName: 'gmail',
      functionId: 'new_email_received',
      parameters: { labelName: 'inbox' }
    },
    {
      id: 'action-1',
      type: 'action',
      appName: 'google-sheets',
      functionId: 'append_row',
      parameters: { spreadsheetId: 'test-sheet', values: ['{{trigger.subject}}'] }
    }
  ],
  edges: [
    { source: 'trigger-1', target: 'action-1' }
  ]
};

console.log('Testing valid graph...');
const result = simpleGraphValidator.validate(validGraph);
console.log('Result:', JSON.stringify(result, null, 2));

// Test circular graph
const circularGraph = {
  nodes: [
    { id: 'node-1', type: 'action', appName: 'gmail', functionId: 'send_email' },
    { id: 'node-2', type: 'action', appName: 'slack', functionId: 'send_message' }
  ],
  edges: [
    { source: 'node-1', target: 'node-2' },
    { source: 'node-2', target: 'node-1' }
  ]
};

console.log('\nTesting circular graph...');
const circularResult = simpleGraphValidator.validate(circularGraph);
console.log('Result:', JSON.stringify(circularResult, null, 2));