import assert from 'node:assert/strict';

import { AzureDevopsAPIClient } from '../AzureDevopsAPIClient.js';
import { CircleCIApiClient } from '../CircleCIApiClient.js';
import { JenkinsAPIClient } from '../JenkinsAPIClient.js';

const originalFetch = globalThis.fetch;

type FetchAssertion = (input: RequestInfo | URL, init?: RequestInit) => void;

type MockResponseOptions = {
  status?: number;
  headers?: Record<string, string>;
  body?: any;
};

function headersToObject(init?: RequestInit): Record<string, string> {
  const headers = new Headers(init?.headers as HeadersInit | undefined);
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

function mockFetch(assertion: FetchAssertion, options: MockResponseOptions = {}): void {
  const { status = 200, headers = { 'content-type': 'application/json' }, body = {} } = options;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    assertion(input, init);
    const payload = typeof body === 'string' ? body : JSON.stringify(body);
    return new Response(payload, { status, headers });
  }) as typeof fetch;
}

async function testAzureDevopsClient(): Promise<void> {
  const client = new AzureDevopsAPIClient({
    organization: 'contoso',
    personal_access_token: 'secret-token',
    project: 'payments'
  });

  mockFetch((url, init) => {
    assert.equal(String(url), 'https://dev.azure.com/contoso/_apis/projects?api-version=7.0');
    const headers = headersToObject(init);
    assert.ok(headers['authorization']?.startsWith('Basic '));
  });
  const ping = await client.testConnection();
  assert.equal(ping.success, true, 'Azure DevOps test connection should succeed');

  mockFetch((url, init) => {
    assert.equal(
      String(url),
      'https://dev.azure.com/contoso/payments/_apis/wit/workitems/$Bug?api-version=7.0'
    );
    const headers = headersToObject(init);
    assert.equal(headers['content-type'], 'application/json-patch+json');
    const payload = JSON.parse(String(init?.body || '[]')) as Array<{ path: string; value: unknown }>;
    assert.ok(payload.some(entry => entry.path === '/fields/System.Title' && entry.value === 'Portal bug'));
    assert.ok(payload.some(entry => entry.path === '/fields/System.AssignedTo' && entry.value === 'dev@example.com'));
  });
  const workItem = await client.createWorkItem({
    type: 'Bug',
    title: 'Portal bug',
    assigned_to: 'dev@example.com'
  });
  assert.equal(workItem.success, true, 'Work item creation should succeed');

  mockFetch((url, init) => {
    assert.equal(
      String(url),
      'https://dev.azure.com/contoso/payments/_apis/build/builds?api-version=7.0'
    );
    const payload = JSON.parse(String(init?.body || '{}'));
    assert.deepEqual(payload.definition, { id: '123' });
    assert.equal(payload.sourceBranch, 'refs/heads/main');
  });
  const build = await client.triggerBuild({ definition_id: '123', source_branch: 'refs/heads/main' });
  assert.equal(build.success, true, 'Build trigger should succeed');
}

async function testCircleCIClient(): Promise<void> {
  const client = new CircleCIApiClient({ apiKey: 'circleci-token' });

  mockFetch((url, init) => {
    assert.equal(String(url), 'https://circleci.com/api/v2/me');
    const headers = headersToObject(init);
    assert.equal(headers['circle-token'], 'circleci-token');
  });
  const ping = await client.testConnection();
  assert.equal(ping.success, true, 'CircleCI test connection should succeed');

  mockFetch((url, init) => {
    assert.equal(
      String(url),
      'https://circleci.com/api/v2/project/github/org/repo/pipeline'
    );
    const payload = JSON.parse(String(init?.body || '{}'));
    assert.equal(payload.branch, 'main');
    assert.deepEqual(payload.parameters, { deploy: true });
  });
  const trigger = await client.triggerPipeline({
    project_slug: 'github/org/repo',
    branch: 'main',
    parameters: { deploy: true }
  });
  assert.equal(trigger.success, true, 'CircleCI pipeline trigger should succeed');

  mockFetch((url) => {
    assert.equal(
      String(url),
      'https://circleci.com/api/v2/pipeline/abc123/workflow?page-token=next'
    );
  });
  const workflows = await client.getWorkflows({ pipeline_id: 'abc123', page_token: 'next' });
  assert.equal(workflows.success, true, 'CircleCI workflows retrieval should succeed');
}

async function testJenkinsClient(): Promise<void> {
  const client = new JenkinsAPIClient({
    instanceUrl: 'https://jenkins.example.com',
    username: 'ci-bot',
    api_token: 'jenkins-secret'
  });

  mockFetch((url) => {
    assert.equal(String(url), 'https://jenkins.example.com/api/json');
  });
  const ping = await client.testConnection();
  assert.equal(ping.success, true, 'Jenkins test connection should succeed');

  mockFetch((url, init) => {
    assert.equal(
      String(url),
      'https://jenkins.example.com/job/backend/job/build/buildWithParameters'
    );
    const headers = headersToObject(init);
    assert.equal(headers['content-type'], 'application/x-www-form-urlencoded');
    assert.equal(String(init?.body), 'env=prod');
  }, { headers: { 'content-type': 'application/json' } });
  const build = await client.triggerBuild({
    job_name: 'backend/build',
    parameters: { env: 'prod' }
  });
  assert.equal(build.success, true, 'Jenkins build trigger should succeed');

  mockFetch((url, init) => {
    assert.equal(
      String(url),
      'https://jenkins.example.com/createItem?name=new-job&from=seed&mode=copy'
    );
    assert.equal(init?.method, 'POST');
  }, { headers: { 'content-type': 'application/json' } });
  const copy = await client.copyJob({ from_job: 'seed', to_job: 'new-job' });
  assert.equal(copy.success, true, 'Jenkins copy job should succeed');

  mockFetch((url) => {
    assert.equal(String(url), 'https://jenkins.example.com/queue/api/json');
  });
  const queue = await client.getQueue();
  assert.equal(queue.success, true, 'Jenkins queue retrieval should succeed');
}

await testAzureDevopsClient();
await testCircleCIClient();
await testJenkinsClient();

globalThis.fetch = originalFetch;

console.log('DevOps API clients integration smoke tests passed.');
