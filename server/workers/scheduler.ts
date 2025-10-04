import { env } from '../env';
import { executionQueueService } from '../services/ExecutionQueueService.js';
import { triggerPersistenceService } from '../services/TriggerPersistenceService.js';
import { WebhookManager } from '../webhooks/WebhookManager.js';
import { resolveWorkerRegion } from '../utils/region.js';

const DEFAULT_INTERVAL_MS = 5000;
const DEFAULT_BATCH_SIZE = 25;

const workerRegion = resolveWorkerRegion();

async function runSchedulerCycle(batchSize: number): Promise<void> {
  const now = new Date();
  const dueTriggers = await triggerPersistenceService.claimDuePollingTriggers({
    limit: batchSize,
    now,
    region: workerRegion,
  });

  if (dueTriggers.length === 0) {
    return;
  }

  console.log(`⏱️ Scheduler claimed ${dueTriggers.length} polling trigger(s) at ${now.toISOString()}`);

  const manager = WebhookManager.getInstance();
  for (const trigger of dueTriggers) {
    try {
      await manager.runPollingTrigger(trigger);
    } catch (error) {
      console.error(
        `❌ Scheduler failed to run polling trigger ${trigger.id}:`,
        error instanceof Error ? error.message : error
      );
    }
  }
}

async function main(): Promise<void> {
  console.log(`🕒 Starting polling scheduler worker (region=${workerRegion})`);
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

      runningCycle = runSchedulerCycle(batchSize).catch((error) => {
        console.error('❌ Scheduler cycle execution error:', error);
      });

      try {
        await runningCycle;
      } finally {
        runningCycle = null;
        scheduleNext();
      }
    }, intervalMs);
  };

  runningCycle = runSchedulerCycle(batchSize).catch((error) => {
    console.error('❌ Initial scheduler cycle failed:', error);
  });

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

void main().catch((error) => {
  console.error('Failed to start scheduler worker:', error);
  process.exit(1);
});
