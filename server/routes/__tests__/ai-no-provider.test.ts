import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import aiRouter from '../ai.js';

const originalEnv = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  CLAUDE_API_KEY: process.env.CLAUDE_API_KEY,
  LLM_PROVIDER: process.env.LLM_PROVIDER
};

delete process.env.GEMINI_API_KEY;
delete process.env.OPENAI_API_KEY;
delete process.env.CLAUDE_API_KEY;
delete process.env.LLM_PROVIDER;

const app = express();
app.use(express.json());
app.use('/api/ai', aiRouter);

const server: Server = await new Promise((resolve) => {
  const listener = app.listen(0, () => resolve(listener));
});

try {
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const modelsResponse = await fetch(`${baseUrl}/api/ai/models`);
  assert.equal(modelsResponse.status, 200, 'models endpoint should respond with 200');
  const modelsJson = await modelsResponse.json();
  assert.equal(modelsJson.success, true, 'models endpoint should return success flag');
  assert.equal(modelsJson.llmAvailable, false, 'llmAvailable should be false when no providers configured');
  assert.ok(Array.isArray(modelsJson.models) && modelsJson.models.length === 0, 'no models should be advertised without providers');

  const mapParamsResponse = await fetch(`${baseUrl}/api/ai/map-params`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      parameter: {
        name: 'subject',
        schema: { type: 'string' }
      },
      upstream: [
        {
          nodeId: 'upstream-1',
          label: 'Source Node',
          app: 'demo',
          columns: ['subject'],
          sample: { subject: 'Example' },
          schema: { subject: { type: 'string' } }
        }
      ]
    })
  });

  assert.equal(mapParamsResponse.status, 503, 'map-params should return 503 when AI is disabled');
  const mapParamsJson = await mapParamsResponse.json();
  assert.equal(mapParamsJson.code, 'no_llm_providers', 'map-params should emit no_llm_providers code');
  assert.match(
    mapParamsJson.error || '',
    /not available/i,
    'map-params should return a clear error message when AI is disabled'
  );

  console.log('AI routes respond with graceful errors when no providers are configured.');
} finally {
  server.close();

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
