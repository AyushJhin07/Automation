import assert from 'node:assert/strict';

import { convertToNodeGraph } from '../graph-format-converter.js';
import type { WorkflowGraph } from '../../../common/workflow-types.js';

async function runConnectionPropagationTest(): Promise<void> {
  const workflowGraph: WorkflowGraph = {
    id: 'workflow-1',
    name: 'Test Workflow',
    nodes: [
      {
        id: 'node-1',
        type: 'action',
        app: 'gmail',
        name: 'Send Email',
        op: 'gmail.sendEmail',
        params: {
          subject: 'Hello'
        },
        connectionId: 'conn-123',
        auth: {
          connectionId: 'conn-123',
          token: 'abc'
        },
        credentials: {
          apiKey: 'shhhh'
        },
        data: {
          label: 'Send Email'
        }
      }
    ],
    edges: [],
    meta: {}
  };

  const nodeGraph = convertToNodeGraph(workflowGraph);
  const graphNode = nodeGraph.nodes[0];

  assert.equal(graphNode.connectionId, 'conn-123', 'GraphNode should expose connectionId at the top level');
  assert.deepEqual(
    graphNode.auth,
    { connectionId: 'conn-123', token: 'abc' },
    'GraphNode should expose auth payload at the top level'
  );
  assert.deepEqual(
    graphNode.credentials,
    { apiKey: 'shhhh' },
    'GraphNode should expose credentials payload at the top level'
  );
  assert.equal(graphNode.params.connectionId, 'conn-123', 'GraphNode params should include connectionId');
  assert.equal(graphNode.data?.connectionId, 'conn-123', 'GraphNode data should include connectionId');
  assert.deepEqual(
    graphNode.data?.auth,
    { connectionId: 'conn-123', token: 'abc' },
    'GraphNode data should retain auth payload'
  );
  assert.deepEqual(
    graphNode.data?.credentials,
    { apiKey: 'shhhh' },
    'GraphNode data should retain credential payload'
  );
  assert.equal(
    graphNode.data?.parameters?.connectionId,
    'conn-123',
    'GraphNode data parameters should hydrate the connectionId'
  );
}

try {
  await runConnectionPropagationTest();
  console.log('graph-format-converter connection propagation test passed.');
  process.exit(0);
} catch (error) {
  console.error('graph-format-converter connection propagation test failed.', error);
  process.exit(1);
}
