import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { attachConnectorMetadata, buildOperationMetadata } from '../metadataAdapter';
import { DEFAULT_NODE_IO_CHANNEL, NODE_IO_METADATA_SCHEMA_VERSION } from '../../../shared/metadata';

const loadConnectorDefinition = (connectorId: string) => {
  const filePath = resolve(process.cwd(), 'connectors', connectorId, 'definition.json');
  const raw = readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as Record<string, any>;
};

try {
  const basecamp = attachConnectorMetadata(loadConnectorDefinition('basecamp'));
  const createProject = basecamp.actions?.find((action: any) => action.id === 'create_project');
  assert(createProject, 'create_project action should exist');
  assert(createProject.io, 'create_project should expose io metadata');
  assert.equal(createProject.io?.schemaVersion, NODE_IO_METADATA_SCHEMA_VERSION);

  const outputChannel = createProject.io?.outputs?.[DEFAULT_NODE_IO_CHANNEL];
  assert(outputChannel, 'default output channel should be present');
  assert.deepEqual(outputChannel?.sample, { success: true }, 'connector sample should be preserved');
  assert.ok(outputChannel?.columns?.includes('success'), 'output columns should include schema keys');
  assert.equal(
    (outputChannel?.schema as any)?.properties?.success?.type,
    'boolean',
    'output schema should retain property definitions',
  );
  assert.ok(outputChannel?.samples?.[0]?.source === 'connector', 'samples should be tagged as connector provided');

  const inputChannel = createProject.io?.inputs?.[DEFAULT_NODE_IO_CHANNEL];
  assert(inputChannel, 'default input channel should be present');
  assert.ok(inputChannel?.columns?.includes('accountId'), 'input columns should include required parameters');
  assert.equal(
    (inputChannel?.schema as any)?.properties?.accountId?.type,
    'string',
    'input schema should retain parameter metadata',
  );

  const synthetic = buildOperationMetadata({
    parameters: {
      type: 'object',
      properties: {
        payload: {
          type: 'object',
          properties: {
            nested: { type: 'number' },
          },
        },
        tags: { type: 'array', items: { type: 'string' } },
      },
    },
    sample: {
      payload: { nested: 42 },
      tags: ['alpha', 'beta'],
    },
  });

  assert(synthetic, 'synthetic metadata should be generated');
  assert.equal(synthetic?.schemaVersion, NODE_IO_METADATA_SCHEMA_VERSION);

  const syntheticOutput = synthetic?.outputs?.[DEFAULT_NODE_IO_CHANNEL];
  assert(syntheticOutput, 'synthetic metadata should include default output channel');
  assert.ok(
    syntheticOutput?.columns?.includes('payload.nested'),
    'nested object keys should be flattened into dot paths',
  );
  assert.ok(
    syntheticOutput?.columns?.includes('tags'),
    'array keys should be preserved in the column list',
  );
  assert.deepEqual(
    syntheticOutput?.samples?.[0]?.data,
    { payload: { nested: 42 }, tags: ['alpha', 'beta'] },
    'synthetic sample should be captured in samples list',
  );

  console.log('metadataAdapter normalizes connector schemas and samples correctly.');
  process.exit(0);
} catch (error) {
  console.error(error);
  process.exit(1);
}
