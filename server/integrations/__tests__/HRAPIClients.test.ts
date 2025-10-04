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

function toHeaderMap(headers: HeadersInit | undefined): Map<string, string> {
  const entries: Array<[string, string]> = [];

  if (!headers) {
    return new Map();
  }

  if (headers instanceof Headers) {
    for (const [key, value] of headers.entries()) {
      entries.push([key, value]);
    }
  } else if (Array.isArray(headers)) {
    for (const [key, value] of headers) {
      entries.push([key, value]);
    }
  } else {
    for (const [key, value] of Object.entries(headers)) {
      entries.push([key, Array.isArray(value) ? value.join(', ') : String(value)]);
    }
  }

  const normalized = new Map<string, string>();
  for (const [key, value] of entries) {
    normalized.set(key.toLowerCase(), value);
  }

  return normalized;
}

function useMockFetch(sequence: MockResponse[]): RecordedRequest[] {
  const requests: RecordedRequest[] = [];
  let index = 0;

  global.fetch = (async (input: any, init?: RequestInit): Promise<Response> => {
    const current = sequence[Math.min(index, sequence.length - 1)] ?? {};
    index += 1;

    const url = typeof input === 'string' ? input : input.toString();
    const requestInit: RequestInit = init ? { ...init } : {};
    requests.push({ url, init: requestInit });

    const status = current.status ?? 200;
    const body = current.body ?? '{}';
    const headers = current.headers ?? { 'Content-Type': 'application/json' };

    return new Response(body, { status, headers });
  }) as typeof fetch;

  return requests;
}

async function testAdpRunPayrollHandlesTokenExchange(): Promise<void> {
  const tenantPayload = { organizationOID: 'ORG123', tenantId: 'TENANT42' };
  const encodedContext = Buffer.from(JSON.stringify(tenantPayload)).toString('base64');

  const requests = useMockFetch([
    {
      body: JSON.stringify({
        access_token: 'adp-access-token',
        expires_in: 3600,
        scope: 'api://api.adp.com/hr.worker-management.worker.write',
        token_type: 'Bearer',
        tenantContext: tenantPayload
      }),
      headers: {
        'content-type': 'application/json',
        'adp-context': encodedContext,
        'adp-ctx-tenant-id': 'TENANT42'
      }
    },
    {
      status: 202,
      body: JSON.stringify({
        events: [
          {
            eventCorrelationId: 'corr-123'
          }
        ]
      }),
      headers: {
        'content-type': 'application/json',
        'event-correlation-id': 'corr-123',
        location: 'https://api.adp.com/events/payroll/v1/polling/corr-123'
      }
    }
  ]);

  const client = new AdpAPIClient({
    clientId: 'client-id',
    clientSecret: 'client-secret'
  });

  const response: APIResponse<any> = await client.runPayroll({
    payrollGroupId: 'PAYROLL-01',
    payPeriodStart: '2024-01-01',
    payPeriodEnd: '2024-01-15'
  });

  assert.equal(response.success, true, 'runPayroll should succeed with simulated response');
  assert.equal(requests.length, 2, 'Token exchange and payroll request should both execute');

  const tokenHeaders = toHeaderMap(requests[0].init.headers);
  const payrollHeaders = toHeaderMap(requests[1].init.headers);

  assert.equal(
    tokenHeaders.get('authorization'),
    `Basic ${Buffer.from('client-id:client-secret').toString('base64')}`,
    'Token request should include client credentials'
  );

  assert.equal(
    payrollHeaders.get('adp-context'),
    encodedContext,
    'Payroll request should include the ADP tenant context header'
  );

  assert.equal(
    payrollHeaders.get('adp-application-key'),
    'client-id',
    'Payroll request should include the ADP application key header'
  );

  const payload = JSON.parse(requests[1].init.body as string);
  assert.equal(payload.events?.[0]?.eventContext?.payrollGroupCode?.codeValue, 'PAYROLL-01');
  assert.equal(payload.events?.[0]?.eventContext?.payrollPeriod?.startDate, '2024-01-01');
  assert.equal(payload.events?.[0]?.eventContext?.payrollPeriod?.endDate, '2024-01-15');

  const webhook = response.data?.webhook;
  assert.ok(webhook, 'Response should include webhook metadata');
  assert.equal(webhook.correlationId, 'corr-123');
  assert.equal(webhook.pollingUrl, 'https://api.adp.com/events/payroll/v1/polling/corr-123');
  assert.equal(webhook.tenantContext?.tenantId, 'TENANT42');
  assert.equal(webhook.tenantContext?.organizationId, 'ORG123');
}

await testAdpRunPayrollHandlesTokenExchange();

global.fetch = originalFetch;

console.log('HR API clients verified.');
