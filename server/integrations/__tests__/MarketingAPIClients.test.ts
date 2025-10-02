import assert from 'node:assert/strict';

import { MarketoAPIClient } from '../MarketoAPIClient.js';
import { PardotAPIClient } from '../PardotAPIClient.js';
import { IterableAPIClient } from '../IterableAPIClient.js';
import { KlaviyoAPIClient } from '../KlaviyoAPIClient.js';

interface RecordedRequest {
  url: string;
  method: string;
  headers: any;
  body?: string;
}

type FetchHandler = (input: any, init?: any) => Promise<Response>;

function captureRequest(input: any, init?: any): RecordedRequest {
  let url: string;
  if (typeof input === 'string') {
    url = input;
  } else if (input instanceof URL) {
    url = input.toString();
  } else {
    url = (input as Request).url;
  }

  const method = (init?.method || (input instanceof Request ? input.method : 'GET') || 'GET').toUpperCase();
  const headers = init?.headers || (input instanceof Request ? input.headers : undefined);
  const body = typeof init?.body === 'string' ? init.body : undefined;

  return { url, method, headers, body };
}

function headerValue(headers: any, key: string): string | undefined {
  if (!headers) return undefined;
  const target = key.toLowerCase();
  if (headers instanceof Headers) {
    return headers.get(key) ?? headers.get(target) ?? undefined;
  }
  if (Array.isArray(headers)) {
    const match = headers.find(([k]) => k.toLowerCase() === target);
    return match ? match[1] : undefined;
  }
  const record = headers as Record<string, string>;
  for (const [k, value] of Object.entries(record)) {
    if (k.toLowerCase() === target) {
      return value;
    }
  }
  return undefined;
}

async function withMockedFetch(handler: FetchHandler, fn: () => Promise<void>): Promise<void> {
  const original = globalThis.fetch;
  globalThis.fetch = handler as typeof fetch;
  try {
    await fn();
  } finally {
    globalThis.fetch = original;
  }
}

async function testMarketoLeadSync(): Promise<void> {
  const requests: RecordedRequest[] = [];
  await withMockedFetch(async (input, init) => {
    const request = captureRequest(input, init);
    requests.push(request);

    if (request.url.includes('/identity/oauth/token')) {
      return new Response(JSON.stringify({ access_token: 'fresh-token', expires_in: 3600 }), { status: 200 });
    }

    if (request.url.endsWith('/rest/v1/leads.json') && request.method === 'POST') {
      return new Response(JSON.stringify({ result: [{ id: 101 }] }), { status: 200 });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  }, async () => {
    const client = new MarketoAPIClient({
      clientId: 'marketo-client-id',
      clientSecret: 'marketo-client-secret',
      munchkinId: '123-ABC-456',
    });

    const response = await client.execute('create_lead', {
      email: 'lead@example.com',
      firstName: 'Lead',
      lastName: 'Example',
    });

    assert.equal(response.success, true, 'Marketo create lead should succeed');
    const tokenRequest = requests.find(req => req.url.includes('/identity/oauth/token'));
    assert.ok(tokenRequest, 'Marketo client should request a token');
    const leadRequest = requests.find(req => req.url.endsWith('/rest/v1/leads.json') && req.method === 'POST');
    assert.ok(leadRequest, 'Lead creation request should be issued');
    assert.equal(headerValue(leadRequest?.headers, 'authorization'), 'Bearer fresh-token');
    const body = leadRequest?.body ? JSON.parse(leadRequest.body) : {};
    assert.equal(body.action, 'createOrUpdate');
    assert.equal(body.input?.[0]?.email, 'lead@example.com');
  });
}

async function testPardotLeadRefresh(): Promise<void> {
  const requests: RecordedRequest[] = [];
  let firstProspectAttempt = true;
  await withMockedFetch(async (input, init) => {
    const request = captureRequest(input, init);
    requests.push(request);

    if (request.url.endsWith('/services/oauth2/token')) {
      return new Response(
        JSON.stringify({ access_token: 'pardot-new-token', refresh_token: 'pardot-updated-refresh', expires_in: 600 }),
        { status: 200 }
      );
    }

    if (request.url.includes('/api/prospect/version/4/do/create/') && request.method === 'POST') {
      if (firstProspectAttempt) {
        firstProspectAttempt = false;
        return new Response(JSON.stringify({ message: 'expired' }), { status: 401 });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  }, async () => {
    const client = new PardotAPIClient({
      businessUnitId: '0Uv',
      clientId: 'pardot-client',
      clientSecret: 'pardot-secret',
      refreshToken: 'pardot-refresh',
      accessToken: 'expired-token',
    });

    const response = await client.execute('create_prospect', {
      email: 'prospect@example.com',
      first_name: 'Prospect',
    });

    assert.equal(response.success, true, 'Pardot create prospect should succeed after refresh');
    const tokenRequest = requests.find(req => req.url.endsWith('/services/oauth2/token'));
    assert.ok(tokenRequest, 'Refresh token endpoint should be called');
    const prospectCalls = requests.filter(req => req.url.includes('/api/prospect/version/4/do/create/'));
    assert.equal(prospectCalls.length >= 2, true, 'Prospect creation should retry after refresh');
    const finalCall = prospectCalls[prospectCalls.length - 1];
    assert.equal(headerValue(finalCall.headers, 'authorization'), 'Bearer pardot-new-token');
  });
}

async function testIterableSendEmail(): Promise<void> {
  const requests: RecordedRequest[] = [];
  await withMockedFetch(async (input, init) => {
    const request = captureRequest(input, init);
    requests.push(request);
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  }, async () => {
    const client = new IterableAPIClient({ apiKey: 'iterable-test-key' });
    const response = await client.execute('send_email', {
      campaignId: 42,
      recipientEmail: 'user@example.com',
      dataFields: { firstName: 'Ada' },
    });

    assert.equal(response.success, true, 'Iterable send_email should return success');
    const emailRequest = requests.find(req => req.url.endsWith('/email/target'));
    assert.ok(emailRequest, 'Iterable send_email should hit the /email/target endpoint');
    assert.equal(headerValue(emailRequest?.headers, 'api-key'), 'iterable-test-key');
    const payload = emailRequest?.body ? JSON.parse(emailRequest.body) : {};
    assert.equal(payload.campaignId, 42);
    assert.equal(payload.recipientEmail, 'user@example.com');
  });
}

async function testKlaviyoListRetrieval(): Promise<void> {
  const requests: RecordedRequest[] = [];
  await withMockedFetch(async (input, init) => {
    const request = captureRequest(input, init);
    requests.push(request);
    return new Response(JSON.stringify({ data: [] }), { status: 200 });
  }, async () => {
    const client = new KlaviyoAPIClient({ apiKey: 'klaviyo-key' });
    const response = await client.execute('get_lists', {});
    assert.equal(response.success, true, 'Klaviyo get_lists should succeed');
    const listRequest = requests.find(req => req.url.endsWith('/lists/'));
    assert.ok(listRequest, 'Klaviyo client should call the lists endpoint');
    assert.equal(headerValue(listRequest?.headers, 'klaviyo-api-key'), 'klaviyo-key');
  });
}

await testMarketoLeadSync();
await testPardotLeadRefresh();
await testIterableSendEmail();
await testKlaviyoListRetrieval();

console.log('Marketing automation API clients verified.');
