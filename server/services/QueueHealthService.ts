import IORedis, { type RedisOptions } from 'ioredis';

import type { OrganizationRegion } from '../database/schema.js';
import { getRedisConnectionOptions } from '../queue/BullMQFactory.js';
import { getActiveQueueDriver, QueueDriverUnavailableError } from '../queue/index.js';
import { getErrorMessage } from '../types/common.js';
import { FLAGS } from '../env.js';

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

let redisHelpLogged = false;

function describeRedisTarget(connection: RedisOptions): string {
  const scheme = connection.tls ? 'rediss' : 'redis';
  const host = connection.host ?? '127.0.0.1';
  const port = connection.port ?? 6379;
  const db = connection.db ?? 0;
  const username = connection.username ? `${connection.username}@` : '';
  return `${scheme}://${username}${host}:${port}/${db}`;
}

function logRedisConnectivityHelp(connection: RedisOptions, explanation: string) {
  if (redisHelpLogged) {
    return;
  }

  const location = describeRedisTarget(connection);
  const instructions = [
    `[queue] Redis connection failed: ${explanation}`,
    `[queue] Attempted connection: ${location}`,
    '[queue] Ensure Redis is running before starting the API/worker processes.',
    "[queue] • To use Docker, run: docker compose -f docker-compose.dev.yml up redis",
    '[queue] • For a local install, follow docs/operations/local-dev.md#queue-configuration',
  ].join('\n');

  console.error(instructions);
  redisHelpLogged = true;
}

export function getRedisTargetLabel(region?: OrganizationRegion): string {
  const connection = getRedisConnectionOptions(region);
  return describeRedisTarget(connection);
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
    logRedisConnectivityHelp(connection, explanation);
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
  const durable = activeDriver === 'bullmq' || activeDriver === 'mock';

  if (activeDriver === 'mock') {
    const status: QueueHealthStatus = {
      status: 'pass',
      durable: true,
      message: 'Mock queue driver active. Redis connectivity checks bypassed.',
      latencyMs: 0,
      checkedAt: new Date().toISOString(),
    };
    cachedStatus = status;
    cachedRegionKey = regionKey;
    lastCheck = Date.now();
    inflightCheck = null;
    return status;
  }

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
  const target = getRedisTargetLabel(options.region);

  if (!status.durable) {
    const message = [
      `[Queue] ${options.context} requires a durable BullMQ queue. Current driver is set to in-memory mode.`,
      `[Queue] Configure QUEUE_REDIS_HOST/PORT/DB (and optional QUEUE_REDIS_USERNAME/QUEUE_REDIS_PASSWORD/QUEUE_REDIS_TLS) so the worker can reach Redis at ${target}.`,
      '[Queue] Validate the deployment with GET /api/production/queue/heartbeat before routing workload.',
      '[Queue] See docs/operations/queue.md#environment-variables for full configuration guidance.',
    ].join('\n');

    console.error(message);
    if (FLAGS.ENABLE_DEV_IGNORE_QUEUE) {
      console.warn(
        '[Queue] ENABLE_DEV_IGNORE_QUEUE=true detected in development. Continuing with in-memory queue despite durability warnings.'
      );
      return;
    }
    throw new QueueDriverUnavailableError(message);
  }

  if (status.status !== 'pass') {
    const remediation = [
      `[Queue] ${options.context} cannot start because Redis is unavailable: ${status.message}`,
      `[Queue] Attempted Redis target: ${target}`,
      '[Queue] Confirm QUEUE_REDIS_HOST/PORT/DB values (plus QUEUE_REDIS_USERNAME/QUEUE_REDIS_PASSWORD/QUEUE_REDIS_TLS when required).',
      '[Queue] Use GET /api/production/queue/heartbeat for live diagnostics or consult docs/operations/queue.md#environment-variables.',
    ].join('\n');

    console.error(remediation);
    throw new QueueDriverUnavailableError(remediation, status.error ? { cause: new Error(status.error) } : undefined);
  }
}
