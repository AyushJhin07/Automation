import { env } from '../env';
import { executionQueueService } from '../services/ExecutionQueueService.js';
import { triggerPersistenceService } from '../services/TriggerPersistenceService.js';
import { WebhookManager } from '../webhooks/WebhookManager.js';
import type { OrganizationRegion } from '../database/schema.js';
import { getSchedulerLockService } from '../services/SchedulerLockService.js';
import {
  recordCrossRegionViolation,
  recordSchedulerLockAcquired,
  recordSchedulerLockSkipped,
} from '../observability/index.js';

const DEFAULT_INTERVAL_MS = 5000;
const DEFAULT_BATCH_SIZE = 25;

function resolveWorkerRegion(): OrganizationRegion {
  const raw = (process.env.DATA_RESIDENCY_REGION ?? 'us').toLowerCase();
  const allowed: OrganizationRegion[] = ['us', 'eu', 'apac'];
  if ((allowed as string[]).includes(raw)) {
    return raw as OrganizationRegion;
  }
  if (raw && raw !== 'us') {
    console.warn(`⚠️ Unrecognized DATA_RESIDENCY_REGION="${raw}" for scheduler worker. Falling back to "us".`);
  }
  return 'us';
}

const WORKER_REGION = resolveWorkerRegion();

export async function runSchedulerCycle(batchSize: number): Promise<void> {
  const now = new Date();
  const dueTriggers = await triggerPersistenceService.claimDuePollingTriggers({
    limit: batchSize,
    now,
    region: WORKER_REGION,
  });

  if (dueTriggers.length === 0) {
    return;
  }

  console.log(
    `⏱️ Scheduler claimed ${dueTriggers.length} polling trigger(s) at ${now.toISOString()} for region ${WORKER_REGION}`
  );

  const manager = WebhookManager.getInstance();
  for (const trigger of dueTriggers) {
    try {
      if (trigger.region && trigger.region !== WORKER_REGION) {
        recordCrossRegionViolation({
          subsystem: 'scheduler',
          expectedRegion: WORKER_REGION,
          actualRegion: trigger.region,
          identifier: trigger.id,
        });
        throw new Error(
          `Scheduler region mismatch for trigger ${trigger.id}: expected ${WORKER_REGION}, received ${trigger.region}`
        );
      }

      await manager.runPollingTrigger(trigger);
    } catch (error) {
      console.error(
        `❌ Scheduler failed to run polling trigger ${trigger.id}:`,
        error instanceof Error ? error.message : error
      );
    }
  }
}

const LOCK_RESOURCE = `polling-scheduler:${WORKER_REGION}`;

function resolveLockTtl(intervalMs: number): number {
  const minimumTtl = 30_000;
  const bufferMs = Math.max(5_000, intervalMs);
  return Math.max(minimumTtl, intervalMs + bufferMs);
}

export async function runSchedulerCycleWithLock(batchSize: number, intervalMs: number): Promise<boolean> {
  const lockService = getSchedulerLockService();
  const preferredStrategy = lockService.getPreferredStrategy();
  const lock = await lockService.acquireLock(LOCK_RESOURCE, { ttlMs: resolveLockTtl(intervalMs) });

  if (!lock) {
    recordSchedulerLockSkipped({
      resource: LOCK_RESOURCE,
      region: WORKER_REGION,
      strategy: preferredStrategy,
    });
    console.warn('[Scheduler] Lock contention detected, skipping cycle', {
      resource: LOCK_RESOURCE,
      region: WORKER_REGION,
      workerPid: process.pid,
      strategy: preferredStrategy,
    });
    return false;
  }

  recordSchedulerLockAcquired({
    resource: LOCK_RESOURCE,
    region: WORKER_REGION,
    strategy: lock.mode,
  });

  try {
    await runSchedulerCycle(batchSize);
    return true;
  } finally {
    try {
      await lock.release();
    } catch (error) {
      console.error('❌ Failed to release scheduler lock', {
        resource: LOCK_RESOURCE,
        error,
      });
    }
  }
}

async function main(): Promise<void> {
  console.log(`🕒 Starting polling scheduler worker (region=${WORKER_REGION})`);
  console.log('🌍 Worker environment:', env.NODE_ENV);

  WebhookManager.configureQueueService(executionQueueService);

  const intervalMs = Math.max(1000, Number.parseInt(process.env.TRIGGER_SCHEDULER_INTERVAL_MS ?? `${DEFAULT_INTERVAL_MS}`, 10));
  const batchSize = Math.max(1, Number.parseInt(process.env.TRIGGER_SCHEDULER_BATCH_SIZE ?? `${DEFAULT_BATCH_SIZE}`, 10));

  if (!triggerPersistenceService.isDatabaseEnabled()) {
    console.warn('⚠️ Trigger scheduler requires database persistence; falling back to in-memory scheduling.');
  }

  let timer: NodeJS.Timeout | null = null;
  let shuttingDown = false;
  let runningCycle: Promise<void> | null = null;
  let resolveShutdown: (() => void) | null = null;

  const waitForShutdown = new Promise<void>((resolve) => {
    resolveShutdown = resolve;
  });

  const scheduleNext = () => {
    if (shuttingDown) {
      return;
    }
    timer = setTimeout(async () => {
      if (runningCycle) {
        try {
          await runningCycle;
        } catch (error) {
          console.error('❌ Scheduler cycle error:', error);
        }
      }

      runningCycle = runSchedulerCycleWithLock(batchSize, intervalMs)
        .catch((error) => {
          console.error('❌ Scheduler cycle execution error:', error);
        })
        .then(() => undefined);

      try {
        await runningCycle;
      } finally {
        runningCycle = null;
        scheduleNext();
      }
    }, intervalMs);
  };

  runningCycle = runSchedulerCycleWithLock(batchSize, intervalMs)
    .catch((error) => {
      console.error('❌ Initial scheduler cycle failed:', error);
    })
    .then(() => undefined);

  await runningCycle;
  runningCycle = null;
  scheduleNext();

  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    console.log(`⚙️ Received ${signal}. Shutting down scheduler worker...`);

    if (timer) {
      clearTimeout(timer);
      timer = null;
    }

    if (runningCycle) {
      try {
        await runningCycle;
      } catch (error) {
        console.error('❌ Scheduler cycle error during shutdown:', error);
      } finally {
        runningCycle = null;
      }
    }

    resolveShutdown?.();
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  process.on('unhandledRejection', (reason) => {
    console.error('❌ Unhandled rejection in scheduler worker:', reason);
  });

  process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught exception in scheduler worker:', error);
  });

  console.log('🗓️ Polling scheduler worker is running.');
  await waitForShutdown;
  console.log('👋 Scheduler worker has stopped.');
}

if (process.env.NODE_ENV !== 'test') {
  void main().catch((error) => {
    console.error('Failed to start scheduler worker:', error);
    process.exit(1);
  });
}
