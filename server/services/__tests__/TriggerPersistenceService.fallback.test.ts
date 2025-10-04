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

async function runTriggerPersistenceFallbackIntegration(): Promise<void> {
  assert.equal(service.isDatabaseEnabled(), false, 'fallback mode should report database disabled');

  const webhookTrigger = {
    id: 'wh-1',
    workflowId: 'wf-1',
    appId: 'github',
    triggerId: 'issue.opened',
    endpoint: '/api/webhooks/wh-1',
    secret: 'secret',
    metadata: { createdBy: 'fallback-test' },
    isActive: true,
  } as const;

  await service.saveWebhookTrigger({ ...webhookTrigger });
  const webhooks = await service.loadWebhookTriggers();
  assert.equal(webhooks.length, 1, 'webhooks should be stored in memory');
  assert.equal(webhooks[0]?.id, 'wh-1');

  const pollingTrigger = {
    id: 'poll-1',
    workflowId: 'wf-1',
    appId: 'github',
    triggerId: 'issue.poll',
    interval: 300,
    nextPoll: new Date(Date.now() + 300_000),
    nextPollAt: new Date(Date.now() + 300_000),
    isActive: true,
    metadata: { interval: '5m' },
    cursor: { page: '1' },
    backoffCount: 1,
    lastStatus: 'error',
    region: 'us',
  } as const;

  await service.savePollingTrigger({ ...pollingTrigger });
  const polling = await service.loadPollingTriggers();
  assert.equal(polling.length, 1, 'polling triggers should be stored in memory');
  assert.equal(polling[0]?.id, 'poll-1');
  assert.deepEqual(polling[0]?.cursor, pollingTrigger.cursor);
  assert.equal(polling[0]?.backoffCount, pollingTrigger.backoffCount);
  assert.equal(polling[0]?.lastStatus, pollingTrigger.lastStatus);

  const lastPoll = new Date();
  const nextPoll = new Date(Date.now() + 600_000);
  await service.updatePollingRuntimeState('poll-1', {
    lastPoll,
    nextPollAt: nextPoll,
    cursor: { page: '2' },
    backoffCount: 2,
    lastStatus: 'success',
  });
  const updatedPolling = (await service.loadPollingTriggers())[0];
  assert.equal(updatedPolling?.lastPoll?.getTime(), lastPoll.getTime());
  assert.equal(updatedPolling?.nextPoll.getTime(), nextPoll.getTime());
  assert.equal(updatedPolling?.nextPollAt.getTime(), nextPoll.getTime());
  assert.deepEqual(updatedPolling?.cursor, { page: '2' });
  assert.equal(updatedPolling?.backoffCount, 2);
  assert.equal(updatedPolling?.lastStatus, 'success');

  await service.persistDedupeTokens('poll-1', ['token-1', 'token-2']);
  const dedupe = await service.loadDedupeTokens();
  assert.deepEqual(dedupe['poll-1'], ['token-1', 'token-2']);

  const eventId = await service.logWebhookEvent({
    webhookId: 'wh-1',
    workflowId: 'wf-1',
    appId: 'github',
    triggerId: 'issue.opened',
    payload: { hello: 'world' },
    headers: { 'x-test': '1' },
    timestamp: new Date(),
    processed: false,
    source: 'webhook',
  });

  assert.ok(eventId, 'webhook events should be stored in memory');

  await service.markWebhookEventProcessed(eventId, { success: true, executionId: 'exec-1' });
  const memoryStore = service.getInMemoryStoreForTests();
  const storedEvent = await memoryStore.getWebhookLog(eventId!);
  assert.ok(storedEvent?.processed, 'event should be marked processed');
  assert.equal(storedEvent?.executionId, 'exec-1');

  await service.deactivateTrigger('poll-1');
  const remainingPolling = await service.loadPollingTriggers();
  assert.equal(remainingPolling.length, 0, 'deactivated polling trigger should no longer be returned as active');

  const [persistedWebhook] = await service.loadWebhookTriggers();
  assert.equal(persistedWebhook?.isActive, true, 'webhook should remain active after polling trigger deactivation');
}

try {
  await runTriggerPersistenceFallbackIntegration();
  console.log('TriggerPersistenceService fallback integration test passed.');
  resetDatabaseAvailabilityOverrideForTests();
  process.exit(0);
} catch (error) {
  console.error('TriggerPersistenceService fallback integration test failed.', error);
  resetDatabaseAvailabilityOverrideForTests();
  process.exit(1);
}

