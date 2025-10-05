import assert from 'node:assert/strict';
import express from 'express';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

const originalNodeEnv = process.env.NODE_ENV;
const originalDatabaseUrl = process.env.DATABASE_URL;
process.env.NODE_ENV = 'development';
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/automation_test';
}

const app = express();
app.use(express.json());

const { registerRoutes } = await import('../../routes.ts');
const { webhookManager } = await import('../../webhooks/WebhookManager.js');

const originalHandleWebhook = webhookManager.handleWebhook;

const calls: Array<{
  webhookId: string;
  payload: any;
  headers: Record<string, string>;
  rawBody?: string;
}> = [];

(webhookManager as any).handleWebhook = async function stubHandleWebhook(
  webhookId: string,
  payload: any,
  headers: Record<string, string>,
  rawBody?: string,
): Promise<boolean> {
  calls.push({ webhookId, payload, headers, rawBody });
  return true;
};

let server: Server | undefined;
let exitCode = 0;

try {
  await registerRoutes(app);
  server = createServer(app);
  await new Promise<void>((resolve) => server!.listen(0, resolve));
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const genericPayload = { source: 'generic', attempt: 1 };
  const stripePayload = { source: 'stripe', attempt: 2 };
  const githubPayload = { source: 'github', action: 'opened' };

  const genericResponse = await fetch(`${baseUrl}/api/webhooks/wh_generic`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'stripe-signature': 't=1700000000,v1=dummy',
    },
    body: JSON.stringify(genericPayload),
  });

  assert.equal(genericResponse.status, 200, 'generic webhook endpoint should return 200');
  const genericBody = await genericResponse.json();
  assert.equal(genericBody.success, true, 'generic webhook endpoint should report success');

  const stripeResponse = await fetch(`${baseUrl}/api/webhooks/stripe/wh_stripe`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'stripe-signature': 't=1700000000,v1=stripe',
    },
    body: JSON.stringify(stripePayload),
  });

  assert.equal(stripeResponse.status, 200, 'stripe webhook endpoint should return 200');
  const stripeText = await stripeResponse.text();
  assert.equal(stripeText, 'OK', 'stripe webhook endpoint should acknowledge receipt');

  const githubResponse = await fetch(`${baseUrl}/api/webhooks/github/wh_github`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hub-signature-256': 'sha256=dummy',
    },
    body: JSON.stringify(githubPayload),
  });

  assert.equal(githubResponse.status, 200, 'github webhook endpoint should return 200');
  const githubText = await githubResponse.text();
  assert.equal(githubText, 'OK', 'github webhook endpoint should acknowledge receipt');

  assert.equal(calls.length, 3, 'each webhook endpoint should forward to the manager');

  const [genericCall, stripeCall, githubCall] = calls;

  assert.equal(genericCall.webhookId, 'wh_generic');
  assert.equal(stripeCall.webhookId, 'wh_stripe');
  assert.equal(githubCall.webhookId, 'wh_github');

  for (const [call, payload] of [
    [genericCall, genericPayload],
    [stripeCall, stripePayload],
    [githubCall, githubPayload],
  ] as const) {
    assert.equal(typeof call.rawBody, 'string', 'raw body should be forwarded for signature verification');
    assert.deepEqual(JSON.parse(call.rawBody!), payload, 'raw body should encode the original payload');
  }

  console.log('Webhook routes forward raw bodies for signature verification across generic and vendor-specific endpoints.');
} catch (error) {
  exitCode = 1;
  console.error(error);
} finally {
  if (server) {
    await new Promise<void>((resolve, reject) => server!.close((err) => (err ? reject(err) : resolve())));
  }
  (webhookManager as any).handleWebhook = originalHandleWebhook;
  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = originalDatabaseUrl;
  }
  process.env.NODE_ENV = originalNodeEnv;
  process.exit(exitCode);
}
