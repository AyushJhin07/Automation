import { spawn, type ChildProcess } from 'node:child_process';
import process from 'node:process';
import IORedis, { type RedisOptions } from 'ioredis';
import { Client } from 'pg';

import { getRedisConnectionOptions } from '../server/queue/BullMQFactory.js';

type ManagedProcess = {
  script: string;
  child: ChildProcess;
};

class QueueReadinessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QueueReadinessError';
  }
}

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const scriptsToRun = ['dev:api', 'dev:worker', 'dev:scheduler', 'dev:timers', 'dev:rotation'];
const managedProcesses: ManagedProcess[] = [];

let shuttingDown = false;
let exitCode = 0;

type QueueConfigurationSnapshot = {
  driver: string;
  connection: RedisOptions;
  target: string;
};

let cachedQueueConfiguration: QueueConfigurationSnapshot | null = null;

process.env.NODE_ENV ??= 'development';

const logPrefix = '[dev:stack]';

function log(message: string) {
  console.log(`${logPrefix} ${message}`);
}

function terminateAll(signal: NodeJS.Signals = 'SIGTERM') {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  for (const { script, child } of managedProcesses) {
    if (child.killed) {
      continue;
    }

    log(`Sending ${signal} to ${script}...`);

    try {
      child.kill(signal);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`Failed to terminate ${script}: ${message}`);
    }
  }
}

function setupSignalHandlers() {
  const shutdownHandler = (signal: NodeJS.Signals) => {
    log(`Received ${signal}. Cleaning up child processes...`);
    exitCode = exitCode || 0;
    terminateAll(signal);
  };

  process.on('SIGINT', () => shutdownHandler('SIGINT'));
  process.on('SIGTERM', () => shutdownHandler('SIGTERM'));
}

async function delay(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  setupSignalHandlers();

  try {
    await ensureRedisIsReachable();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    exitCode = exitCode || 1;
    return;
  }

  await ensureDatabaseIsReachable();

  try {
    await runDatabaseMigrations();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    exitCode = exitCode || 1;
    log(`Database migrations failed: ${message}`);
    return;
  }

  const exitPromises = scriptsToRun.map((script) => {
    return new Promise<void>((resolve) => {
      const childEnv = { ...process.env };
      if (script === 'dev:api') {
        if (!('ENABLE_INLINE_WORKER' in childEnv)) {
          childEnv.ENABLE_INLINE_WORKER = 'false';
        }
        childEnv.DISABLE_INLINE_WORKER_AUTOSTART = 'true';
      }

      const child = spawn(npmCommand, ['run', script], {
        stdio: 'inherit',
        env: childEnv,
      });

      const managed: ManagedProcess = { script, child };
      managedProcesses.push(managed);

      child.on('spawn', () => {
        log(`Started ${script}`);
        verifyQueueDriverForChild(script).catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`${logPrefix} Queue verification failed after starting ${script}: ${message}`);
          exitCode = exitCode || 1;
          terminateAll();
        });
      });

      let settled = false;

      const finish = () => {
        if (settled) {
          return;
        }

        settled = true;
        resolve();
      };

      child.on('error', (error) => {
        const message = error instanceof Error ? error.message : String(error);
        log(`Failed to start ${script}: ${message}`);
        exitCode = exitCode || 1;
        terminateAll();
        finish();
      });

      child.on('exit', (code, signal) => {
        if (!shuttingDown) {
          if (code !== null && code !== 0) {
            log(`${script} exited with code ${code}. Shutting down remaining processes.`);
            exitCode = exitCode || code;
            terminateAll();
          } else if (signal) {
            log(`${script} exited due to signal ${signal}. Shutting down remaining processes.`);
            exitCode = exitCode || 0;
            terminateAll(signal);
          } else {
            log(`${script} exited. Shutting down remaining processes.`);
            exitCode = exitCode || 0;
            terminateAll();
          }
        }

        finish();
      });
    });
  });

  monitorApiReadiness().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    log(`API readiness check failed: ${message}`);
    exitCode = exitCode || 1;
    terminateAll();
  });

  await Promise.all(exitPromises);
}

