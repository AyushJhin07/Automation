import assert from 'node:assert/strict';

import { resolveAllParams } from '../ParameterResolver.js';
import { registerLLMProviders, llmRegistry } from '../../llm/index.js';

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;

const context = {
  nodeOutputs: {},
  currentNodeId: 'node-1',
  workflowId: 'workflow-1',
  executionId: 'run-1',
};

function resetEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      delete process.env[key];
    }
  }

  Object.assign(process.env, originalEnv);
}

async function runScenario({
  name,
  env,
  provider,
  model,
  expected,
  fetchResponse,
}: {
  name: string;
  env: Record<string, string | undefined>;
  provider: 'google' | 'anthropic';
  model: string;
  expected: string;
  fetchResponse: any;
}) {
  console.log(`Running LLM parameter resolution scenario: ${name}`);
  llmRegistry.clear();

  for (const key of ['GEMINI_API_KEY', 'OPENAI_API_KEY', 'CLAUDE_API_KEY', 'LLM_PROVIDER']) {
    delete process.env[key];
  }

  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) {
      process.env[key] = value;
    }
  }

  const expectedUrl = provider === 'google'
    ? 'generativelanguage.googleapis.com'
    : 'api.anthropic.com';

  globalThis.fetch = async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    assert.ok(url.includes(expectedUrl), `Unexpected fetch URL: ${url}`);
    assert.ok(init?.body, 'Expected request body');

    return new Response(JSON.stringify(fetchResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  registerLLMProviders();

  const params = {
    answer: {
      mode: 'llm' as const,
      provider,
      model,
      prompt: 'Say hello',
    }
  };

  const resolved = await resolveAllParams(params, context as any);

  assert.equal(resolved.answer, expected, `${name} should resolve to non-null data`);
}

try {
  await runScenario({
    name: 'Gemini',
    env: {
      GEMINI_API_KEY: 'test-gemini',
      LLM_PROVIDER: 'gemini',
    },
    provider: 'google',
    model: 'google:gemini-1.5-flash',
    expected: 'Gemini says hello',
    fetchResponse: {
      candidates: [
        {
          content: {
            parts: [{ text: 'Gemini says hello' }]
          }
        }
      ]
    }
  });

  await runScenario({
    name: 'Claude',
    env: {
      CLAUDE_API_KEY: 'test-claude',
      LLM_PROVIDER: 'claude',
    },
    provider: 'anthropic',
    model: 'anthropic:claude-3-haiku',
    expected: 'Claude says hello',
    fetchResponse: {
      content: [{ text: 'Claude says hello' }]
    }
  });

  llmRegistry.clear();
  delete process.env.GEMINI_API_KEY;
  delete process.env.CLAUDE_API_KEY;
  delete process.env.OPENAI_API_KEY;

  const params = {
    answer: {
      mode: 'llm' as const,
      provider: 'google' as const,
      model: 'google:gemini-1.5-flash',
      prompt: 'Say hello',
    }
  };

  globalThis.fetch = originalFetch;

  const unresolved = await resolveAllParams(params, context as any);
  assert.ok(
    typeof unresolved.answer === 'string' && unresolved.answer.includes('not registered'),
    'Missing adapter should return descriptive message'
  );

  console.log('ParameterResolver.llm tests passed.');
} finally {
  resetEnv();
  llmRegistry.clear();
  globalThis.fetch = originalFetch;
}
