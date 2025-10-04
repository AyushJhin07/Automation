import assert from 'node:assert/strict';

import { DatabricksAPIClient } from '../DatabricksAPIClient.js';

type MockResponse = {
  status?: number;
  headers?: Record<string, string>;
  body?: any;
  assert?: (input: RequestInfo | URL, init?: RequestInit) => void;
};

const originalFetch = globalThis.fetch;

function headersToObject(init?: RequestInit): Record<string, string> {
  const headers = new Headers(init?.headers as HeadersInit | undefined);
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

function mockFetchSequence(responses: MockResponse[]): () => number {
  let callCount = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const index = Math.min(callCount, responses.length - 1);
    const { status = 200, headers = { 'content-type': 'application/json' }, body = {}, assert } = responses[index];
    callCount += 1;
    assert?.(input, init);
    const payload = typeof body === 'string' ? body : JSON.stringify(body);
    return new Response(payload, { status, headers });
  }) as typeof fetch;
  return () => callCount;
}

function resetFetch(): void {
  globalThis.fetch = originalFetch;
}

function createClient(): DatabricksAPIClient {
  return new DatabricksAPIClient({
    host: 'https://workspace.cloud.databricks.com',
    personalAccessToken: 'dapi-test-token'
  });
}

async function testConstructorValidation(): Promise<void> {
  assert.throws(
    () => new DatabricksAPIClient({ personalAccessToken: 'token' } as any),
    /requires a host/i,
    'constructor should require a host'
  );

  assert.throws(
    () => new DatabricksAPIClient({ host: 'https://workspace.cloud.databricks.com' } as any),
    /requires a personal access token/i,
    'constructor should require a PAT'
  );

  const client = createClient();
  assert.ok(client, 'client should be instantiated when credentials are valid');
}

async function testListClustersNormalization(): Promise<void> {
  const getCallCount = mockFetchSequence([
    {
      assert: (input, init) => {
        assert.equal(
          String(input),
          'https://workspace.cloud.databricks.com/api/2.0/clusters/list',
          'listClusters should call the clusters list endpoint'
        );
        const headers = headersToObject(init);
        assert.equal(headers['authorization'], 'Bearer dapi-test-token');
        assert.equal(init?.method, 'POST');
      },
      body: {
        clusters: [
          { cluster_id: 'abc', state: { state: 'RUNNING' } },
          { cluster_id: 'def', state: { state: 'TERMINATED' } }
        ]
      }
    }
  ]);

  const client = createClient();
  const response = await client.listClusters();
  assert.equal(response.success, true, 'listClusters should succeed');
  assert.equal(response.data?.items.length, 2, 'listClusters should return two clusters');
  assert.equal(response.data?.meta.totalCount, 2, 'meta.totalCount should reflect item count');
  assert.equal(getCallCount(), 1, 'fetch should be invoked exactly once');
  resetFetch();
}

async function testSubmitRunRetries(): Promise<void> {
  const payloadCheck: Array<Record<string, any>> = [];
  const getCallCount = mockFetchSequence([
    {
      status: 429,
      body: { error_code: 'RATE_LIMITED' },
      assert: (input) => {
        assert.equal(
          String(input),
          'https://workspace.cloud.databricks.com/api/2.0/jobs/runs/submit',
          'submitRun should target jobs/runs/submit'
        );
      }
    },
    {
      status: 200,
      body: { run_id: 42 },
      assert: (_input, init) => {
        const body = JSON.parse(String(init?.body || '{}'));
        payloadCheck.push(body);
      }
    }
  ]);

  const client = createClient();
  const result = await client.submitRun({
    run_name: 'Example Run',
    existing_cluster_id: 'cluster-123',
    notebook_task: { notebook_path: '/Shared/Demo' }
  });

  assert.equal(result.success, true, 'submitRun should succeed after retry');
  assert.equal(result.data?.run_id, 42, 'run_id should be returned');
  assert.equal(getCallCount(), 2, 'submitRun should retry after a 429 response');
  assert.equal(payloadCheck[0].run_name, 'Example Run', 'payload should include the run name');
  resetFetch();
}