async function runDatabaseMigrations(): Promise<void> {
  if (process.env.SKIP_DB_VALIDATION === 'true') {
    log('Skipping database migrations because SKIP_DB_VALIDATION=true.');
    return;
  }

  log('Applying database migrations with "npm run db:push"...');

  await new Promise<void>((resolve, reject) => {
    const child = spawn(npmCommand, ['run', 'db:push'], {
      stdio: 'inherit',
      env: { ...process.env },
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      if (signal) {
        reject(new Error(`db:push terminated by signal ${signal}`));
        return;
      }

      reject(new Error(`db:push exited with code ${code ?? 'unknown'}`));
    });
  });

  log('Database migrations applied successfully.');
}

function resolveQueueDriver(): string {
  const override = process.env.QUEUE_DRIVER?.toLowerCase().trim();
  if (!override) {
    return 'bullmq';
  }
  return override;
}

function describeRedisTarget(connection: RedisOptions): string {
  const scheme = connection.tls ? 'rediss' : 'redis';
  const hostValue = typeof connection.host === 'string' && connection.host.trim().length > 0
    ? connection.host.trim()
    : '<unset-host>';
  const username = connection.username ? `${connection.username}@` : '';
  const formatNumber = (value: unknown, fallback: string): string => {
    return typeof value === 'number' && Number.isFinite(value) ? value.toString() : fallback;
  };
  const portValue = formatNumber(connection.port, '<invalid-port>');
  const dbValue = formatNumber(connection.db, '<invalid-db>');

  return `${scheme}://${username}${hostValue}:${portValue}/${dbValue}`;
}

function createQueueConfigurationSnapshot(): QueueConfigurationSnapshot {
  const rawConnection = getRedisConnectionOptions();
  const sanitized: RedisOptions = {
    ...rawConnection,
    host: typeof rawConnection.host === 'string' ? rawConnection.host.trim() : rawConnection.host,
  };

  if (typeof sanitized.port !== 'number' || !Number.isFinite(sanitized.port)) {
    const parsed = Number.parseInt(String(rawConnection.port ?? ''), 10);
    sanitized.port = Number.isFinite(parsed) ? parsed : Number.NaN;
  }

  if (typeof sanitized.db !== 'number' || !Number.isFinite(sanitized.db)) {
    const parsed = Number.parseInt(String(rawConnection.db ?? ''), 10);
    sanitized.db = Number.isFinite(parsed) ? parsed : Number.NaN;
  }

  return {
    driver: resolveQueueDriver(),
    connection: sanitized,
    target: describeRedisTarget(sanitized),
  };
}

function getQueueConfiguration(): QueueConfigurationSnapshot {
  if (!cachedQueueConfiguration) {
    cachedQueueConfiguration = createQueueConfigurationSnapshot();
  }
  return cachedQueueConfiguration;
}

function ensureQueueTargetConsistency(context: string): void {
  if (!cachedQueueConfiguration) {
    cachedQueueConfiguration = createQueueConfigurationSnapshot();
    return;
  }

  const latest = createQueueConfigurationSnapshot();
  if (latest.target !== cachedQueueConfiguration.target) {
    throw new QueueReadinessError(
      [
        `${logPrefix} ${context} resolved Redis target ${latest.target}, which differs from the initial ${cachedQueueConfiguration.target}.`,
        `${logPrefix} Align QUEUE_REDIS_HOST/PORT/DB (and optional credentials/TLS) so every process points at the same Redis instance.`,
      ].join('\n'),
    );
  }
}

function assertValidRedisConnection(connection: RedisOptions, target: string): void {
  const host = typeof connection.host === 'string' ? connection.host.trim() : '';
  if (!host) {
    throw new QueueReadinessError(
      [
        `${logPrefix} Resolved Redis host is empty.`,
        `${logPrefix} Resolved Redis target: ${target}`,
        `${logPrefix} Set QUEUE_REDIS_HOST to the hostname or IP address of your Redis instance.`,
      ].join('\n'),
    );
  }

  const port = connection.port;
  if (typeof port !== 'number' || !Number.isInteger(port) || port <= 0 || port >= 65536) {
    throw new QueueReadinessError(
      [
        `${logPrefix} Resolved Redis port is invalid (${port}).`,
        `${logPrefix} Resolved Redis target: ${target}`,
        `${logPrefix} Set QUEUE_REDIS_PORT to an integer between 1 and 65535.`,
      ].join('\n'),
    );
  }

  const db = connection.db;
  if (typeof db !== 'number' || !Number.isInteger(db) || db < 0) {
    throw new QueueReadinessError(
      [
        `${logPrefix} Resolved Redis database index is invalid (${db}).`,
        `${logPrefix} Resolved Redis target: ${target}`,
        `${logPrefix} Set QUEUE_REDIS_DB to a non-negative integer.`,
      ].join('\n'),
    );
  }
}

