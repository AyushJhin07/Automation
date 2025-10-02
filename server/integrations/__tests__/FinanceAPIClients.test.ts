import assert from 'node:assert/strict';

import { NetsuiteAPIClient } from '../NetsuiteAPIClient.js';
import { BrexAPIClient } from '../BrexAPIClient.js';
import { RampAPIClient } from '../RampAPIClient.js';
import { RazorpayAPIClient } from '../RazorpayAPIClient.js';
import { ZohoBooksAPIClient } from '../ZohoBooksAPIClient.js';
import { XeroAPIClient } from '../XeroAPIClient.js';
import { SageintacctAPIClient } from '../SageintacctAPIClient.js';
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
    const url = typeof input === 'string' ? input : input.toString();
    requests.push({ url, init: init ?? {} });
    const status = current.status ?? 200;
    const body = current.body ?? '{}';
    const headers = current.headers ?? { 'Content-Type': 'application/json' };
    return new Response(body, { status, headers });
  }) as typeof fetch;

  return requests;
}

async function testNetsuiteListCustomers(): Promise<void> {
  const requests = useMockFetch([{ body: '{"items":[]}' }]);
  const client = new NetsuiteAPIClient({ accessToken: 'token', accountId: '1234567' });

  const result = await client.execute('get_customers', { limit: 10, q: 'Acme' });
  assert.equal(result.success, true, 'NetSuite list customers should succeed');

  assert.equal(requests.length, 1);
  const request = requests[0];
  assert.ok(request.url.includes('1234567.suitetalk.api.netsuite.com'));
  assert.ok(request.url.endsWith('/customer?limit=10&q=Acme'));
  assert.equal(request.init.headers?.['Authorization'], 'Bearer token');
}

async function testXeroCreateContact(): Promise<void> {
  const requests = useMockFetch([{ body: '{"Contacts":[{}]}' }]);
  const client = new XeroAPIClient({ accessToken: 'xero-token', tenantId: 'tenant-1' });

  const response = await client.execute('create_contact', {
    name: 'Acme',
    emailAddress: 'ops@example.com'
  });
  assert.equal(response.success, true);

  const body = requests[0].init.body as string;
  const parsed = JSON.parse(body);
  assert.deepEqual(parsed.Contacts[0].name, 'Acme');
  assert.equal(requests[0].init.headers?.['Xero-Tenant-Id'], 'tenant-1');
}

async function testBrexListTransactions(): Promise<void> {
  const requests = useMockFetch([{ body: '{"data":[]}' }]);
  const client = new BrexAPIClient({ accessToken: 'brex-access' });

  const result = await client.execute('list_transactions', {
    card_id: ['card1', 'card2'],
    limit: 50
  });
  assert.equal(result.success, true);
  assert.ok(requests[0].url.includes('/v2/transactions?'));
  assert.ok(requests[0].url.includes('card_id=card1%2Ccard2'));
  assert.ok(requests[0].url.includes('limit=50'));
}

async function testRampCreateUser(): Promise<void> {
  const requests = useMockFetch([{ body: '{"id":"user"}' }]);
  const client = new RampAPIClient({ apiKey: 'ramp-secret' });

  const result = await client.execute('create_user', {
    first_name: 'Ada',
    last_name: 'Lovelace',
    email: 'ada@example.com',
    role: 'ADMIN'
  });
  assert.equal(result.success, true);
  assert.equal(requests[0].init.headers?.['Authorization'], 'Bearer ramp-secret');
}

async function testRazorpayCaptureErrorHandling(): Promise<void> {
  const requests = useMockFetch([{ status: 400, body: '{"error":"invalid"}' }]);
  const client = new RazorpayAPIClient({ keyId: 'key', keySecret: 'secret' });

  const result = await client.execute('capture_payment', {
    payment_id: 'pay_123',
    amount: 500
  });
  assert.equal(result.success, false, 'capture_payment should surface provider errors');
  const authHeader = requests[0].init.headers?.['Authorization'];
  const expected = Buffer.from('key:secret').toString('base64');
  assert.equal(authHeader, `Basic ${expected}`);
}

async function testZohoBooksCreateInvoice(): Promise<void> {
  const requests = useMockFetch([{ body: '{"invoice":{"invoice_id":"123"}}' }]);
  const client = new ZohoBooksAPIClient({ accessToken: 'zoho-token', organizationId: '999999' });

  const response = await client.execute('create_invoice', {
    customerId: 'cust_1',
    lineItems: [
      { itemId: 'item', rate: 100, quantity: 1 }
    ]
  });
  assert.equal(response.success, true);
  assert.ok(requests[0].url.includes('organization_id=999999'));
  const body = JSON.parse(requests[0].init.body as string);
  assert.equal(body.customer_id, 'cust_1');
  assert.ok(Array.isArray(body.line_items));
}

async function testSageIntacctEnvelope(): Promise<void> {
  const requests = useMockFetch([{ body: '<response status="success" />' }]);
  const client = new SageintacctAPIClient({
    userId: 'user',
    userPassword: 'pass',
    companyId: 'comp',
    senderId: 'sender',
    senderPassword: 'senderPass'
  });

  const result: APIResponse<any> = await client.execute('create_customer', {
    customerid: 'C-1',
    name: 'Contoso'
  });
  assert.equal(result.success, true);
  const xmlBody = requests[0].init.body as string;
  assert.ok(xmlBody.includes('<senderid>sender</senderid>'));
  assert.ok(xmlBody.includes('<userid>user</userid>'));
  assert.ok(xmlBody.includes('<customerid>C-1</customerid>'));
}

await testNetsuiteListCustomers();
await testXeroCreateContact();
await testBrexListTransactions();
await testRampCreateUser();
await testRazorpayCaptureErrorHandling();
await testZohoBooksCreateInvoice();
await testSageIntacctEnvelope();

global.fetch = originalFetch;

console.log('Finance API clients verified.');
