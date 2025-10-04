import assert from 'node:assert/strict';

import { WorkdayAPIClient } from '../WorkdayAPIClient.js';

interface MockResponse {
  status?: number;
  body?: any;
  headers?: Record<string, string>;
}

interface RecordedRequest {
  url: string;
  init: RequestInit;
}

const originalFetch = global.fetch;

function setupMockFetch(sequence: MockResponse[]) {
  const requests: RecordedRequest[] = [];
  let index = 0;

  global.fetch = (async (input: any, init?: RequestInit): Promise<Response> => {
    const current = sequence[Math.min(index, sequence.length - 1)] ?? {};
    index += 1;
    const url = typeof input === 'string' ? input : input.toString();
    requests.push({ url, init: init ?? {} });

    const status = current.status ?? 200;
    const headers = current.headers ?? { 'Content-Type': 'application/json' };
    const body =
      typeof current.body === 'string'
        ? current.body
        : JSON.stringify(current.body ?? {});

    return new Response(body, { status, headers });
  }) as typeof fetch;

  return {
    requests,
    restore: () => {
      global.fetch = originalFetch;
    },
  };
}

function createClient(overrides: Partial<ConstructorParameters<typeof WorkdayAPIClient>[0]> = {}) {
  return new WorkdayAPIClient({
    accessToken: 'token-123',
    tenant: 'acme-co',
    region: 'wd7-impl-services1',
    ...overrides,
  });
}

async function testTenantAndRegionUrlConstruction(): Promise<void> {
  const mock = setupMockFetch([{ body: { data: [] } }]);
  const client = createClient({ region: 'wd2-impl-services1' });

  const response = await client.searchWorkers({ searchTerm: 'Ada', isActive: true, limit: 5 });
  assert.equal(response.success, true, 'Search workers should report success when the API responds with 200.');

  const request = mock.requests[0];
  assert.ok(
    request.url.startsWith('https://wd2-impl-services1.workday.com/ccx/api/v1/acme-co/workers'),
    'Requests should target the tenant-specific path for the configured region.'
  );
  assert.ok(request.url.includes('search=Ada'));
  assert.ok(request.url.includes('isActive=true'));
  assert.ok(request.url.includes('limit=5'));
  assert.equal(request.init.method, 'GET');
  assert.equal(request.init.headers?.['Authorization'], 'Bearer token-123');

  mock.restore();
}

async function testCreateWorkerSuccessFlow(): Promise<void> {
  const mock = setupMockFetch([{ status: 201, body: { id: 'W-123' } }]);
  const client = createClient({ hostname: 'custom.workday.com' });

  const payload = {
    personalData: { firstName: 'Grace', lastName: 'Hopper' },
    positionData: { positionId: 'ENG-1' },
    hireDate: '2024-01-15',
  };

  const response = await client.createWorker(payload);
  assert.equal(response.success, true, 'createWorker should return success when Workday accepts the payload.');
  assert.deepEqual(response.data, { id: 'W-123' });

  const request = mock.requests[0];
  assert.equal(request.init.method, 'POST');
  assert.equal(
    request.url,
    'https://custom.workday.com/ccx/api/v1/acme-co/workers',
    'createWorker should post to the tenant workers collection.'
  );

  const body = JSON.parse(request.init.body as string);
  assert.deepEqual(body.personalData, payload.personalData);
  assert.deepEqual(body.positionData, payload.positionData);
  assert.equal(body.hireDate, '2024-01-15');

  mock.restore();
}

async function testCreateWorkerFailureFlow(): Promise<void> {
  const mock = setupMockFetch([{ status: 400, body: { error: 'Validation failed' } }]);
  const client = createClient();

  const response = await client.createWorker({
    personalData: { firstName: 'Linus', lastName: 'Torvalds' },
    positionData: { positionId: 'ENG-2' },
    hireDate: '2024-02-01',
  });

  assert.equal(response.success, false, 'createWorker should surface Workday validation errors.');
  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.data, { error: 'Validation failed' });

  mock.restore();
}

async function testTerminateWorkerEndpoint(): Promise<void> {
  const mock = setupMockFetch([{ status: 200, body: { workerId: 'W-123', status: 'TERMINATED' } }]);
  const client = createClient();

  const response = await client.terminateWorker({
    workerId: 'W-123',
    terminationDate: '2024-03-31',
    reason: 'Resigned',
  });

  assert.equal(response.success, true, 'terminateWorker should succeed when Workday acknowledges the termination.');
  assert.deepEqual(response.data, { workerId: 'W-123', status: 'TERMINATED' });

  const request = mock.requests[0];
  assert.equal(request.init.method, 'POST');
  assert.equal(
    request.url,
    'https://wd7-impl-services1.workday.com/ccx/api/v1/acme-co/workers/W-123/terminate',
    'terminateWorker should call the worker termination endpoint.'
  );

  const body = JSON.parse(request.init.body as string);
  assert.equal(body.terminationDate, '2024-03-31');
  assert.equal(body.reason, 'Resigned');

  mock.restore();
}

async function testTestConnection(): Promise<void> {
  const mock = setupMockFetch([{ status: 200, body: { data: [] } }]);
  const client = createClient();

  const response = await client.testConnection();
  assert.equal(response.success, true, 'testConnection should succeed when the /workers probe returns 200.');

  const request = mock.requests[0];
  assert.equal(request.url, 'https://wd7-impl-services1.workday.com/ccx/api/v1/acme-co/workers?limit=1');
  assert.equal(request.init.method, 'GET');

  mock.restore();
}

try {
  await testTenantAndRegionUrlConstruction();
  await testCreateWorkerSuccessFlow();
  await testCreateWorkerFailureFlow();
  await testTerminateWorkerEndpoint();
  await testTestConnection();
  console.log('Workday API client tests passed.');
} finally {
  global.fetch = originalFetch;
}