async function ensureRedisIsReachable() {
  const configuration = getQueueConfiguration();
  const { connection } = configuration;
  const driver = configuration.driver;
  const target = configuration.target;

  log(`Resolved queue driver "${driver}" with Redis target ${target}.`);

  if (driver === 'inmemory') {
    throw new QueueReadinessError(
      [
        `${logPrefix} dev:stack requires a durable BullMQ queue driver. QUEUE_DRIVER=inmemory keeps jobs in process memory and will drop work on restart.`,
        `${logPrefix} Resolved Redis target: ${target}`,
        `${logPrefix} Remove QUEUE_DRIVER=inmemory (reserved for isolated tests) and configure QUEUE_REDIS_HOST/PORT/DB so every process connects to the same Redis instance.`,
        `${logPrefix} Start Redis with 'docker compose -f docker-compose.dev.yml up redis' or install it locally before rerunning dev:stack.`,
      ].join('\n'),
    );
  }

  if (driver && driver !== 'bullmq') {
    throw new QueueReadinessError(
      [
        `${logPrefix} Unsupported QUEUE_DRIVER value "${driver}" detected. dev:stack only supports the durable BullMQ driver.`,
        `${logPrefix} Resolved Redis target: ${target}`,
        `${logPrefix} Remove the unsupported QUEUE_DRIVER override or set it to "bullmq".`,
      ].join('\n'),
    );
  }

  assertValidRedisConnection(connection, target);

  const client = new IORedis(connection);

  try {
    await client.ping();
    log(`Redis connection verified at ${target}.`);
  } catch (error) {
    const explanation = error instanceof Error ? error.message : String(error);
    throw new QueueReadinessError(
      [
        `${logPrefix} Unable to reach Redis at ${target}: ${explanation}`,
        `${logPrefix} Start Redis with 'docker compose -f docker-compose.dev.yml up redis' or install it locally.`,
        `${logPrefix} Confirm QUEUE_REDIS_HOST/PORT/DB (and optional QUEUE_REDIS_USERNAME/QUEUE_REDIS_PASSWORD/QUEUE_REDIS_TLS) match your environment.`,
      ].join('\n'),
      error instanceof Error ? { cause: error } : undefined,
    );
  } finally {
    try {
      await client.quit();
    } catch {
      client.disconnect();
    }
  }
}

function parseInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function pingRedisForProbe(context: string): Promise<void> {
  const configuration = getQueueConfiguration();
  const client = new IORedis(configuration.connection);

  try {
    await client.ping();
    log(`${context} verified Redis connectivity at ${configuration.target}.`);
  } catch (error) {
    const explanation = error instanceof Error ? error.message : String(error);
    throw new QueueReadinessError(
      [
        `${logPrefix} ${context} failed to reach Redis at ${configuration.target}: ${explanation}`,
        `${logPrefix} Ensure the process can reach Redis and that QUEUE_REDIS_* values match across all dev:stack children.`,
      ].join('\n'),
      error instanceof Error ? { cause: error } : undefined,
    );
  } finally {
    try {
      await client.quit();
    } catch {
      client.disconnect();
    }
  }
}

