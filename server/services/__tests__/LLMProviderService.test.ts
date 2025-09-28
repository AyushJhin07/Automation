import assert from 'node:assert/strict';

import { LLMProviderService, NoLLMProvidersAvailableError } from '../LLMProviderService.js';

const originalEnv = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  CLAUDE_API_KEY: process.env.CLAUDE_API_KEY,
  LLM_PROVIDER: process.env.LLM_PROVIDER
};

try {
  delete process.env.GEMINI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.CLAUDE_API_KEY;
  delete process.env.LLM_PROVIDER;

  const provider = LLMProviderService.selectProvider();
  assert.equal(provider, null, 'selectProvider should return null when no providers are configured');

  await assert.rejects(
    () => LLMProviderService.generateText('Hello world'),
    (error: any) => {
      assert.ok(error instanceof NoLLMProvidersAvailableError, 'should throw NoLLMProvidersAvailableError');
      assert.equal(error.message, 'No LLM providers are configured');
      return true;
    },
    'generateText should reject when no providers are available'
  );

  const status = LLMProviderService.getProviderStatus();
  assert.equal(status.selected, null, 'status.selected should be null when no providers configured');
  assert.equal(status.configured, false, 'status.configured should be false when no providers configured');
  assert.deepEqual(status.available, [], 'no providers should be reported as available');

  console.log('LLMProviderService no-provider safeguards verified.');
} finally {
  if (originalEnv.GEMINI_API_KEY != null) {
    process.env.GEMINI_API_KEY = originalEnv.GEMINI_API_KEY;
  } else {
    delete process.env.GEMINI_API_KEY;
  }

  if (originalEnv.OPENAI_API_KEY != null) {
    process.env.OPENAI_API_KEY = originalEnv.OPENAI_API_KEY;
  } else {
    delete process.env.OPENAI_API_KEY;
  }

  if (originalEnv.CLAUDE_API_KEY != null) {
    process.env.CLAUDE_API_KEY = originalEnv.CLAUDE_API_KEY;
  } else {
    delete process.env.CLAUDE_API_KEY;
  }

  if (originalEnv.LLM_PROVIDER != null) {
    process.env.LLM_PROVIDER = originalEnv.LLM_PROVIDER;
  } else {
    delete process.env.LLM_PROVIDER;
  }
}
