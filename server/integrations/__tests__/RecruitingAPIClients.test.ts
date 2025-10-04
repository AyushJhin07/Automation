import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { LeverAPIClient } from '../LeverAPIClient.js';

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

function resolveHeader(init: RequestInit, name: string): string | null {
  if (!init.headers) {
    return null;
  }

  if (init.headers instanceof Headers) {
    return init.headers.get(name);
  }

  if (Array.isArray(init.headers)) {
    for (const [key, value] of init.headers) {
      if (String(key).toLowerCase() === name.toLowerCase()) {
        return value;
      }
    }
    return null;
  }

  const record = init.headers as Record<string, string>;
  const candidate = record[name as keyof typeof record];
  return typeof candidate === 'string' ? candidate : null;
}

async function testLeverRetryHandling(): Promise<void> {
  const requests = useMockFetch([
    { status: 429, body: '{"data":[]}', headers: { 'Content-Type': 'application/json', 'Retry-After': '0.1' } },
    { status: 200, body: '{"data":[{"id":"opp-1"}]}' },
  ]);

  const client = new LeverAPIClient({ apiKey: 'key:secret' });
  const response = await client.listOpportunities({ limit: 1 });

  assert.equal(response.success, true, 'list_opportunities should succeed after retrying');
  assert.equal(requests.length, 2, 'Lever client should retry once on 429');

  const header = resolveHeader(requests[0].init, 'Authorization');
  assert.ok(header?.startsWith('Basic '), 'Lever requests should include basic authentication header');
}

async function testStageDynamicOptions(): Promise<void> {
  const requests = useMockFetch([
    { status: 200, body: '{"data":[{"id":"stage-1","text":"Screen"}]}' },
  ]);

  const client = new LeverAPIClient({ apiKey: 'key:secret' });
  const result = await client.getDynamicOptions('list_stages', { limit: 5 });

  assert.equal(result.success, true, 'Stage dynamic options should succeed');
  assert.equal(result.options.length, 1, 'Stage options should return the mocked stage');
  assert.equal(result.options[0]?.value, 'stage-1');
  assert.equal(result.options[0]?.label, 'Screen');
  assert.ok(requests[0].url.includes('/stages'), 'Stage options should call the /stages endpoint');
}

async function testDefinitionHandlers(): Promise<void> {
  const definitionPath = resolve('connectors/lever/definition.json');
  const definition = JSON.parse(await readFile(definitionPath, 'utf8'));

  const responses: MockResponse[] = new Array(definition.actions.length).fill({
    status: 200,
    body: '{"data":{}}',
  });

  const requests = useMockFetch(responses);
  const client = new LeverAPIClient({ apiKey: 'key:secret' });

  const sampleParams: Record<string, any> = {
    test_connection: {},
    list_opportunities: { limit: 1 },
    get_opportunity: { id: 'opp-123' },
    create_opportunity: { name: 'Sample Candidate', emails: ['candidate@example.com'] },
    update_opportunity: { id: 'opp-123', stage: 'stage-1' },
    archive_opportunity: { id: 'opp-123', reason: 'other' },
    list_postings: {},
    get_posting: { id: 'post-123' },
    list_users: { limit: 1 },
    get_user: { id: 'user-123' },
    add_note: { opportunity_id: 'opp-123', value: 'Follow-up scheduled' },
    advance_opportunity: { id: 'opp-123', stage: 'stage-1' },
  };

  for (const action of definition.actions) {
    const params = sampleParams[action.id] ?? {};
    const response = await client.execute(action.id, params);
    assert.notEqual(
      response.error,
      `Unknown function handler: ${action.id}`,
      `Lever handler should be registered for ${action.id}`,
    );
    assert.equal(response.success, true, `Lever ${action.id} handler should return success`);
  }

  assert.equal(
    requests.length,
    definition.actions.length,
    'Lever client should issue one HTTP request per action execution',
  );
}

await testLeverRetryHandling();
await testStageDynamicOptions();
await testDefinitionHandlers();

global.fetch = originalFetch;
console.log('Lever API client smoke tests complete.');
