import assert from 'node:assert/strict';

import { SnowflakeAPIClient } from '../SnowflakeAPIClient.js';

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

function useMockFetch(sequence: MockResponse[]): RecordedRequest[] {
  const requests: RecordedRequest[] = [];
  let index = 0;

  global.fetch = (async (input: any, init?: RequestInit): Promise<Response> => {
    const current = sequence[Math.min(index, sequence.length - 1)] ?? {};
    index += 1;

    const url = typeof input === 'string' ? input : input.url ?? input.toString();
    requests.push({ url, init: init ?? {} });

    const status = current.status ?? 200;
    const body = typeof current.body === 'string' ? current.body : JSON.stringify(current.body ?? {});
    const headers = current.headers ?? { 'Content-Type': 'application/json' };

    return new Response(body, { status, headers });
  }) as typeof fetch;

  return requests;
}

async function testExecuteQueryStreamsResults(): Promise<void> {
  const requests = useMockFetch([
    {
      body: {
        statementHandle: '01a',
        queryId: 'ae-fake-query',
        data: [[1, 'first']],
        nextUri: '/queries/v1/query-request?requestId=fake&chunk=2',
        requestId: 'initial-request',
        resultSetMetaData: { rowType: [{ name: 'COL1' }] }
      }
    },
    { body: { data: [[2, 'second']], nextUri: null } }
  ]);

  const client = new SnowflakeAPIClient({
    accessToken: 'snow-token',
    account: 'xy12345.us-east-1',
    warehouse: 'COMPUTE_WH',
    database: 'ANALYTICS',
    schema: 'PUBLIC'
  });

  const response = await client.executeQuery({
    sql: 'select * from example where limit = :limit',
    parameters: { limit: 2 },
    timeout: 45
  });

  assert.equal(response.success, true, 'Snowflake query should succeed');
  assert.ok(response.data, 'Query response should include data');
  assert.equal(response.data?.statementHandle, '01a');
  assert.equal(response.data?.queryId, 'ae-fake-query');
  assert.deepEqual(response.data?.rows, [[1, 'first'], [2, 'second']]);
  assert.equal(response.data?.requestId, 'initial-request');

  assert.equal(requests.length, 2, 'Should issue initial POST and follow-up GET for chunks');

  const initialRequest = requests[0];
  assert.ok(initialRequest.url.endsWith('/queries/v1/query-request'));
  assert.equal(initialRequest.init.method, 'POST');
  const initialBody = JSON.parse(initialRequest.init.body as string);
  assert.equal(initialBody.sqlText, 'select * from example where limit = :limit');
  assert.equal(initialBody.warehouse, 'COMPUTE_WH');
  assert.equal(initialBody.database, 'ANALYTICS');
  assert.equal(initialBody.schema, 'PUBLIC');
  assert.equal(initialBody.queryTimeout, 45);
  assert.equal(initialBody.bindings.limit.type, 'FIXED');
  assert.equal(initialBody.bindings.limit.value, '2');
  assert.equal(initialRequest.init.headers?.['Authorization'], 'Bearer snow-token');

  const chunkRequest = requests[1];
  assert.ok(chunkRequest.url.includes('/queries/v1/query-request?requestId=fake&chunk=2'));
  assert.equal(chunkRequest.init.method, 'GET');
}

async function testCancelQuery(): Promise<void> {
  const requests = useMockFetch([{ body: { success: true } }]);

  const client = new SnowflakeAPIClient({
    accessToken: 'cancel-token',
    account: 'my-account'
  });

  const result = await client.cancelQuery({ statementHandle: 'handle-123' });
  assert.equal(result.success, true, 'Cancel query should surface provider success');

  assert.equal(requests.length, 1);
  const request = requests[0];
  assert.ok(request.url.endsWith('/queries/v1/abort-request'));
  assert.equal(request.init.method, 'POST');
  const body = JSON.parse(request.init.body as string);
  assert.equal(body.statementHandle, 'handle-123');
  assert.ok(body.requestId, 'Cancellation should include a generated request ID');
}

async function testExecuteQueryErrorHandling(): Promise<void> {
  const requests = useMockFetch([
    {
      body: {
        success: false,
        errorCode: '001003',
        message: 'Syntax error in SQL statement'
      }
    }
  ]);

  const client = new SnowflakeAPIClient({ accessToken: 'token', account: 'error-account' });
  const result = await client.executeQuery({ sql: 'select bad syntax' });

  assert.equal(result.success, false, 'Query failure should be reported');
  assert.ok(result.error, 'Error response should include a message');
  assert.match(result.error ?? '', /syntax error/i);
  assert.equal(requests.length, 1, 'Failure should not trigger chunk polling');
}

await testExecuteQueryStreamsResults();
await testCancelQuery();
await testExecuteQueryErrorHandling();

global.fetch = originalFetch;

console.log('Snowflake API client verified.');
