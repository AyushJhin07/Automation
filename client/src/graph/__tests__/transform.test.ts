import assert from 'node:assert/strict';

import { specToReactFlow } from '../transform';
import { serializeGraphPayload } from '../../components/workflow/graphPayload';

const spec = {
  version: '1.0' as const,
  name: 'Connection Workflow',
  description: 'ensures connection id survives hydration',
  triggers: [],
  nodes: [
    {
      id: 'node-1',
      type: 'action.example',
      app: 'example-app',
      label: 'Example Node',
      inputs: {
        foo: 'bar'
      },
      outputs: ['result'],
      auth: {
        strategy: 'oauth' as const,
        connectionId: 'conn-123'
      }
    }
  ],
  edges: []
};

const { nodes, edges } = specToReactFlow(spec);

const payload = serializeGraphPayload({
  nodes,
  edges,
  workflowIdentifier: 'wf-1',
  specName: spec.name,
  specVersion: 1,
  metadata: {}
});

const serializedNode = payload.nodes[0];

assert.equal(serializedNode.data.connectionId, 'conn-123');
assert.equal(serializedNode.params.connectionId, 'conn-123');
assert.equal(serializedNode.data.auth?.connectionId, 'conn-123');
assert.equal(serializedNode.data.parameters.connectionId, 'conn-123');

