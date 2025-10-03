import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.QUEUE_DRIVER = 'inmemory';

const { createQueue } = await import('../../queue/index.js');
const { registerQueueWorker } = await import('../queueWorker.js');

async function waitFor(predicate: () => boolean | Promise<boolean>, timeoutMs = 2000, intervalMs = 25) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) {
      return;
    }
    await sleep(intervalMs);
  }
  throw new Error('Timed out waiting for condition to be satisfied');
}

test('execution worker retries cleanly when heartbeat lock renewal fails', async (t) => {
  const queueName = `worker.failure.${Date.now()}`;
  const queue = createQueue(queueName, {
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: 'execution-backoff' },
    },
  });

  const attempts: number[] = [];
  const committedExecutions: string[] = [];
  let extendLockCalls = 0;

  const worker = registerQueueWorker(queueName, async (job) => {
    attempts.push(job.attemptsMade);

    if (job.attemptsMade === 0) {
      await sleep(50);
      return 'first-attempt-crash';
    }

    await sleep(10);
    committedExecutions.push(`attempt-${job.attemptsMade}`);
    return 'success';
  }, {
    concurrency: 1,
    lockDuration: 50,
    lockRenewTime: 10,
    heartbeatIntervalMs: 5,
    heartbeatTimeoutMs: 20,
  });

  t.after(async () => {
    await worker.close();
    await queue.close();
  });

  (worker as any).extendLock = async () => {
    extendLockCalls += 1;
    if (extendLockCalls === 1) {
      throw new Error('simulated worker crash');
    }
  };

  await queue.add(queueName, { value: 'example' }, { attempts: 2 });

  await waitFor(() => committedExecutions.length === 1 && attempts.length >= 2);

  assert.deepEqual(attempts, [0, 1]);
  assert.equal(committedExecutions.length, 1, 'side effects should only commit once');
  assert.ok(extendLockCalls >= 2, 'extendLock should be invoked on each heartbeat');
});
