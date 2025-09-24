import assert from 'node:assert/strict';

import { enrichWorkflowNode } from '../node-metadata';
import {
  registerMetadataResolver,
  __clearMetadataResolverRegistryForTests,
} from '../metadata-resolvers';

__clearMetadataResolverRegistryForTests();

registerMetadataResolver('example-app', () => ({
  metadata: {
    columns: ['id', 'name'],
    sample: { id: '123', name: 'Example User' },
    derivedFrom: ['resolver:example-app'],
  },
  outputMetadata: {
    columns: ['id', 'name'],
    sample: { id: '123', name: 'Example User' },
    derivedFrom: ['resolver:example-app-output'],
  },
}));

const enriched = enrichWorkflowNode({
  id: 'example-node',
  type: 'action.example',
  app: 'example-app',
  name: 'Example Node',
  op: 'example-app.performAction',
  params: {},
  data: {
    operation: 'performAction',
    config: {},
  },
} as any);

assert.ok(enriched.metadata, 'enriched node should include metadata');
assert.ok(enriched.outputMetadata, 'enriched node should include output metadata');
assert.deepEqual(
  enriched.metadata?.columns,
  ['id', 'name'],
  'resolver columns should be preserved in metadata'
);
assert.ok(
  enriched.outputMetadata?.derivedFrom?.includes('resolver:example-app-output'),
  'resolver output metadata should include derivedFrom flag'
);
assert.deepEqual(
  enriched.data?.metadata?.sample,
  { id: '123', name: 'Example User' },
  'resolver metadata should be embedded in workflow payload'
);
assert.deepEqual(
  enriched.data?.outputMetadata?.sample,
  { id: '123', name: 'Example User' },
  'resolver output metadata should be embedded in workflow payload'
);

console.log('Metadata resolver integration checks passed.');

__clearMetadataResolverRegistryForTests();
