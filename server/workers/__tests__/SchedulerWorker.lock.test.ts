import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.QUEUE_DRIVER = 'inmemory';

const { SchedulerLockService, setSchedulerLockServiceForTests, resetSchedulerLockServiceForTests } =
  await import('../../services/SchedulerLockService.js');
const { triggerPersistenceService } = await import('../../services/TriggerPersistenceService.js');
const { runSchedulerCycleWithLock } = await import('../scheduler.js');

test('scheduler lock ensures only one worker runs a polling cycle at a time', async (t) => {
  const lockService = new SchedulerLockService({ strategy: 'memory' });
  setSchedulerLockServiceForTests(lockService);

  t.after(async () => {
    await lockService.shutdown();
    resetSchedulerLockServiceForTests();
  });

  const originalClaim = triggerPersistenceService.claimDuePollingTriggers;

  let concurrentCalls = 0;
  let maxConcurrent = 0;
  let invocationCount = 0;

  triggerPersistenceService.claimDuePollingTriggers = (async () => {
    invocationCount += 1;
    concurrentCalls += 1;
    maxConcurrent = Math.max(maxConcurrent, concurrentCalls);
    await sleep(50);
    concurrentCalls -= 1;
    return [];
  }) as typeof triggerPersistenceService.claimDuePollingTriggers;

  t.after(() => {
    triggerPersistenceService.claimDuePollingTriggers = originalClaim;
  });

  const [resultA, resultB] = await Promise.all([
    runSchedulerCycleWithLock(5, 25),
    runSchedulerCycleWithLock(5, 25),
  ]);

  assert.equal(invocationCount, 1, 'only one scheduler cycle should claim triggers');
  assert.equal(maxConcurrent, 1, 'polling trigger claims should not overlap');
  assert.equal((resultA ? 1 : 0) + (resultB ? 1 : 0), 1, 'exactly one worker should execute the cycle');
});
