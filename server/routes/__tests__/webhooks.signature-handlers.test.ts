import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

process.env.DATABASE_URL ||= 'postgresql://user:pass@localhost:5432/test';

const { webhookManager } = await import('../../webhooks/WebhookManager.js');
const { registerRoutes } = await import('../../routes.ts');

const app = express();

const jsonParser = express.json();
const urlencodedParser = express.urlencoded({ extended: false });

const shouldBypassStandardBodyParsers = (req: express.Request): boolean => {
  return req.path.startsWith('/api/webhooks');
};

app.use((req, res, next) => {
  if (shouldBypassStandardBodyParsers(req)) {
    return next();
  }
  return jsonParser(req, res, next);
});

app.use((req, res, next) => {
  if (shouldBypassStandardBodyParsers(req)) {
    return next();
  }
  return urlencodedParser(req, res, next);
});

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
    rawBody?: string | Buffer;
  }> = [];

  (webhookManager as any).handleWebhook = async (
    webhookId: string,
    payload: any,
    headers: Record<string, string>,
    rawBody?: string | Buffer,
  ) => {
    calls.push({ webhookId, payload, headers, rawBody });
    if (rawBody instanceof Buffer) {
      const bodyString = rawBody.toString('utf8');
      if (webhookId === 'stripe-hook') {
        const secret = 'whsec_test';
        const signatureHeader = headers['stripe-signature'] ?? '';
        const [timestampPart, signaturePart] = signatureHeader.split(',');
        const timestamp = timestampPart?.split('=')[1] ?? '';
        const providedSignature = signaturePart?.split('=')[1] ?? '';
        const expectedSignature = crypto
          .createHmac('sha256', secret)
          .update(`${timestamp}.${bodyString}`)
          .digest('hex');
        assert.equal(providedSignature, expectedSignature, 'stripe signature should validate with raw body');
      }

      if (webhookId === 'slack-hook') {
        const secret = 'slack_secret';
        const timestamp = headers['x-slack-request-timestamp'] ?? '';
        const baseString = `v0:${timestamp}:${bodyString}`;
        const expectedSignature =
          'v0=' + crypto.createHmac('sha256', secret).update(baseString).digest('hex');
        assert.equal(
          headers['x-slack-signature'],
          expectedSignature,
          'slack signature should validate with raw body',
        );
      }
    } else if (rawBody) {
      assert.fail('raw body should be provided as a Buffer for webhook requests');
    }

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

    const slackSecret = 'slack_secret';
    const slackPayload = { type: 'event_callback', event: { text: 'hello world' } };
    const slackRawBody = JSON.stringify(slackPayload);
    const slackTimestamp = Math.floor(Date.now() / 1000).toString();
    const slackSignature =
      'v0=' + crypto.createHmac('sha256', slackSecret).update(`v0:${slackTimestamp}:${slackRawBody}`).digest('hex');

    const slackResponse = await fetch(`${baseUrl}/api/webhooks/slack/slack-hook`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-slack-signature': slackSignature,
        'x-slack-request-timestamp': slackTimestamp,
      },
      body: slackRawBody,
    });
    assert.equal(slackResponse.status, 200, 'slack webhook should return 200');

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

    assert.equal(calls.length, 3, 'webhook manager should receive three calls');
    const [stripeCall, slackCall, githubCall] = calls;

    assert.equal(stripeCall.webhookId, 'stripe-hook', 'stripe webhook id should forward correctly');
    assert.deepEqual(stripeCall.payload, stripePayload, 'stripe payload should parse to object');
    assert.ok(Buffer.isBuffer(stripeCall.rawBody), 'stripe raw body should be forwarded as a buffer');
    assert.equal(stripeCall.rawBody?.toString('utf8'), stripeRawBody, 'stripe raw body should match payload');
    assert.equal(
      stripeCall.headers['stripe-signature'],
      `t=${stripeTimestamp},v1=${stripeSignature}`,
      'stripe signature header should be forwarded',
    );

    assert.equal(slackCall.webhookId, 'slack-hook', 'slack webhook id should forward correctly');
    assert.deepEqual(slackCall.payload, slackPayload, 'slack payload should parse to object');
    assert.ok(Buffer.isBuffer(slackCall.rawBody), 'slack raw body should be forwarded as a buffer');
    assert.equal(slackCall.rawBody?.toString('utf8'), slackRawBody, 'slack raw body should match payload');
    assert.equal(
      slackCall.headers['x-slack-signature'],
      slackSignature,
      'slack signature header should be forwarded',
    );

    assert.equal(githubCall.webhookId, 'github-hook', 'github webhook id should forward correctly');
    assert.deepEqual(githubCall.payload, githubPayload, 'github payload should parse to object');
    assert.ok(Buffer.isBuffer(githubCall.rawBody), 'github raw body should be forwarded as a buffer');
    assert.equal(githubCall.rawBody?.toString('utf8'), githubRawBody, 'github raw body should match payload');
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