async function probeApiQueueHealth(): Promise<void> {
  const host = process.env.HOST ?? '127.0.0.1';
  const port = process.env.PORT ?? '5000';
  const origin = process.env.DEV_STACK_API_ORIGIN ?? `http://${host}:${port}`;
  const path = process.env.DEV_STACK_QUEUE_HEALTH_PATH ?? '/api/health/queue';

  let url: URL;
  try {
    url = new URL(path, origin);
  } catch (error) {
    const explanation = error instanceof Error ? error.message : String(error);
    throw new QueueReadinessError(
      `${logPrefix} Unable to construct queue health URL (${explanation}). Check DEV_STACK_API_ORIGIN and DEV_STACK_QUEUE_HEALTH_PATH.`,
    );
  }

  const timeoutMs = parseInteger(process.env.DEV_STACK_QUEUE_HEALTH_TIMEOUT_MS, 60000);
  const intervalMs = parseInteger(process.env.DEV_STACK_QUEUE_HEALTH_INTERVAL_MS, 1000);
  const startedAt = Date.now();
  let lastLogged: string | null = null;

  while (!shuttingDown) {
    const elapsed = Date.now() - startedAt;
    if (elapsed > timeoutMs) {
      const message = lastLogged ? ` Last error: ${lastLogged}` : '';
      throw new QueueReadinessError(
        [
          `${logPrefix} Timed out after ${timeoutMs}ms waiting for dev:api to confirm a durable queue via ${url.toString()}.`,
          `${logPrefix} Expected Redis target: ${getQueueConfiguration().target}.${message}`,
          `${logPrefix} Inspect API logs for queue health errors and confirm Redis is reachable.`,
        ].join('\n'),
      );
    }

    try {
      const controller = new AbortController();
      const abortTimeout = setTimeout(() => controller.abort(), Math.min(intervalMs, 5000));
      const response = await fetch(url, {
        headers: {
          accept: 'application/json',
        },
        signal: controller.signal,
      });
      clearTimeout(abortTimeout);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const payload: any = await response.json();
      const durable = payload?.health?.durable === true;

      if (!durable) {
        const detail = typeof payload?.health?.message === 'string'
          ? payload.health.message
          : 'Queue health endpoint reported a non-durable driver.';
        throw new QueueReadinessError(
          [
            `${logPrefix} dev:api reported a non-durable queue driver via ${url.toString()}: ${detail}`,
            `${logPrefix} Expected Redis target: ${getQueueConfiguration().target}`,
            `${logPrefix} Remove QUEUE_DRIVER=inmemory and confirm Redis is reachable before rerunning dev:stack.`,
          ].join('\n'),
        );
      }

      ensureQueueTargetConsistency('dev:api queue health probe');
      log(`dev:api queue health confirmed via ${url.toString()} (target=${getQueueConfiguration().target}).`);
      return;
    } catch (error) {
      if (error instanceof QueueReadinessError) {
        throw error;
      }

      const explanation = error instanceof Error ? error.message : String(error);
      if (lastLogged !== explanation) {
        log(`${logPrefix} Waiting for dev:api queue health: ${explanation}`);
        lastLogged = explanation;
      }
    }

    await delay(intervalMs);
  }
}

async function verifyQueueDriverForChild(script: string): Promise<void> {
  if (shuttingDown) {
    return;
  }

  ensureQueueTargetConsistency(`${script} queue probe`);

  const configuration = getQueueConfiguration();
  if (configuration.driver !== 'bullmq') {
    // Preflight would have already failed, but guard to avoid noisy probes during shutdown.
    return;
  }

  if (script === 'dev:api') {
    await probeApiQueueHealth();
    return;
  }

  await pingRedisForProbe(`dev:stack ${script}`);
}

async function ensureDatabaseIsReachable() {
  if (process.env.SKIP_DB_VALIDATION === 'true') {
    log('Skipping database connectivity check because SKIP_DB_VALIDATION=true.');
    return;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    log('DATABASE_URL is not set. Skipping connectivity precheck.');
    return;
  }

  const maskedTarget = (() => {
    try {
      const url = new URL(connectionString);
      if (url.password) {
        url.password = '******';
      }
      return url.toString();
    } catch (error) {
      const explanation = error instanceof Error ? error.message : String(error);
      log(`Unable to mask DATABASE_URL (${explanation}). Falling back to raw value.`);
      return connectionString.replace(/:(?<secret>[^:@/]+)@/, ':******@');
    }
  })();

  log(`Checking database connectivity at ${maskedTarget}...`);

  const parsedTimeout = Number.parseInt(process.env.DEV_STACK_DB_TIMEOUT_MS ?? '5000', 10);
  const connectionTimeoutMillis = Number.isFinite(parsedTimeout) ? parsedTimeout : 5000;

  const client = new Client({
    connectionString,
    connectionTimeoutMillis,
  });

  let shouldExit = false;

  try {
    await client.connect();
    await client.query('select 1');
    log('Database connection verified.');
  } catch (error) {
    const explanation = error instanceof Error ? error.message : String(error);
    console.error(
      `${logPrefix} Unable to reach Postgres at ${maskedTarget}: ${explanation}`,
      `\n${logPrefix} Start Postgres with 'docker compose -f docker-compose.dev.yml up postgres' or provide a reachable DATABASE_URL.`,
    );
    process.exitCode = 1;
    shouldExit = true;
  } finally {
    try {
      await client.end();
    } catch (error) {
      const explanation = error instanceof Error ? error.message : String(error);
      log(`Failed to close database client cleanly: ${explanation}`);
    }

    if (shouldExit) {
      terminateAll();
      process.exit(process.exitCode ?? 1);
    }
  }
}

