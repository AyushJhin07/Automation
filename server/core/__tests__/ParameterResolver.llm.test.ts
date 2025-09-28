import assert from 'node:assert/strict';

import { resolveAllParams } from '../ParameterResolver.js';
import { registerLLMProviders, llmRegistry } from '../../llm/index.js';

const originalEnv = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  CLAUDE_API_KEY: process.env.CLAUDE_API_KEY,
  LLM_PROVIDER: process.env.LLM_PROVIDER,
};

const originalFetch = globalThis.fetch;

function clearRegistry() {
  const providers: Map<string, any> | undefined = (llmRegistry as any).providers;
  if (providers) {
    providers.clear();
  }
}

async function runGeminiScenario() {
  clearRegistry();
  process.env.GEMINI_API_KEY = 'test-gemini-key';
  delete process.env.OPENAI_API_KEY;
  delete process.env.CLAUDE_API_KEY;
  process.env.LLM_PROVIDER = '';

  globalThis.fetch = async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (!url.includes('generativelanguage.googleapis.com')) {
      throw new Error(`Unexpected fetch call for Gemini test: ${url}`);
    }

    const body = {
      candidates: [
        {
          content: {
            parts: [
              { text: 'Gemini says hi' },
            ],
          },
        },
      ],
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 5,
        totalTokenCount: 15,
      },
    };

    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  registerLLMProviders();

  const params = {
    summary: {
      mode: 'llm',
      provider: 'google',
      model: 'google:gemini-1.5-flash',
      prompt: 'Say hello',
    },
  } as const;

  const context = {
    nodeOutputs: {},
    currentNodeId: 'node-1',
    workflowId: 'workflow-1',
    executionId: 'exec-1',
  };

  const resolved = await resolveAllParams(params as any, context as any);

  assert.equal(resolved.summary, 'Gemini says hi');
  console.log('✅ resolveAllParams returns Gemini data when only GEMINI_API_KEY is set.');
}

async function runClaudeScenario() {
  clearRegistry();
  delete process.env.GEMINI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  process.env.CLAUDE_API_KEY = 'test-claude-key';
  process.env.LLM_PROVIDER = '';

  globalThis.fetch = async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (!url.includes('api.anthropic.com')) {
      throw new Error(`Unexpected fetch call for Claude test: ${url}`);
    }

    const body = {
      content: [
        { text: 'Claude says hi' },
      ],
      usage: {
        input_tokens: 20,
        output_tokens: 7,
      },
    };

    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  registerLLMProviders();

  const params = {
    summary: {
      mode: 'llm',
      provider: 'anthropic',
      model: 'anthropic:claude-3-5-sonnet',
      prompt: 'Say hello',
    },
  } as const;

  const context = {
    nodeOutputs: {},
    currentNodeId: 'node-1',
    workflowId: 'workflow-1',
    executionId: 'exec-1',
  };

  const resolved = await resolveAllParams(params as any, context as any);

  assert.equal(resolved.summary, 'Claude says hi');
  console.log('✅ resolveAllParams returns Claude data when only CLAUDE_API_KEY is set.');
}

try {
  await runGeminiScenario();
  await runClaudeScenario();
  console.log('ParameterResolver LLM integration scenarios completed successfully.');
} finally {
  clearRegistry();
  globalThis.fetch = originalFetch;
  process.env.GEMINI_API_KEY = originalEnv.GEMINI_API_KEY;
  process.env.OPENAI_API_KEY = originalEnv.OPENAI_API_KEY;
  process.env.CLAUDE_API_KEY = originalEnv.CLAUDE_API_KEY;
  process.env.LLM_PROVIDER = originalEnv.LLM_PROVIDER;
}
