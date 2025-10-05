import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

process.env.DATABASE_URL ||= 'postgresql://user:pass@localhost:5432/test';

const { webhookManager } = await import('../../webhooks/WebhookManager.js');
const { registerRoutes } = await import('../../routes.ts');

const app = express();
app.use(express.json({
  verify: (req, _res, buf) => {
    (req as any).rawBody = buf.toString('utf8');
  },
}));

await registerRoutes(app);

const server: Server = await new Promise((resolve) => {
  const listener = app.listen(0, () => resolve(listener));
});
server.unref();

try {
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const originalHandleWebhook = webhookManager.handleWebhook;
  const calls: Array<{
    webhookId: string;
    payload: any;
    headers: Record<string, string>;
    rawBody?: string;
  }> = [];

  (webhookManager as any).handleWebhook = async (
    webhookId: string,
    payload: any,
    headers: Record<string, string>,
    rawBody?: string,
  ) => {
    calls.push({ webhookId, payload, headers, rawBody });
    return true;
  };

  try {
    const stripeSecret = 'whsec_test';
    const stripePayload = { id: 'evt_123', type: 'payment_intent.succeeded' };
    const stripeRawBody = JSON.stringify(stripePayload);
    const stripeTimestamp = Math.floor(Date.now() / 1000).toString();
    const stripeSignature = crypto
      .createHmac('sha256', stripeSecret)
      .update(`${stripeTimestamp}.${stripeRawBody}`)
      .digest('hex');

    const stripeResponse = await fetch(`${baseUrl}/api/webhooks/stripe/stripe-hook`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': `t=${stripeTimestamp},v1=${stripeSignature}`,
      },
      body: stripeRawBody,
    });
    assert.equal(stripeResponse.status, 200, 'stripe webhook should return 200');

    const githubSecret = 'ghs_test';
    const githubPayload = { action: 'opened', repository: { full_name: 'acme/repo' } };
    const githubRawBody = JSON.stringify(githubPayload);
    const githubSignature = crypto
      .createHmac('sha256', githubSecret)
      .update(githubRawBody)
      .digest('hex');

    const githubResponse = await fetch(`${baseUrl}/api/webhooks/github/github-hook`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': `sha256=${githubSignature}`,
      },
      body: githubRawBody,
    });
    assert.equal(githubResponse.status, 200, 'github webhook should return 200');

    assert.equal(calls.length, 2, 'webhook manager should receive two calls');
    const [stripeCall, githubCall] = calls;

    assert.equal(stripeCall.webhookId, 'stripe-hook', 'stripe webhook id should forward correctly');
    assert.deepEqual(stripeCall.payload, stripePayload, 'stripe payload should parse to object');
    assert.equal(stripeCall.rawBody, stripeRawBody, 'stripe raw body should be forwarded');
    assert.equal(
      stripeCall.headers['stripe-signature'],
      `t=${stripeTimestamp},v1=${stripeSignature}`,
      'stripe signature header should be forwarded',
    );

    assert.equal(githubCall.webhookId, 'github-hook', 'github webhook id should forward correctly');
    assert.deepEqual(githubCall.payload, githubPayload, 'github payload should parse to object');
    assert.equal(githubCall.rawBody, githubRawBody, 'github raw body should be forwarded');
    assert.equal(
      githubCall.headers['x-hub-signature-256'],
      `sha256=${githubSignature}`,
      'github signature header should be forwarded',
    );
  } finally {
    (webhookManager as any).handleWebhook = originalHandleWebhook;
  }
} finally {
  server.close();
}

console.log('Webhook signature integration test passed.');
process.exit(0);
