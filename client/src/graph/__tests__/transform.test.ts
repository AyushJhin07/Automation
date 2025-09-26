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

const dottedSpec = {
  version: '1.0' as const,
  name: 'Dotted Types Workflow',
  description: 'ensures dotted types survive round trip',
  triggers: [
    {
      id: 'trigger-1',
      type: 'trigger.example.listen',
      app: 'example-app',
      label: 'Example Trigger',
      inputs: {},
      outputs: ['event']
    }
  ],
  nodes: [
    {
      id: 'action-1',
      type: 'action.example.run',
      app: 'example-app',
      label: 'Example Action',
      inputs: {},
      outputs: ['result']
    }
  ],
  edges: []
};

const dottedGraph = specToReactFlow(dottedSpec);

const dottedPayload = serializeGraphPayload({
  nodes: dottedGraph.nodes,
  edges: dottedGraph.edges,
  workflowIdentifier: 'wf-dotted',
  specName: dottedSpec.name,
  specVersion: 1,
  metadata: {}
});

const triggerNode = dottedPayload.nodes.find((node) => node.id === 'trigger-1');
const actionNode = dottedPayload.nodes.find((node) => node.id === 'action-1');

assert(triggerNode, 'expected trigger node to be serialized');
assert(actionNode, 'expected action node to be serialized');

assert.equal(triggerNode?.type, 'trigger.example.listen');
assert.equal(triggerNode?.nodeType, 'trigger.example.listen');
assert.equal(triggerNode?.data?.type, 'trigger.example.listen');
assert.equal(triggerNode?.data?.nodeType, 'trigger.example.listen');

assert.equal(actionNode?.type, 'action.example.run');
assert.equal(actionNode?.nodeType, 'action.example.run');
assert.equal(actionNode?.data?.type, 'action.example.run');
assert.equal(actionNode?.data?.nodeType, 'action.example.run');

