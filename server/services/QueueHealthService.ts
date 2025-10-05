import IORedis from 'ioredis';

import type { OrganizationRegion } from '../database/schema.js';
import { getRedisConnectionOptions } from '../queue/BullMQFactory.js';
import { getActiveQueueDriver, QueueDriverUnavailableError } from '../queue/index.js';
import { getErrorMessage } from '../types/common.js';

export type QueueHealthStatus = {
  status: 'pass' | 'fail';
  durable: boolean;
  message: string;
  latencyMs: number | null;
  checkedAt: string;
  error?: string;
};

const HEALTH_CACHE_MS = 5000;
let cachedStatus: QueueHealthStatus | null = null;
let cachedRegionKey = 'default';
let lastCheck = 0;
let inflightCheck: Promise<QueueHealthStatus> | null = null;

function resolveRegionKey(region?: OrganizationRegion): string {
  return region ?? 'default';
}

async function pingRedis(region?: OrganizationRegion): Promise<QueueHealthStatus> {
  const connection = getRedisConnectionOptions(region);
  const client = new IORedis(connection);
  const startedAt = Date.now();

  try {
    await client.ping();
    return {
      status: 'pass',
      durable: true,
      message: 'Redis connection healthy',
      latencyMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    const explanation = getErrorMessage(error);
    return {
      status: 'fail',
      durable: true,
      message: `Redis ping failed: ${explanation}`,
      latencyMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString(),
      error: explanation,
    };
  } finally {
    try {
      await client.quit();
    } catch {
      client.disconnect();
    }
  }
}

export async function checkQueueHealth(region?: OrganizationRegion): Promise<QueueHealthStatus> {
  const regionKey = resolveRegionKey(region);
  const activeDriver = getActiveQueueDriver();
  const durable = activeDriver === 'bullmq';

  if (!durable) {
    const status: QueueHealthStatus = {
      status: 'fail',
      durable: false,
      message: 'Queue driver is running in non-durable in-memory mode. Jobs will not be persisted.',
      latencyMs: null,
      checkedAt: new Date().toISOString(),
    };
    cachedStatus = status;
    cachedRegionKey = regionKey;
    lastCheck = Date.now();
    return status;
  }

  const now = Date.now();
  if (
    cachedStatus &&
    cachedRegionKey === regionKey &&
    now - lastCheck < HEALTH_CACHE_MS &&
    cachedStatus.durable
  ) {
    return cachedStatus;
  }

  if (inflightCheck && cachedRegionKey === regionKey) {
    return inflightCheck;
  }

  inflightCheck = (async () => {
    const status = await pingRedis(region);
    cachedStatus = status;
    cachedRegionKey = regionKey;
    lastCheck = Date.now();
    inflightCheck = null;
    return status;
  })();

  return inflightCheck;
}

export function getQueueHealthSnapshot(): QueueHealthStatus | null {
  return cachedStatus;
}

export async function assertQueueIsReady(options: {
  context: string;
  region?: OrganizationRegion;
}): Promise<void> {
  const status = await checkQueueHealth(options.region);

  if (!status.durable) {
    throw new QueueDriverUnavailableError(
      `[Queue] ${options.context} requires a durable BullMQ queue. Current driver is set to in-memory mode.`
    );
  }

  if (status.status !== 'pass') {
    throw new QueueDriverUnavailableError(
      `[Queue] ${options.context} cannot start because Redis is unavailable: ${status.message}`
    );
  }
}
