import assert from 'node:assert/strict';

import { resolveParamValue } from '../ParameterResolver.js';
import { expressionEvaluator } from '../ExpressionEvaluator.js';

const context = {
  nodeOutputs: {
    trigger: {
      opportunity: {
        id: 'OPP-001',
        amount: 5000,
        owner: { name: 'Alice Johnson', email: 'alice@example.com' },
      },
      metadata: {
        receivedAt: '2024-05-20T12:30:00.000Z',
      },
    },
    salesforceOpportunity: {
      id: 'OPP-001',
      stage: 'Prospecting',
      amount: 5000,
      probability: 0.45,
    },
    enrichment: {
      multiplier: 1.2,
      recommendations: [
        { product: 'Premium Support', score: 0.92 },
        { product: 'Analytics Add-on', score: 0.81 },
      ],
    },
    listStep: [
      { id: 'one', active: true },
      { id: 'two', active: false },
      { id: 'three', active: true },
    ],
    slackNotify: {
      channel: '#sales',
      ts: '1727548200.000200',
      message: 'New opportunity created for Alice Johnson',
    },
  },
  currentNodeId: 'slackNotify',
  workflowId: 'workflow-123',
  executionId: 'execution-456',
  userId: 'user-789',
  variables: {
    region: 'EMEA',
    threshold: 0.85,
  },
  trigger: {
    opportunity: {
      id: 'OPP-001',
      amount: 5000,
      owner: { name: 'Alice Johnson', email: 'alice@example.com' },
    },
  },
};

const main = async () => {
  const recommendationNames = await resolveParamValue(
    { mode: 'ref', nodeId: 'enrichment', path: 'recommendations[score > 0.8].product' },
    context as any
  );
  assert.deepEqual(recommendationNames, ['Premium Support', 'Analytics Add-on']);

  const topRecommendation = await resolveParamValue(
    { mode: 'ref', nodeId: 'enrichment', path: 'recommendations[score > 0.9].product' },
    context as any
  );
  assert.deepEqual(topRecommendation, ['Premium Support']);

  const firstListEntry = await resolveParamValue(
    { mode: 'ref', nodeId: 'listStep', path: '[0]' },
    context as any
  );
  assert.equal(firstListEntry?.id, 'one');
  assert.equal(firstListEntry?.active, true);

  const activeListIds = await resolveParamValue(
    { mode: 'ref', nodeId: 'listStep', path: '[active == true].id' },
    context as any
  );
  assert.deepEqual(activeListIds, ['one', 'three']);

  const triggerTimestamp = await resolveParamValue(
    { mode: 'ref', nodeId: 'trigger', path: 'metadata["receivedAt"]' },
    context as any
  );
  assert.equal(triggerTimestamp, '2024-05-20T12:30:00.000Z');

  const invalidReference = await resolveParamValue(
    { mode: 'ref', nodeId: 'enrichment', path: 'recommendations[' },
    context as any
  );
  assert.equal(invalidReference, undefined);

  const filteredProducts = await resolveParamValue(
    { mode: 'expr', expression: 'steps.enrichment.recommendations[score > 0.9].product' },
    context as any
  );
  assert.deepEqual(filteredProducts, ['Premium Support']);

  const triggerEmail = await resolveParamValue(
    {
      mode: 'expr',
      expression: '$uppercase(trigger.opportunity.owner.email)',
    },
    context as any
  );
  assert.equal(triggerEmail, 'ALICE@EXAMPLE.COM');

  const multipliedAmount = await resolveParamValue(
    {
      mode: 'expr',
      expression: 'steps.salesforceOpportunity.amount * steps.enrichment.multiplier',
    },
    context as any
  );
  assert.equal(multipliedAmount, 6000);

  const contextVariable = await resolveParamValue(
    {
      mode: 'expr',
      expression: 'region',
    },
    context as any
  );
  assert.equal(contextVariable, 'EMEA');

  const fallbackResult = await resolveParamValue(
    {
      mode: 'expr',
      expression: 'steps.salesforceOpportunity.amount + ',
      fallback: 'expression-fallback',
    },
    context as any
  );
  assert.equal(fallbackResult, 'expression-fallback');

  const schemaEvaluation = expressionEvaluator.evaluateDetailed(
    'steps.salesforceOpportunity',
    context as any
  );
  assert.equal(
    schemaEvaluation.contextSchema?.properties?.steps?.properties?.salesforceOpportunity?.type,
    'object'
  );

  const invalidSchemaResult = expressionEvaluator.evaluateDetailed(
    'steps.slackNotify.ts',
    context as any,
    { expectedResultSchema: { type: 'number' } }
  );
  assert.equal(invalidSchemaResult.valid, false);
  assert(invalidSchemaResult.diagnostics.length > 0);

  const validSchemaResult = expressionEvaluator.evaluateDetailed(
    'steps.salesforceOpportunity.probability',
    context as any,
    { expectedResultSchema: { type: 'number' } }
  );
  assert.equal(validSchemaResult.valid, true);
  assert.equal(validSchemaResult.diagnostics.length, 0);

  console.log('Expression parameter resolution scenarios completed successfully.');
};

await main();
