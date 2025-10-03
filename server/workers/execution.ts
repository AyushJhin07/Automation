import '../observability/index.js';
import { env } from '../env';
import { executionQueueService } from '../services/ExecutionQueueService.js';
import { WebhookManager } from '../webhooks/WebhookManager.js';

async function main(): Promise<void> {
  console.log('🚀 Starting execution worker');
  console.log('🌍 Worker environment:', env.NODE_ENV);

  WebhookManager.configureQueueService(executionQueueService);
  executionQueueService.start();

  let shuttingDown = false;
  let resolveWait: (() => void) | null = null;
  const waitForExit = new Promise<void>((resolve) => {
    resolveWait = resolve;
  });

  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    console.log(`⚙️ Received ${signal}. Shutting down execution worker...`);
    try {
      await executionQueueService.shutdown();
      console.log('✅ Execution queue drained successfully.');
    } catch (error) {
      console.error('❌ Error during execution worker shutdown:', error);
    } finally {
      resolveWait?.();
    }
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  process.on('unhandledRejection', (reason) => {
    console.error('❌ Unhandled rejection in execution worker:', reason);
  });

  process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught exception in execution worker:', error);
  });

  console.log('🧵 Execution worker is running.');
  await waitForExit;
  console.log('👋 Execution worker has stopped.');
}

void main().catch((error) => {
  console.error('Failed to start execution worker:', error);
  process.exit(1);
});
