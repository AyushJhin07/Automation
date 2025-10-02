import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';

import { BigCommerceAPIClient } from '../BigCommerceAPIClient.js';
import { MagentoAPIClient } from '../MagentoAPIClient.js';
import { WooCommerceAPIClient } from '../WooCommerceAPIClient.js';
import { SquareAPIClient } from '../SquareAPIClient.js';
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

async function testBigCommerceProductWorkflow(): Promise<void> {
  const requests = useMockFetch([
    { body: '{"data": {"id": 1}}' },
    { body: '{"data": []}' },
  ]);

  const client = new BigCommerceAPIClient({ apiKey: 'bc-token', storeHash: 'ab12cd' });

  const createResult = await client.execute('create_product', {
    name: 'Widget',
    type: 'physical',
    price: 19.99,
  });
  assert.equal(createResult.success, true, 'create_product should succeed');

  const createRequest = requests[0];
  assert.ok(createRequest.url.endsWith('/catalog/products'));
  assert.equal(createRequest.init.method, 'POST');
  assert.equal(createRequest.init.headers?.['X-Auth-Token'], 'bc-token');

  const listResult = await client.execute('list_products', {
    limit: 25,
    'categories:in': [1, 2],
  });
  assert.equal(listResult.success, true, 'list_products should succeed');

  const listRequest = requests[1];
  assert.ok(listRequest.url.includes('/catalog/products?'));
  assert.ok(listRequest.url.includes('limit=25'));
  assert.ok(listRequest.url.includes('categories%3Ain=1%2C2'));
}

async function testMagentoSearchAndOrder(): Promise<void> {
  const requests = useMockFetch([
    { body: '{"items": []}' },
    { body: '{"entity_id": 10}' },
  ]);

  const client = new MagentoAPIClient({ apiKey: 'magento-token', domain: 'store.example.com' });

  const searchResponse = await client.execute('search_products', {
    searchCriteria: {
      filterGroups: [
        {
          filters: [
            { field: 'sku', value: 'SKU-100', conditionType: 'eq' },
          ],
        },
      ],
      pageSize: 50,
      currentPage: 2,
    },
  });
  assert.equal(searchResponse.success, true);

  const searchRequest = requests[0];
  assert.ok(searchRequest.url.includes('searchCriteria[pageSize]=50'));
  assert.ok(searchRequest.url.includes('searchCriteria[currentPage]=2'));
  assert.ok(searchRequest.url.includes('searchCriteria%5BfilterGroups%5D%5B0%5D%5Bfilters%5D%5B0%5D%5Bfield%5D=sku'));
  assert.ok(searchRequest.url.includes('searchCriteria%5BfilterGroups%5D%5B0%5D%5Bfilters%5D%5B0%5D%5Bvalue%5D=SKU-100'));

  const orderResponse = await client.execute('create_order', {
    entity: {
      customer_email: 'buyer@example.com',
      items: [
        { sku: 'SKU-100', qty: 1 },
      ],
    },
  });
  assert.equal(orderResponse.success, true);

  const orderRequest = requests[1];
  assert.equal(orderRequest.init.method, 'POST');
  const body = JSON.parse(orderRequest.init.body as string);
  assert.equal(body.entity.customer_email, 'buyer@example.com');
}

async function testWooCommerceOrderUpdate(): Promise<void> {
  const requests = useMockFetch([{ body: '{"id": 42}' }]);
  const token = Buffer.from('ck:cs').toString('base64');
  const client = new WooCommerceAPIClient({ apiKey: token, domain: 'shop.example.com' });

  const response = await client.execute('update_order', {
    id: 42,
    status: 'completed',
  });
  assert.equal(response.success, true);

  const request = requests[0];
  assert.ok(request.url.endsWith('/orders/42'));
  assert.equal(request.init.method, 'PUT');
  assert.equal(request.init.headers?.['Authorization'], `Basic ${token}`);
  const payload = JSON.parse(request.init.body as string);
  assert.equal(payload.status, 'completed');
}

async function testSquarePaymentAndListing(): Promise<void> {
  const requests = useMockFetch([
    { body: '{"payment": {"id": "PAYMENT"}}' },
    { body: '{"payments": []}' },
  ]);

  const client = new SquareAPIClient({ apiKey: 'sq-token' });

  const paymentResponse = await client.execute('create_payment', {
    source_id: 'cnon:card-nonce',
    idempotency_key: 'abc-123',
    amount_money: { amount: 5000, currency: 'USD' },
    autocomplete: false,
  });
  assert.equal(paymentResponse.success, true);

  const paymentRequest = requests[0];
  assert.ok(paymentRequest.url.endsWith('/payments'));
  assert.equal(paymentRequest.init.method, 'POST');
  assert.equal(paymentRequest.init.headers?.['Authorization'], 'Bearer sq-token');
  const paymentBody = JSON.parse(paymentRequest.init.body as string);
  assert.equal(paymentBody.autocomplete, false);
  assert.equal(paymentBody.amount_money.amount, 5000);

  const listResponse: APIResponse<any> = await client.execute('list_payments', {
    limit: 100,
    location_id: 'LOC',
  });
  assert.equal(listResponse.success, true);

  const listRequest = requests[1];
  assert.ok(listRequest.url.includes('limit=100'));
  assert.ok(listRequest.url.includes('location_id=LOC'));
}

try {
  await testBigCommerceProductWorkflow();
  await testMagentoSearchAndOrder();
  await testWooCommerceOrderUpdate();
  await testSquarePaymentAndListing();
} finally {
  global.fetch = originalFetch;
}
