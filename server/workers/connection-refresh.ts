import { env } from '../env';
import { connectionService } from '../services/ConnectionService.js';
import { getErrorMessage } from '../types/common.js';

const DEFAULT_INTERVAL_MS = 60_000;
const DEFAULT_LOOKAHEAD_MS = 10 * 60 * 1000;
const DEFAULT_BATCH_SIZE = 25;

async function runRefreshCycle(lookaheadMs: number, limit: number): Promise<void> {
  const summary = await connectionService.refreshConnectionsExpiringSoon({
    lookaheadMs,
    limit,
  });

  if (summary.refreshed > 0 || summary.errors > 0) {
    console.log(
      `🔄 Connection refresh cycle: scanned=${summary.scanned} refreshed=${summary.refreshed} skipped=${summary.skipped} errors=${summary.errors}`
    );
  }
}

async function main(): Promise<void> {
  console.log('🕒 Starting connection refresh worker');
  console.log('🌍 Worker environment:', env.NODE_ENV);

  const intervalMs = Math.max(5_000, Number.parseInt(process.env.CONNECTION_REFRESH_INTERVAL_MS ?? `${DEFAULT_INTERVAL_MS}`, 10));
  const lookaheadMs = Math.max(0, Number.parseInt(process.env.CONNECTION_REFRESH_LOOKAHEAD_MS ?? `${DEFAULT_LOOKAHEAD_MS}`, 10));
  const batchSize = Math.max(1, Number.parseInt(process.env.CONNECTION_REFRESH_BATCH_SIZE ?? `${DEFAULT_BATCH_SIZE}`, 10));

  let shuttingDown = false;
  let timer: NodeJS.Timeout | null = null;
  let inflight: Promise<void> | null = null;
  let resolveShutdown: (() => void) | null = null;

  const waitForShutdown = new Promise<void>((resolve) => {
    resolveShutdown = resolve;
  });

  const scheduleNext = () => {
    if (shuttingDown) {
      return;
    }

    timer = setTimeout(async () => {
      if (inflight) {
        try {
          await inflight;
        } catch (error) {
          console.error('❌ Connection refresh cycle error:', getErrorMessage(error));
        }
      }

      inflight = runRefreshCycle(lookaheadMs, batchSize).catch((error) => {
        console.error('❌ Connection refresh execution error:', getErrorMessage(error));
      });

      try {
        await inflight;
      } finally {
        inflight = null;
        scheduleNext();
      }
    }, intervalMs);
  };

  inflight = runRefreshCycle(lookaheadMs, batchSize).catch((error) => {
    console.error('❌ Initial connection refresh cycle failed:', getErrorMessage(error));
  });

  await inflight;
  inflight = null;
  scheduleNext();

  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    console.log(`⚙️ Received ${signal}. Shutting down connection refresh worker...`);

    if (timer) {
      clearTimeout(timer);
      timer = null;
    }

    if (inflight) {
      try {
        await inflight;
      } catch (error) {
        console.error('❌ Connection refresh cycle error during shutdown:', getErrorMessage(error));
      } finally {
        inflight = null;
      }
    }

    resolveShutdown?.();
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  process.on('unhandledRejection', (reason) => {
    console.error('❌ Unhandled rejection in connection refresh worker:', reason);
  });

  process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught exception in connection refresh worker:', error);
  });

  console.log('🔁 Connection refresh worker is running.');
  await waitForShutdown;
  console.log('👋 Connection refresh worker has stopped.');
}

void main().catch((error) => {
  console.error('Failed to start connection refresh worker:', error);
  process.exit(1);
});