async function monitorApiReadiness(): Promise<void> {
  const host = process.env.HOST ?? '127.0.0.1';
  const port = process.env.PORT ?? '5000';
  const origin = process.env.DEV_STACK_API_ORIGIN ?? `http://${host}:${port}`;
  const readinessPath = process.env.DEV_STACK_READY_PATH ?? '/api/production/ready';

  let readinessUrl: URL;
  try {
    readinessUrl = new URL(readinessPath, origin);
  } catch (error) {
    const explanation = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to construct readiness URL: ${explanation}`);
  }

  const parsedTimeout = Number.parseInt(process.env.DEV_STACK_READY_TIMEOUT_MS ?? '60000', 10);
  const parsedInterval = Number.parseInt(process.env.DEV_STACK_READY_INTERVAL_MS ?? '2000', 10);
  const timeoutMs = Number.isFinite(parsedTimeout) ? parsedTimeout : 60000;
  const intervalMs = Number.isFinite(parsedInterval) ? parsedInterval : 2000;
  const startedAt = Date.now();
  let lastError: Error | null = null;

  log(`Waiting for API readiness at ${readinessUrl.toString()}...`);

  while (!shuttingDown) {
    const elapsed = Date.now() - startedAt;
    if (elapsed > timeoutMs) {
      const finalReason = lastError ? ` Last error: ${lastError.message}` : '';
      throw new Error(`Timed out waiting for API readiness after ${timeoutMs}ms.${finalReason}`);
    }

    try {
      const response = await fetch(readinessUrl, {
        headers: {
          accept: 'application/json',
        },
      });

      if (!response.ok) {
        log(
          `Readiness probe responded with ${response.status} ${response.statusText}. Waiting for HTTP 200...`
        );
      } else {
        const body: any = await response.json();
        const checks = body?.checks ?? {};
        const queueReady = typeof checks.queue === 'boolean'
          ? checks.queue
          : typeof checks.queueDetails === 'object' && checks.queueDetails !== null
            ? checks.queueDetails.status === 'pass' && checks.queueDetails.durable !== false
            : false;

        if (!queueReady) {
          const queueDetails = checks.queueDetails ?? checks.queue ?? {};
          const queueMessage = typeof queueDetails?.message === 'string'
            ? queueDetails.message
            : 'Queue readiness reported as false by /ready endpoint.';
          throw new QueueReadinessError(queueMessage);
        }

        if (body.ready === true) {
          log(`API readiness confirmed. (${readinessUrl.toString()})`);
          return;
        }

        const failingChecks = Object.entries(checks)
          .filter(([key, value]) => key !== 'queueDetails' && value === false)
          .map(([key]) => key);

        if (failingChecks.length > 0) {
          log(`API not ready yet. Waiting on: ${failingChecks.join(', ')}.`);
        } else {
          log('API readiness endpoint returned ready=false. Waiting and retrying...');
        }
      }

      lastError = null;
    } catch (error) {
      if (error instanceof QueueReadinessError) {
        throw error;
      }

      lastError = error instanceof Error ? error : new Error(String(error));
      log(`Readiness probe unavailable (${lastError.message}). Retrying...`);
    }

    await delay(intervalMs);
  }
}

main()
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${logPrefix} Unhandled error: ${message}`);
    exitCode = exitCode || 1;
  })
  .finally(() => {
    process.exit(exitCode);
  });
