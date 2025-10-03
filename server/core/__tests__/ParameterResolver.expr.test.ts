import assert from 'node:assert/strict';

import { resolveParamValue } from '../ParameterResolver.js';

const context = {
  nodeOutputs: {
    trigger1: {
      value: 21,
      email: {
        subject: 'hello world',
      },
    },
    transform1: {
      score: 0.92,
    },
  },
  currentNodeId: 'transform1',
  workflowId: 'workflow-123',
  executionId: 'execution-456',
  userId: 'user-789',
};

const main = async () => {
  const mathResult = await resolveParamValue(
    { mode: 'expr', expression: 'nodeOutputs.trigger1.value * 2' },
    context as any
  );
  assert.equal(mathResult, 42);

  const stringResult = await resolveParamValue(
    {
      mode: 'expr',
      expression: 'string.toUpperCase(nodeOutputs.trigger1.email.subject)',
    },
    context as any
  );
  assert.equal(stringResult, 'HELLO WORLD');

  const varsResult = await resolveParamValue(
    {
      mode: 'expr',
      expression: 'bonus + nodeOutputs.trigger1.value',
      vars: { bonus: 9 },
    },
    context as any
  );
  assert.equal(varsResult, 30);

  const fallbackResult = await resolveParamValue(
    {
      mode: 'expr',
      expression: 'nodeOutputs.trigger1.value + ',
      fallback: 'expression-fallback',
    },
    context as any
  );
  assert.equal(fallbackResult, 'expression-fallback');

  console.log('Expression parameter resolution scenarios completed successfully.');
};

await main();
