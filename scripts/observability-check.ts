#!/usr/bin/env tsx
/**
 * Observability bootstrap smoke test.
 *
 * Ensures the OpenTelemetry SDK initialises successfully with the configured exporters.
 */

import '../server/env.js';

async function main() {
  const timeoutMs = Number(process.env.OBSERVABILITY_BOOT_TIMEOUT_MS ?? 15000);
  const { observabilityEnabled, observabilityBootstrap } = await import('../server/observability/index.js');

  if (!observabilityEnabled) {
    throw new Error('OBSERVABILITY_ENABLED must be true for the bootstrap check.');
  }

  if (!observabilityBootstrap) {
    throw new Error('Observability bootstrap promise not initialised. Ensure OTLP or Prometheus exporters are configured.');
  }

  const timeout = new Promise<never>((_, reject) => {
    const timer = setTimeout(() => {
      clearTimeout(timer);
      reject(new Error(`Timed out waiting ${timeoutMs}ms for OpenTelemetry bootstrap.`));
    }, timeoutMs);
  });

  await Promise.race([observabilityBootstrap, timeout]);

  console.log('✅ Observability bootstrap check completed successfully.');
}

main().catch((error) => {
  console.error('❌ Observability bootstrap check failed.');
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
