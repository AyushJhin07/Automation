#!/usr/bin/env tsx
import { env } from '../server/env';
import { assertQueueIsReady, checkQueueHealth, getRedisTargetLabel } from '../server/services/QueueHealthService';

async function main(): Promise<void> {
  try {
    await assertQueueIsReady({ context: 'CI queue readiness check' });
    const status = await checkQueueHealth();
    const target = getRedisTargetLabel();
    const environment = env.NODE_ENV ?? process.env.NODE_ENV ?? 'unknown';
    const latency = typeof status.latencyMs === 'number' ? `${status.latencyMs}ms` : 'n/a';
    console.log(`✅ Queue readiness confirmed at ${target} (latency=${latency}, env=${environment}).`);
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message);
      if (error.cause instanceof Error) {
        console.error(`Caused by: ${error.cause.message}`);
      }
    } else {
      console.error('Queue readiness check failed:', error);
    }
    process.exit(1);
  }
}

void main();
