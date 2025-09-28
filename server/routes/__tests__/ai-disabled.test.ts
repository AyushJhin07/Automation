import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import aiRouter from '../ai.js';

const originalEnv = {
  openai: process.env.OPENAI_API_KEY,
  gemini: process.env.GEMINI_API_KEY,
  claude: process.env.CLAUDE_API_KEY,
};

delete process.env.OPENAI_API_KEY;
delete process.env.GEMINI_API_KEY;
delete process.env.CLAUDE_API_KEY;

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
  const modelsBody = await modelsResponse.json();

  assert.equal(modelsBody.success, true, 'models endpoint should report success');
  assert.equal(modelsBody.aiAvailable, false, 'aiAvailable should be false when no providers are configured');
  assert.deepEqual(modelsBody.models, [], 'models list should be empty when providers are unavailable');

  const mapResponse = await fetch(`${baseUrl}/api/ai/map-params`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      parameter: { name: 'email', schema: {}, description: 'Recipient email' },
      upstream: [
        {
          nodeId: 'node-1',
          label: 'Source Node',
          columns: ['email'],
          sample: { email: 'example@example.com' }
        }
      ],
      instruction: 'Map to email column'
    })
  });

  assert.equal(mapResponse.status, 503, 'map-params should respond with 503 when providers are unavailable');
  const mapBody = await mapResponse.json();
  assert.equal(mapBody.success, false, 'map-params should report failure');
  assert.equal(mapBody.code, 'ai_mapping_disabled', 'map-params should include a capability error code');
} finally {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });

  if (originalEnv.openai) {
    process.env.OPENAI_API_KEY = originalEnv.openai;
  } else {
    delete process.env.OPENAI_API_KEY;
  }

  if (originalEnv.gemini) {
    process.env.GEMINI_API_KEY = originalEnv.gemini;
  } else {
    delete process.env.GEMINI_API_KEY;
  }

  if (originalEnv.claude) {
    process.env.CLAUDE_API_KEY = originalEnv.claude;
  } else {
    delete process.env.CLAUDE_API_KEY;
  }
}
