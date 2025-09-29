import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

const originalNodeEnv = process.env.NODE_ENV;
const originalBaseUrl = process.env.BASE_URL;

const envKeys = [
  'GMAIL_CLIENT_ID',
  'GMAIL_CLIENT_SECRET',
  'SLACK_CLIENT_ID',
  'SLACK_CLIENT_SECRET',
  'NOTION_CLIENT_ID',
  'NOTION_CLIENT_SECRET',
];

const originalEnv: Record<string, string | undefined> = {};
for (const key of envKeys) {
  originalEnv[key] = process.env[key];
}

process.env.NODE_ENV = 'development';
process.env.BASE_URL = 'http://localhost:5000';
process.env.GMAIL_CLIENT_ID = 'test-gmail-client-id';
process.env.GMAIL_CLIENT_SECRET = 'test-gmail-client-secret';
process.env.SLACK_CLIENT_ID = 'test-slack-client-id';
process.env.SLACK_CLIENT_SECRET = 'test-slack-client-secret';
process.env.NOTION_CLIENT_ID = 'test-notion-client-id';
process.env.NOTION_CLIENT_SECRET = 'test-notion-client-secret';

const originalFetch = globalThis.fetch;

const tokenResponse = {
  access_token: 'test-access-token',
  refresh_token: 'test-refresh-token',
  expires_in: 3600,
  token_type: 'Bearer',
  scope: 'https://www.googleapis.com/auth/gmail.modify',
};

const userInfoResponse = {
  id: 'user-123',
  email: 'test-user@example.com',
  name: 'Test Gmail User',
};

(globalThis as any).fetch = async (input: RequestInfo, init?: RequestInit) => {
  const url = typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url;

  if (url.includes('oauth2.googleapis.com/token')) {
    return new Response(JSON.stringify(tokenResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (url.includes('www.googleapis.com/oauth2/v2/userinfo')) {
    return new Response(JSON.stringify(userInfoResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return originalFetch(input as any, init);
};

const app = express();
app.use(express.json());
(globalThis as any).app = app;

let server: Server | undefined;
let exitCode = 0;

const storedConnections: Array<{ userId: string; provider: string; tokens: any; userInfo?: any }> = [];
let connectionService: any;
let originalStoreConnection: ((...args: any[]) => any) | undefined;

try {
  const { registerRoutes } = await import('../../routes.ts');
  ({ connectionService } = await import('../../services/ConnectionService'));

  originalStoreConnection = connectionService.storeConnection;

  (connectionService as any).storeConnection = async (
    userId: string,
    provider: string,
    tokens: any,
    userInfo?: any
  ) => {
    storedConnections.push({ userId, provider, tokens, userInfo });
    return 'test-connection-id';
  };

  server = await registerRoutes(app);

  await new Promise<void>((resolve) => {
    server!.listen(0, () => resolve());
  });

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const authResponse = await fetch(`${baseUrl}/api/oauth/authorize`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ provider: 'gmail' })
  });

  const authBody = await authResponse.json();

  assert.equal(authResponse.status, 200, `authorize endpoint should respond with success (${JSON.stringify(authBody)})`);
  assert.equal(authBody.success, true, 'authorize response should indicate success');
  assert.equal(authBody.data.provider, 'gmail', 'authorize response should echo provider');
  assert.ok(authBody.data.state, 'authorize response should include a state token');
  assert.ok(typeof authBody.data.authUrl === 'string' && authBody.data.authUrl.includes('accounts.google.com'), 'auth URL should point to Google accounts');

  const state = authBody.data.state as string;

  const callbackResponse = await fetch(`${baseUrl}/api/oauth/callback/gmail?code=test-code&state=${state}`);
  assert.equal(callbackResponse.status, 200, 'callback should respond with success');

  const callbackBody = await callbackResponse.json();
  assert.equal(callbackBody.success, true, 'callback response should indicate success');
  assert.equal(callbackBody.data.provider, 'gmail', 'callback response should include provider');
  assert.equal(callbackBody.data.tokens.accessToken, 'test-access-token', 'callback should return exchanged access token');
  assert.equal(callbackBody.data.userInfo.email, userInfoResponse.email, 'callback should return user info');

  assert.equal(storedConnections.length, 1, 'ConnectionService.storeConnection should be called once');
  const stored = storedConnections[0];
  assert.equal(stored.provider, 'gmail', 'stored connection should reference the Gmail provider');
  assert.equal(stored.userId, 'dev-user', 'stored connection should use the development fallback user');
  assert.equal(stored.tokens.accessToken, tokenResponse.access_token, 'stored connection should include access token');
  assert.equal(stored.userInfo.email, userInfoResponse.email, 'stored connection should include user info');
  assert.ok(typeof stored.tokens.expiresAt === 'number', 'stored token should include expiry metadata');

  console.log('OAuth authorize + callback endpoints exchange tokens and persist connections.');
} catch (error) {
  exitCode = 1;
  console.error(error);
} finally {
  if (connectionService && originalStoreConnection) {
    (connectionService as any).storeConnection = originalStoreConnection;
  }

  delete (globalThis as any).app;

  if (server) {
    await new Promise<void>((resolve, reject) => {
      server!.close((err) => (err ? reject(err) : resolve()));
    });
  }

  (globalThis as any).fetch = originalFetch;

  if (originalNodeEnv !== undefined) {
    process.env.NODE_ENV = originalNodeEnv;
  } else {
    delete process.env.NODE_ENV;
  }

  if (originalBaseUrl !== undefined) {
    process.env.BASE_URL = originalBaseUrl;
  } else {
    delete process.env.BASE_URL;
  }

  for (const key of envKeys) {
    const value = originalEnv[key];
    if (value !== undefined) {
      process.env[key] = value;
    } else {
      delete process.env[key];
    }
  }

  process.exit(exitCode);
}
