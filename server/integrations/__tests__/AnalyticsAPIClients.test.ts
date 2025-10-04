import assert from 'node:assert/strict';

import { PowerbiAPIClient } from '../PowerbiAPIClient.js';
import { TableauAPIClient } from '../TableauAPIClient.js';
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

async function testPowerbiListDatasets(): Promise<void> {
  const requests = useMockFetch([
    { body: '{"access_token":"access-token","token_type":"Bearer","expires_in":3600}' },
    { body: '{"value":[{"id":"dataset-1","name":"Sales"}]}' }
  ]);

  const client = new PowerbiAPIClient({
    tenantId: 'contoso',
    clientId: 'client',
    clientSecret: 'secret'
  });

  const response = await client.execute('get_datasets', { top: 5 });
  assert.equal(response.success, true, 'Listing datasets should succeed');

  assert.equal(requests.length, 2, 'Two requests expected (token + datasets)');

  const tokenRequest = requests[0];
  assert.equal(
    tokenRequest.url,
    'https://login.microsoftonline.com/contoso/oauth2/v2.0/token',
    'Token endpoint should target the configured tenant'
  );
  const encodedBody = (tokenRequest.init.body as URLSearchParams | string | undefined)?.toString() ?? '';
  assert.ok(
    encodedBody.includes('grant_type=client_credentials'),
    'Token request should use client_credentials grant'
  );
  assert.ok(encodedBody.includes('client_id=client'));
  assert.ok(encodedBody.includes('client_secret=secret'));
  assert.ok(encodedBody.includes(encodeURIComponent('https://analysis.windows.net/powerbi/api/.default')));

  const datasetRequest = requests[1];
  assert.equal(
    datasetRequest.url,
    'https://api.powerbi.com/v1.0/myorg/datasets?$top=5',
    'Dataset request should target the myorg collection with $top applied'
  );
  assert.equal(datasetRequest.init.method ?? 'GET', 'GET');
  assert.equal(
    datasetRequest.init.headers?.['Authorization'],
    'Bearer access-token',
    'Dataset request should include the acquired access token'
  );

  const resultData = (response as APIResponse<any>).data;
  assert.ok(Array.isArray(resultData?.value));
  assert.equal(resultData.value[0].id, 'dataset-1');
}

async function testPowerbiRefreshPolling(): Promise<void> {
  const location = 'https://api.powerbi.com/v1.0/myorg/datasets/dataset-123/refreshes/refresh-123';
  const requests = useMockFetch([
    { body: '{"access_token":"access-token","token_type":"Bearer","expires_in":3600}' },
    { status: 202, headers: { Location: location }, body: '' },
    { body: '{"status":"InProgress"}' },
    { body: '{"status":"Completed","id":"refresh-123","refreshType":"Full"}' }
  ]);

  const client = new PowerbiAPIClient({
    tenantId: 'contoso',
    clientId: 'client',
    clientSecret: 'secret'
  });

  const response = await client.execute('trigger_refresh', {
    datasetId: 'dataset-123',
    pollIntervalSeconds: 0,
    waitForCompletion: true
  });

  assert.equal(response.success, true, 'Refresh operation should succeed');
  assert.equal((response.data as any).status, 'Completed', 'Final status should be Completed');
  assert.equal((response.data as any).refreshId, 'refresh-123');

  assert.equal(requests.length, 4, 'Token, trigger, and two polling requests expected');
  const refreshRequest = requests[1];
  assert.equal(
    refreshRequest.url,
    'https://api.powerbi.com/v1.0/myorg/datasets/dataset-123/refreshes',
    'Refresh trigger should target the dataset refreshes endpoint'
  );
  assert.equal(refreshRequest.init.method ?? 'POST', 'POST');

  const pollRequestOne = requests[2];
  const pollRequestTwo = requests[3];
  assert.equal(pollRequestOne.url, location);
  assert.equal(pollRequestTwo.url, location);
}

async function testTableauPatAuthentication(): Promise<void> {
  const requests = useMockFetch([
    { body: '{"credentials":{"token":"tableau-token","site":{"id":"site-123","contentUrl":"default"}}}' },
    { body: '{"sites":{"site":[{"id":"site-123"}]}}' }
  ]);

  const client = new TableauAPIClient({
    serverUrl: 'https://example.online.tableau.com',
    personalAccessTokenName: 'smoke-pat',
    personalAccessTokenSecret: 'secret',
    siteContentUrl: 'default'
  } as any);

  const response = await client.execute('test_connection', {});
  assert.equal(response.success, true, 'Test connection should succeed with PAT credentials');

  assert.equal(requests.length, 2, 'Sign-in and sites listing requests expected');

  const signInRequest = requests[0];
  assert.equal(
    signInRequest.url,
    'https://example.online.tableau.com/api/3.22/auth/signin',
    'Sign-in should target the REST auth endpoint'
  );
  const signInBody = JSON.parse((signInRequest.init.body as string | undefined) ?? '{}');
  assert.equal(signInBody.credentials.personalAccessTokenName, 'smoke-pat');
  assert.equal(signInBody.credentials.personalAccessTokenSecret, 'secret');
  assert.equal(signInBody.credentials.site.contentUrl, 'default');

  const sitesRequest = requests[1];
  assert.equal(sitesRequest.url, 'https://example.online.tableau.com/api/3.22/sites');
  assert.equal(
    sitesRequest.init.headers?.['X-Tableau-Auth'],
    'tableau-token',
    'Authenticated requests should include the Tableau session token'
  );
}

async function testTableauListWorkbooksTargetsSite(): Promise<void> {
  const requests = useMockFetch([
    { body: '{"workbooks":{"workbook":[]}}' }
  ]);

  const client = new TableauAPIClient({
    serverUrl: 'https://example.online.tableau.com',
    accessToken: 'existing-token',
    siteId: 'site-xyz'
  } as any);

  const response = await client.execute('get_workbooks', {
    pageSize: 5,
    pageNumber: 2,
    filter: 'owner:eq:me'
  });

  assert.equal(response.success, true, 'Listing workbooks should succeed');
  assert.equal(requests.length, 1, 'Only the workbook request should be issued');

  const workbookRequest = requests[0];
  assert.equal(
    workbookRequest.url,
    'https://example.online.tableau.com/api/3.22/sites/site-xyz/workbooks?pageSize=5&pageNumber=2&filter=owner%3Aeq%3Ame',
    'Workbook listing should target the site-scoped endpoint with pagination parameters'
  );
  assert.equal(
    workbookRequest.init.headers?.['X-Tableau-Auth'],
    'existing-token',
    'Workbook listing should include the provided access token'
  );
}

try {
  await testPowerbiListDatasets();
  await testPowerbiRefreshPolling();
  await testTableauPatAuthentication();
  await testTableauListWorkbooksTargetsSite();
  console.log('Analytics API clients integration smoke tests passed.');
} finally {
  global.fetch = originalFetch;
}
