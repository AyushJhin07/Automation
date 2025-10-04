import assert from 'node:assert/strict';

import { AdpAPIClient } from '../AdpAPIClient.js';
import type { APIResponse } from '../BaseAPIClient.js';

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

    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input?.url ?? String(input);

    requests.push({ url, init: init ?? {} });

    const status = current.status ?? 200;
    const body = current.body ?? '{}';
    const headers = current.headers ?? { 'Content-Type': 'application/json' };

    return new Response(body, { status, headers });
  }) as typeof fetch;

  return requests;
}

async function testAdpTokenExchangeStoresContext(): Promise<void> {
  const requests = useMockFetch([
    { body: '{"access_token":"access-token","expires_in":3600,"adp_context":{"tenantId":"tenant-1"}}' },
    { body: '{"workers":[]}' },
  ]);

  const client = new AdpAPIClient({ clientId: 'client', clientSecret: 'secret' });
  const response = await client.execute('test_connection', {});

  assert.equal(response.success, true, 'ADP test connection should succeed');
  assert.equal(requests.length, 2, 'Token and connection requests expected');

  const tokenRequest = requests[0];
  assert.equal(
    tokenRequest.url,
    'https://accounts.adp.com/auth/oauth/v2/token',
    'Token request should target ADP OAuth endpoint',
  );
  const encodedBody = (tokenRequest.init.body as URLSearchParams | string | undefined)?.toString() ?? '';
  assert.ok(encodedBody.includes('grant_type=client_credentials'));
  assert.ok(encodedBody.includes('client_id=client'));
  assert.ok(encodedBody.includes('client_secret=secret'));

  const apiRequest = requests[1];
  assert.equal(apiRequest.url, 'https://api.adp.com/hr/v2/workers?$top=1');
  assert.equal(apiRequest.init.method ?? 'GET', 'GET');
  assert.equal(apiRequest.init.headers?.['Authorization'], 'Bearer access-token');

  const credentials = (client as any).credentials as Record<string, any>;
  assert.deepEqual(credentials.tenantContext, { tenantId: 'tenant-1' });
}

async function testAdpTokenExchangeFetchesContextWhenMissing(): Promise<void> {
  const requests = useMockFetch([
    { body: '{"access_token":"access-token","expires_in":3600}' },
    { body: '{"tenants":[{"tenantId":"tenant-2"}]}' },
    { body: '{"workers":[]}' },
  ]);

  const client = new AdpAPIClient({ clientId: 'client', clientSecret: 'secret' });
  const response = await client.execute('test_connection', {});

  assert.equal(response.success, true);
  assert.equal(requests.length, 3, 'Token, context, and connection requests expected');

  const contextRequest = requests[1];
  assert.equal(contextRequest.url, 'https://api.adp.com/context/v1/tenants');
  assert.equal(contextRequest.init.headers?.['Authorization'], 'Bearer access-token');

  const credentials = (client as any).credentials as Record<string, any>;
  assert.deepEqual(credentials.tenantContext, [{ tenantId: 'tenant-2' }]);
}

async function testAdpRunPayrollPolling(): Promise<void> {
  const requests = useMockFetch([
    { body: '{"access_token":"access-token","expires_in":3600,"adp_context":{"tenantId":"tenant-1"}}' },
    { body: '{"event":{"eventID":"evt-123","eventName":"payroll.processing.requested"}}' },
    { body: '{"events":[{"eventID":"evt-123","eventName":"payroll.processing.completed"}]}' },
  ]);

  const client = new AdpAPIClient({ clientId: 'client', clientSecret: 'secret' });
  const response = await client.execute('run_payroll', {
    payrollGroupId: 'group-1',
    payPeriodStart: '2024-01-01',
    payPeriodEnd: '2024-01-15',
    waitForCompletion: true,
    pollIntervalSeconds: 0,
    maxPollAttempts: 1,
  });

  assert.equal(response.success, true, 'Payroll run should return a response');
  const result = response as APIResponse<any>;
  assert.equal(result.data?.status, 'Completed', 'Polling should detect completion');

  assert.equal(requests.length, 3, 'Token, run payroll, and polling requests expected');
  const payrollRequest = requests[1];
  assert.equal(payrollRequest.url, 'https://api.adp.com/events/payroll/v1/payroll-processing');
  assert.equal(payrollRequest.init.method ?? 'POST', 'POST');
  assert.equal(payrollRequest.init.headers?.['Authorization'], 'Bearer access-token');

  const pollingRequest = requests[2];
  assert.equal(
    pollingRequest.url,
    'https://api.adp.com/events/payroll/v1/polling?eventId=evt-123',
    'Polling should target payroll events endpoint with eventId',
  );
}

try {
  await testAdpTokenExchangeStoresContext();
  await testAdpTokenExchangeFetchesContextWhenMissing();
  await testAdpRunPayrollPolling();
  console.log('HR API clients integration smoke tests passed.');
} finally {
  global.fetch = originalFetch;
}
