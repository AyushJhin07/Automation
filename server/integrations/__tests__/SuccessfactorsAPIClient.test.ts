import assert from 'node:assert/strict';

import { SuccessfactorsAPIClient } from '../SuccessfactorsAPIClient.js';

interface MockResponse {
  status?: number;
  body?: string;
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
    const url = typeof input === 'string' ? input : input.toString();
    requests.push({ url, init: init ?? {} });
    const status = current.status ?? 200;
    const body = current.body ?? '{}';
    const headers = current.headers ?? { 'Content-Type': 'application/json' };
    return new Response(body, { status, headers });
  }) as typeof fetch;

  return requests;
}

async function testListEmployeesAppliesFiltersAndSchema(): Promise<void> {
  const payload = {
    d: {
      results: [
        {
          personIdExternal: '1000',
          userId: '1000',
          personalInfoNav: {
            results: [
              { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' }
            ]
          },
          employmentNav: {
            results: [
              {
                jobTitle: 'Engineer',
                department: 'R&D',
                managerId: 'M-1',
                hireDate: '2024-01-02',
                lastModifiedDateTime: '2024-02-03T04:05:06Z'
              }
            ]
          }
        }
      ],
      __next: 'https://api4.successfactors.com/odata/v2/PerPerson?$skiptoken=NEXT123',
      __delta: 'https://api4.successfactors.com/odata/v2/PerPerson?$deltatoken=DELTA456'
    }
  };

  const requests = useMockFetch([{ body: JSON.stringify(payload) }]);

  const client = new SuccessfactorsAPIClient({
    accessToken: 'token',
    companyId: 'ACME_CO',
    datacenter: 'api4'
  });

  const response = await client.listEmployees({ filter: "userId eq '1000'", top: 25 });
  assert.equal(response.success, true, 'listEmployees should succeed');
  assert.ok(response.data, 'listEmployees should return data');
  assert.equal(response.data?.employees[0]?.userId, '1000');
  assert.equal(response.data?.employees[0]?.firstName, 'Ada');
  assert.equal(response.data?.nextSkipToken, 'NEXT123');
  assert.equal(response.data?.nextDeltaToken, 'DELTA456');

  assert.equal(requests.length, 1);
  const request = requests[0];
  const url = new URL(request.url);
  assert.equal(url.pathname.endsWith('/PerPerson'), true);
  assert.equal(url.searchParams.get('companyId'), 'ACME_CO');
  assert.equal(url.searchParams.get('$filter'), "userId eq '1000'");
  assert.equal(url.searchParams.get('$top'), '25');
  assert.equal(url.searchParams.get('$format'), 'json');
  assert.equal(url.searchParams.get('$expand'), 'employmentNav,personalInfoNav,personNav');
  assert.equal(request.init.headers?.['CompanyID'], 'ACME_CO');
}

async function testListEmployeesDeltaQuery(): Promise<void> {
  const requests = useMockFetch([{ body: JSON.stringify({ d: { results: [] } }) }]);
  const client = new SuccessfactorsAPIClient({ accessToken: 'token', companyId: 'ACME', datacenter: 'api4' });

  await client.listEmployees({ deltaToken: 'DELTA123' });

  assert.equal(requests.length, 1);
  const request = requests[0];
  assert.ok(request.url.includes('/PerPerson/delta'));
  const url = new URL(request.url);
  assert.equal(url.searchParams.get('$deltatoken'), 'DELTA123');
  assert.equal(url.searchParams.get('companyId'), 'ACME');
}

async function testGetEmployeeExpandsNavigation(): Promise<void> {
  const payload = {
    d: {
      personIdExternal: '2000',
      userId: '2000',
      personalInfoNav: { results: [{ firstName: 'Grace', lastName: 'Hopper', email: 'grace@example.com' }] },
      employmentNav: { results: [{ jobTitle: 'Commodore', department: 'Navy' }] }
    }
  };

  const requests = useMockFetch([{ body: JSON.stringify(payload) }]);
  const client = new SuccessfactorsAPIClient({ accessToken: 'token', companyId: 'FLEET', datacenter: 'api4' });

  const response = await client.getEmployee({ userId: '2000' });
  assert.equal(response.success, true);
  assert.equal(response.data?.firstName, 'Grace');
  assert.equal(response.data?.jobTitle, 'Commodore');

  const request = requests[0];
  assert.ok(request.url.includes("$expand=employmentNav,personalInfoNav,personNav"));
  assert.ok(request.url.includes("PerPerson('2000')"));
}

async function testCreateEmployeePayload(): Promise<void> {
  const payload = {
    d: {
      personIdExternal: '3000',
      userId: '3000'
    }
  };

  const requests = useMockFetch([{ body: JSON.stringify(payload) }]);
  const client = new SuccessfactorsAPIClient({ accessToken: 'token', companyId: 'ACME', datacenter: 'api4' });

  const result = await client.createEmployee({
    userId: '3000',
    personalInfo: { firstName: 'Alan' },
    employmentInfo: { jobTitle: 'Researcher' }
  });

  assert.equal(result.success, true);

  const request = requests[0];
  assert.equal(request.init.method, 'POST');
  const body = JSON.parse(request.init.body as string);
  assert.equal(body.personIdExternal, '3000');
  assert.ok(Array.isArray(body.personalInfoNav.results));
  assert.ok(Array.isArray(body.employmentNav.results));
}

async function testUpdateEmployeePayloadAndValidation(): Promise<void> {
  const requests = useMockFetch([{ body: JSON.stringify({ d: { personIdExternal: '4000', userId: '4000' } }) }]);
  const client = new SuccessfactorsAPIClient({ accessToken: 'token', companyId: 'ACME', datacenter: 'api4' });

  const result = await client.updateEmployee({ userId: '4000', updates: { jobTitle: 'Director' } });
  assert.equal(result.success, true);

  const request = requests[0];
  assert.equal(request.init.method, 'PATCH');
  assert.ok(request.url.includes("PerPerson('4000')"));
}

async function testSchemaValidationFailure(): Promise<void> {
  const payload = { d: { results: [{ userId: 'missing-person-id' }] } };
  useMockFetch([{ body: JSON.stringify(payload) }]);
  const client = new SuccessfactorsAPIClient({ accessToken: 'token', companyId: 'ACME', datacenter: 'api4' });

  const response = await client.listEmployees();
  assert.equal(response.success, false, 'listEmployees should fail when schema validation fails');
  assert.ok((response.error || '').includes('missing required identifiers'));
}

await testListEmployeesAppliesFiltersAndSchema();
await testListEmployeesDeltaQuery();
await testGetEmployeeExpandsNavigation();
await testCreateEmployeePayload();
await testUpdateEmployeePayloadAndValidation();
await testSchemaValidationFailure();

global.fetch = originalFetch;

console.log('SuccessFactors API client verified.');
