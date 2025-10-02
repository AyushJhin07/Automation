import assert from 'node:assert/strict';

import { MarketoAPIClient } from '../MarketoAPIClient.js';
import { PardotAPIClient } from '../PardotAPIClient.js';
import { IterableAPIClient } from '../IterableAPIClient.js';
import { KlaviyoAPIClient } from '../KlaviyoAPIClient.js';

type MockResponse = {
  status?: number;
  body?: string;
  headers?: Record<string, string>;
};

type RecordedRequest = {
  url: string;
  init: RequestInit;
};

const originalFetch = global.fetch;

function useMockFetch(sequence: MockResponse[]): RecordedRequest[] {
  const requests: RecordedRequest[] = [];
  let index = 0;

  global.fetch = (async (input: any, init?: RequestInit): Promise<Response> => {
    const current = sequence[Math.min(index, sequence.length - 1)] ?? {};
    index += 1;
    const url = typeof input === 'string' ? input : input.toString();
    requests.push({ url, init: init ?? {} });
    const status = current.status ?? 200;
    const body = current.body ?? '{}';
    const headers = current.headers ?? { 'Content-Type': 'application/json' };
    return new Response(body, { status, headers });
  }) as typeof fetch;

  return requests;
}

async function testMarketoLeadSync(): Promise<void> {
  const requests = useMockFetch([
    { body: '{"access_token":"new-token","expires_in":3600}' },
    { body: '{"result":[{"id":101}]}' },
  ]);

  const client = new MarketoAPIClient({
    accessToken: 'expired-token',
    refreshToken: 'refresh-token',
    clientId: 'client-id',
    clientSecret: 'client-secret',
    instanceUrl: 'https://123-abc-456.mktorest.com',
    expiresAt: Date.now() - 60_000,
  });

  const response = await client.execute('create_lead', {
    email: 'ada@example.com',
    firstName: 'Ada',
    lastName: 'Lovelace',
  });

  assert.equal(response.success, true, 'Marketo create lead should succeed');
  assert.equal(requests.length, 2, 'Marketo client should refresh token before calling the API');

  const refreshRequest = requests[0];
  assert.ok(
    refreshRequest.url.includes('/identity/oauth/token'),
    'Marketo refresh should target the identity token endpoint',
  );

  const leadRequest = requests[1];
  assert.ok(leadRequest.url.endsWith('/rest/v1/leads.json'), 'Marketo lead endpoint should be called');
  assert.equal(
    leadRequest.init.headers?.['Authorization'],
    'Bearer new-token',
    'Marketo request should use refreshed access token',
  );

  const body = JSON.parse(leadRequest.init.body as string);
  assert.equal(body.action, 'createOrUpdate');
  assert.equal(body.input[0].email, 'ada@example.com');
}

async function testMarketoRequestCampaign(): Promise<void> {
  const requests = useMockFetch([{ body: '{"result":"ok"}' }]);
  const client = new MarketoAPIClient({
    accessToken: 'marketo-access',
    instanceUrl: 'https://123-abc-456.mktorest.com',
  });

  const result = await client.execute('request_campaign', {
    campaignId: 42,
    leads: [{ id: 101 }],
    tokens: [{ name: '{{lead.FirstName}}', value: 'Ada' }],
  });

  assert.equal(result.success, true);
  assert.ok(requests[0].url.endsWith('/rest/v1/campaigns/42/trigger.json'));
  const payload = JSON.parse(requests[0].init.body as string);
  assert.equal(payload.input[0].id, 101);
}

async function testPardotCreateProspect(): Promise<void> {
  const requests = useMockFetch([{ body: '{"prospect":{"id":1}}' }]);
  const client = new PardotAPIClient({
    accessToken: 'pardot-access',
    businessUnitId: '0UvXXXX0000',
  });

  const response = await client.execute('create_prospect', {
    email: 'ada@example.com',
    first_name: 'Ada',
    company: 'Analytical Engines',
  });

  assert.equal(response.success, true);
  assert.ok(
    requests[0].url.includes('/prospect/version/4/do/create/email/ada%40example.com'),
    'Pardot create endpoint should include encoded email',
  );
  assert.equal(requests[0].init.headers?.['Authorization'], 'Bearer pardot-access');
  assert.equal(requests[0].init.headers?.['Pardot-Business-Unit-Id'], '0UvXXXX0000');
}

async function testIterableEmailOperations(): Promise<void> {
  const requests = useMockFetch([
    { body: '{"lists":[]}' },
    { body: '{"msg":"ok"}' },
  ]);

  const client = new IterableAPIClient({ apiKey: 'iterable-key' });

  const lists = await client.execute('get_lists', {});
  assert.equal(lists.success, true);
  assert.ok(requests[0].url.endsWith('/lists'));
  assert.equal(requests[0].init.method ?? 'GET', 'GET');

  const send = await client.execute('send_email', {
    campaignId: 99,
    recipientEmail: 'ada@example.com',
  });
  assert.equal(send.success, true);
  assert.equal(requests[1].init.headers?.['Api-Key'], 'iterable-key');
  const body = JSON.parse(requests[1].init.body as string);
  assert.equal(body.campaignId, 99);
}

async function testKlaviyoListSubscriptions(): Promise<void> {
  const requests = useMockFetch([
    { body: '{"data":[]}' },
    { body: '{"status":"queued"}' },
  ]);

  const client = new KlaviyoAPIClient({ apiKey: 'klaviyo-key' });

  const lists = await client.execute('get_lists', {});
  assert.equal(lists.success, true);
  assert.ok(requests[0].url.endsWith('/lists'));

  const subscribe = await client.execute('subscribe_profiles', {
    list_id: 'Wk123',
    data: {
      data: {
        type: 'profile-subscription-bulk-create-job',
        attributes: {
          profiles: [{ data: { type: 'profile', attributes: { email: 'ada@example.com' } } }],
        },
      },
    },
  });

  assert.equal(subscribe.success, true);
  assert.ok(requests[1].url.endsWith('/lists/Wk123/subscribe'));
  assert.equal(requests[1].init.headers?.['Authorization'], 'Klaviyo-API-Key klaviyo-key');
}

await testMarketoLeadSync();
await testMarketoRequestCampaign();
await testPardotCreateProspect();
await testIterableEmailOperations();
await testKlaviyoListSubscriptions();

global.fetch = originalFetch;

console.log('Marketing automation API clients verified.');
