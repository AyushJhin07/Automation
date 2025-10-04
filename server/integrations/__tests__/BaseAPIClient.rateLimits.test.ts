import assert from 'node:assert/strict';

import type { APIResponse } from '../BaseAPIClient.js';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://localhost:5432/test-db';
process.env.ENCRYPTION_MASTER_KEY = process.env.ENCRYPTION_MASTER_KEY ?? 'a'.repeat(32);
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-jwt-secret';

const { BaseAPIClient } = await import('../BaseAPIClient.js');
const { rateLimiter } = await import('../RateLimiter.js');
const { getConnectorRateBudgetSnapshot, updateConnectorRateBudgetMetric } = await import(
  '../../observability/index.js'
);

type TestResponse = { ok: boolean };

class RateLimitTestClient extends BaseAPIClient {
  constructor(credentials: any) {
    super('https://example.com', credentials);
  }

  protected getAuthHeaders(): Record<string, string> {
    return {};
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return { success: true };
  }
}

async function testRetryAfterPenaltyScheduling(): Promise<void> {
  const originalAcquire = rateLimiter.acquire;
  const originalSchedule = rateLimiter.schedulePenalty;
  const originalFetch = global.fetch;
  const originalRandom = Math.random;

  let releaseCalls = 0;
  const scheduleCalls: Array<{ waitMs: number; connectorId: string }> = [];
  const now = Date.now();
  const resetSeconds = Math.floor(now / 1000) + 60;

  Math.random = () => 0.5;
  (rateLimiter as any).acquire = async () => ({
    waitMs: 0,
    attempts: 0,
    enforced: false,
    release: () => {
      releaseCalls += 1;
    },
  });
  (rateLimiter as any).schedulePenalty = (options: any) => {
    scheduleCalls.push({ waitMs: options.waitMs, connectorId: options.connectorId });
  };

  global.fetch = async () =>
    new Response('{"error":"rate"}', {
      status: 429,
      headers: {
        'retry-after': '2',
        'x-ratelimit-limit': '10',
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': String(resetSeconds),
      },
    });

  const client = new RateLimitTestClient({ __organizationId: 'org-1', __connectionId: 'conn-1' });
  client.setConnectorContext('test-connector', 'conn-1', {
    rateHeaders: {
      limit: ['x-ratelimit-limit'],
      remaining: ['x-ratelimit-remaining'],
      reset: ['x-ratelimit-reset'],
      retryAfter: ['retry-after'],
    },
  });

  const response = await client.get<TestResponse>('/throttle');
  assert.equal(response.success, false, '429 response should propagate as failure');
  assert.equal(releaseCalls, 1, 'rate limiter slot should be released');
  assert.equal(scheduleCalls.length, 1, 'penalty should be scheduled once');
  assert.equal(scheduleCalls[0]?.connectorId, 'test-connector');
  assert.equal(scheduleCalls[0]?.waitMs, 2000, 'retry-after should translate to 2s penalty with deterministic jitter');

  const metrics = getConnectorRateBudgetSnapshot();
  const budget = metrics.get('test-connector::conn-1::org-1');
  assert(budget, 'rate budget telemetry should be recorded');
  assert.equal(budget?.remaining, 0);
  assert.equal(budget?.limit, 10);
  assert(budget?.resetMs && budget.resetMs >= now, 'reset time should be in the future');

  updateConnectorRateBudgetMetric({ connectorId: 'test-connector', connectionId: 'conn-1', organizationId: 'org-1' });

  Math.random = originalRandom;
  (rateLimiter as any).acquire = originalAcquire;
  (rateLimiter as any).schedulePenalty = originalSchedule;
  if (originalFetch) {
    global.fetch = originalFetch;
  }
}

async function testWithRetriesHandlesBackoff(): Promise<void> {
  const originalAcquire = rateLimiter.acquire;
  const originalSchedule = rateLimiter.schedulePenalty;
  const originalFetch = global.fetch;
  const originalRandom = Math.random;

  const scheduleCalls: Array<{ waitMs: number }> = [];
  let releaseCalls = 0;
  let attempt = 0;

  Math.random = () => 0;
  (rateLimiter as any).acquire = async () => ({
    waitMs: 0,
    attempts: 0,
    enforced: false,
    release: () => {
      releaseCalls += 1;
    },
  });
  (rateLimiter as any).schedulePenalty = (options: any) => {
    scheduleCalls.push({ waitMs: options.waitMs });
  };

  global.fetch = async () => {
    attempt += 1;
    if (attempt === 1) {
      return new Response('{"error":"limit"}', {
        status: 429,
        headers: {
          'x-ratelimit-limit': '20',
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 30),
        },
      });
    }
    return new Response('{"ok":true}', {
      status: 200,
      headers: {
        'x-ratelimit-limit': '20',
        'x-ratelimit-remaining': '19',
        'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 30),
      },
    });
  };

  const client = new RateLimitTestClient({ __organizationId: 'org-1', __connectionId: 'conn-1' });
  client.setConnectorContext('test-connector', 'conn-1', {
    rateHeaders: {
      limit: ['x-ratelimit-limit'],
      remaining: ['x-ratelimit-remaining'],
      reset: ['x-ratelimit-reset'],
    },
  });

  const result = await client.withRetries(
    () => client.get<TestResponse>('/retry'),
    { retries: 1, initialDelayMs: 0, maxDelayMs: 0 }
  );

  assert.equal(result.success, true, 'withRetries should recover on second attempt');
  assert.equal(attempt, 2, 'two HTTP attempts should be made');
  assert.equal(scheduleCalls.length, 1, 'only the 429 should schedule a penalty');
  assert.equal(scheduleCalls[0]?.waitMs, 750, 'exponential backoff should respect jitter scaling');
  assert.equal(releaseCalls, 2, 'rate limiter slot should be released for each attempt');

  const metrics = getConnectorRateBudgetSnapshot();
  const budget = metrics.get('test-connector::conn-1::org-1');
  assert(budget, 'successful response should refresh telemetry');
  assert.equal(budget?.remaining, 19);
  assert.equal(budget?.limit, 20);

  updateConnectorRateBudgetMetric({ connectorId: 'test-connector', connectionId: 'conn-1', organizationId: 'org-1' });

  Math.random = originalRandom;
  (rateLimiter as any).acquire = originalAcquire;
  (rateLimiter as any).schedulePenalty = originalSchedule;
  if (originalFetch) {
    global.fetch = originalFetch;
  }
}

await testRetryAfterPenaltyScheduling();
await testWithRetriesHandlesBackoff();

console.log('BaseAPIClient rate limit middleware verified.');
