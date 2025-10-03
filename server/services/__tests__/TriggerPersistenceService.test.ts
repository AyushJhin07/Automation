import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = '';

const {
  setDatabaseAvailabilityForTests,
  resetDatabaseAvailabilityOverrideForTests,
} = await import('../../database/status.js');

setDatabaseAvailabilityForTests(false);

const { TriggerPersistenceService } = await import('../TriggerPersistenceService.js');

async function withService(
  callback: (service: InstanceType<typeof TriggerPersistenceService>) => Promise<void>,
): Promise<void> {
  TriggerPersistenceService.resetForTests();
  const service = TriggerPersistenceService.getInstance();
  await callback(service);
}

async function testExtendedPollingFields(): Promise<void> {
  await withService(async (service) => {
    const now = new Date('2024-01-01T00:00:00.000Z');
    const triggerId = 'poll-extended';
    const trigger = {
      id: triggerId,
      workflowId: 'wf-extended',
      appId: 'github',
      triggerId: 'issue.poll',
      interval: 120,
      lastPoll: now,
      nextPoll: new Date(now.getTime() + 120_000),
      isActive: true,
      metadata: { createdBy: 'unit-test' },
      cursor: { page: 1 },
      backoffCount: 2,
      lastStatus: 'success',
    } as const;

    await service.savePollingTrigger({ ...trigger });

    let [persisted] = await service.loadPollingTriggers();
    assert.equal(persisted?.cursor?.page, 1, 'cursor should be persisted');
    assert.equal(persisted?.backoffCount, 2, 'backoff count should be persisted');
    assert.equal(persisted?.lastStatus, 'success', 'last status should be persisted');

    const nextPoll = new Date(now.getTime() + 300_000);
    await service.updatePollingRuntimeState(triggerId, now, nextPoll, {
      cursor: { page: 2, offset: 50 },
      backoffCount: 3,
      lastStatus: 'rate_limited',
    });

    [persisted] = await service.loadPollingTriggers();
    assert.equal(persisted?.cursor?.page, 2, 'cursor should be updated from runtime state');
    assert.equal(persisted?.backoffCount, 3, 'backoff count should update in runtime state');
    assert.equal(persisted?.lastStatus, 'rate_limited', 'last status should update in runtime state');
    assert.equal(
      persisted?.nextPoll.getTime(),
      nextPoll.getTime(),
      'next poll timestamp should update from runtime state',
    );
  });
}

async function testBackoffHelpers(): Promise<void> {
  await withService(async (service) => {
    const defaultBackoff = service.calculateNextBackoffIntervalSeconds(60, 2);
    assert.equal(defaultBackoff, 240, 'default exponential backoff should double per attempt');

    const cappedBackoff = service.calculateNextBackoffIntervalSeconds(60, 5, { maxIntervalSeconds: 600 });
    assert.equal(cappedBackoff, 600, 'backoff should cap at provided maximum');

    const baseTime = new Date('2024-01-01T00:00:00.000Z');
    const nextTime = service.getNextPollDateWithBackoff(30, 1, { multiplier: 3, now: baseTime });
    assert.equal(
      nextTime.getTime(),
      baseTime.getTime() + 90_000,
      'next poll time should add the computed backoff interval',
    );
  });
}

async function testDedupeTokenTtl(): Promise<void> {
  await withService(async (service) => {
    const triggerId = 'poll-ttl';
    const now = new Date('2024-01-01T00:00:00.000Z');

    await service.persistDedupeTokens(triggerId, ['token-a', 'token-b'], { ttlMs: 1000, now });

    const originalNow = Date.now;
    try {
      Date.now = () => now.getTime() + 500;
      let dedupe = await service.loadDedupeTokens();
      assert.deepEqual(
        dedupe[triggerId],
        ['token-a', 'token-b'],
        'tokens should be available before TTL expires',
      );

      Date.now = () => now.getTime() + 2_000;
      dedupe = await service.loadDedupeTokens();
      assert.ok(!dedupe[triggerId] || dedupe[triggerId].length === 0, 'tokens should expire after TTL');

      const memoryStore = service.getInMemoryStoreForTests();
      const memoryTokens = await memoryStore.getDedupeTokens();
      assert.ok(!memoryTokens[triggerId] || memoryTokens[triggerId].length === 0, 'memory store should prune expired tokens');
    } finally {
      Date.now = originalNow;
    }
  });
}

async function run(): Promise<void> {
  await testExtendedPollingFields();
  await testBackoffHelpers();
  await testDedupeTokenTtl();
}

try {
  await run();
  console.log('TriggerPersistenceService unit tests passed.');
  resetDatabaseAvailabilityOverrideForTests();
  process.exit(0);
} catch (error) {
  console.error('TriggerPersistenceService unit tests failed.', error);
  resetDatabaseAvailabilityOverrideForTests();
  process.exit(1);
}