async function testExecuteSqlStatement(): Promise<void> {
  const getCallCount = mockFetchSequence([
    {
      body: {
        statement_id: 'stmt-1',
        status: { state: 'RUNNING' }
      },
      assert: (input, init) => {
        assert.equal(
          String(input),
          'https://workspace.cloud.databricks.com/api/2.0/sql/statements',
          'executeSqlStatement should submit to /sql/statements'
        );
        assert.equal(init?.method, 'POST');
        const payload = JSON.parse(String(init?.body || '{}'));
        assert.equal(payload.statement, 'SELECT 1');
        assert.equal(payload.warehouse_id, 'wh-123');
      }
    },
    {
      body: {
        statement_id: 'stmt-1',
        status: { state: 'SUCCEEDED' },
        result: { data_array: [[1]] }
      },
      assert: (input, init) => {
        assert.equal(
          String(input),
          'https://workspace.cloud.databricks.com/api/2.0/sql/statements/stmt-1',
          'executeSqlStatement should poll the statement status'
        );
        assert.equal(init?.method, 'GET');
      }
    }
  ]);

  const client = createClient();
  const response = await client.executeSqlStatement({
    warehouse_id: 'wh-123',
    statement: 'SELECT 1'
  });

  assert.equal(response.success, true, 'executeSqlStatement should eventually succeed');
  assert.equal(response.data?.status?.state, 'SUCCEEDED', 'final statement state should be SUCCEEDED');
  assert.equal(getCallCount(), 2, 'executeSqlStatement should poll once');
  resetFetch();
}

async function testListJobsMeta(): Promise<void> {
  const getCallCount = mockFetchSequence([
    {
      body: {
        jobs: [{ job_id: 1 }, { job_id: 2 }],
        has_more: false,
        next_page: null
      },
      assert: (input) => {
        assert.equal(
          String(input),
          'https://workspace.cloud.databricks.com/api/2.0/jobs/list?limit=5&expand_tasks=true',
          'listJobs should include query parameters'
        );
      }
    }
  ]);

  const client = createClient();
  const response = await client.listJobs({ limit: 5, expand_tasks: true });

  assert.equal(response.success, true, 'listJobs should succeed');
  assert.equal(response.data?.items.length, 2, 'listJobs should surface returned jobs');
  assert.equal(response.data?.meta.hasMore, false, 'meta.hasMore should be false');
  assert.ok('nextPage' in (response.data?.meta ?? {}), 'meta should expose nextPage');
  assert.equal(getCallCount(), 1, 'listJobs should perform one request');
  resetFetch();
}

async function testPollJobCompletedFilters(): Promise<void> {
  const getCallCount = mockFetchSequence([
    {
      body: {
        runs: [
          { run_id: 1, state: { life_cycle_state: 'TERMINATED' } },
          { run_id: 2, state: { life_cycle_state: 'RUNNING' } }
        ]
      },
      assert: (input) => {
        assert.equal(
          String(input),
          'https://workspace.cloud.databricks.com/api/2.0/jobs/runs/list?completed_only=true',
          'pollJobCompleted should request completed runs'
        );
      }
    }
  ]);

  const client = createClient();
  const response = await client.pollJobCompleted();

  assert.equal(response.success, true, 'pollJobCompleted should succeed');
  assert.equal(response.data?.items.length, 1, 'only terminated runs should be returned');
  assert.equal(response.data?.items[0].run_id, 1, 'the terminated run should be surfaced');
  assert.equal(getCallCount(), 1, 'pollJobCompleted should make a single request');
  resetFetch();
}

async function run(): Promise<void> {
  await testConstructorValidation();
  await testListClustersNormalization();
  await testSubmitRunRetries();
  await testExecuteSqlStatement();
  await testListJobsMeta();
  await testPollJobCompletedFilters();

  console.log('Databricks API client behaviour validated.');
}

try {
  await run();
} finally {
  resetFetch();
}
