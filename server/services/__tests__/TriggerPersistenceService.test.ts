import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = '';

const {
  setDatabaseAvailabilityForTests,
  resetDatabaseAvailabilityOverrideForTests,
} = await import('../../database/status.js');

setDatabaseAvailabilityForTests(false);

const { TriggerPersistenceService } = await import('../TriggerPersistenceService.js');

TriggerPersistenceService.resetForTests();

const service = TriggerPersistenceService.getInstance();

async function runTriggerPersistenceUnitTests(): Promise<void> {
  const baseInterval = 60;
  assert.equal(
    service.computePollingIntervalWithBackoff(baseInterval, 0),
    baseInterval,
    'backoff should return base interval for zero attempts'
  );
  assert.equal(
    service.computePollingIntervalWithBackoff(baseInterval, 2),
    baseInterval * 4,
    'backoff should double the interval per attempt'
  );
  assert.equal(
    service.computePollingIntervalWithBackoff(30, 6, { maxIntervalSeconds: 300 }),
    300,
    'backoff should respect configured maximum interval'
  );

  const ttlNow = new Date('2024-01-02T00:00:00.000Z');
  const tokens = ['a', 'b'];
  const freshTokens = service.applyDedupeTokenTTL(tokens, new Date(ttlNow.getTime() - 1_000), {
    now: ttlNow,
    ttlMs: TriggerPersistenceService.DEFAULT_DEDUPE_TOKEN_TTL_MS,
  });
  assert.deepEqual(freshTokens, tokens, 'fresh dedupe tokens should be preserved');

  const expiredTokens = service.applyDedupeTokenTTL(tokens, new Date(ttlNow.getTime() - 48 * 60 * 60 * 1_000), {
    now: ttlNow,
    ttlMs: TriggerPersistenceService.DEFAULT_DEDUPE_TOKEN_TTL_MS,
  });
  assert.equal(expiredTokens.length, 0, 'dedupe tokens past TTL should expire');

  const now = new Date();
  const dueAt = new Date(now.getTime() - 5_000);
  const pollingTrigger = {
    id: 'poll-unit-1',
    workflowId: 'wf-unit-1',
    appId: 'demo-app',
    triggerId: 'poll.trigger',
    interval: 45,
    nextPoll: dueAt,
  nextPollAt: dueAt,
  isActive: true,
  metadata: { scenario: 'unit-test' },
  cursor: { page: '1' },
  backoffCount: 3,
  lastStatus: 'error',
  region: 'us',
} as const;

  await service.savePollingTrigger({ ...pollingTrigger });
  const [stored] = await service.loadPollingTriggers();
  assert.ok(stored, 'polling trigger should be persisted');
  assert.deepEqual(stored?.cursor, pollingTrigger.cursor, 'cursor should be round-tripped');
  assert.equal(stored?.backoffCount, pollingTrigger.backoffCount, 'backoff count should persist');
  assert.equal(stored?.lastStatus, pollingTrigger.lastStatus, 'last status should persist');

  const claimed = await service.claimDuePollingTriggers({ now, limit: 1, region: 'us' });
  assert.equal(claimed.length, 1, 'due polling trigger should be claimed');

  const expectedIntervalSeconds = service.computePollingIntervalWithBackoff(
    pollingTrigger.interval,
    pollingTrigger.backoffCount
  );
  const expectedNextRun = new Date(now.getTime() + expectedIntervalSeconds * 1_000);

  const [claimedTrigger] = claimed;
  assert.ok(claimedTrigger, 'claimed trigger should be returned');
  assert.equal(
    claimedTrigger.nextPollAt.getTime(),
    expectedNextRun.getTime(),
    'claimed trigger should schedule next poll using backoff interval'
  );

  const [rehydrated] = await service.loadPollingTriggers();
  assert.equal(
    rehydrated?.nextPollAt.getTime(),
    expectedNextRun.getTime(),
    'persisted trigger next poll should be updated'
  );
}

try {
  await runTriggerPersistenceUnitTests();
  console.log('TriggerPersistenceService unit tests passed.');
  resetDatabaseAvailabilityOverrideForTests();
  process.exit(0);
} catch (error) {
  console.error('TriggerPersistenceService unit tests failed.', error);
  resetDatabaseAvailabilityOverrideForTests();
  process.exit(1);
}
