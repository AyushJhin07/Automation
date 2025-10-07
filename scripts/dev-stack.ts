import { spawn, type ChildProcess } from 'node:child_process';
import process from 'node:process';
import IORedis from 'ioredis';
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

  await ensureRedisIsReachable();
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
      log(`Started ${script}`);

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

async function ensureRedisIsReachable() {
  const connection = getRedisConnectionOptions();
  const target = `${connection.host ?? '127.0.0.1'}:${connection.port ?? 6379}/${connection.db ?? 0}`;
  log(`Checking Redis connectivity at ${target}...`);

  const client = new IORedis(connection);
  let shouldExit = false;

  try {
    await client.ping();
    log(`Redis connection verified at ${target}.`);
  } catch (error) {
    const explanation = error instanceof Error ? error.message : String(error);
    console.error(
      `${logPrefix} Unable to reach Redis at ${target}: ${explanation}`,
      `\n${logPrefix} Start Redis with 'docker compose -f docker-compose.dev.yml up redis' or install it locally (docs/operations/local-dev.md#queue-configuration).`
    );
    process.exitCode = 1;
    shouldExit = true;
  } finally {
    try {
      await client.quit();
    } catch {
      client.disconnect();
    }

    if (shouldExit) {
      terminateAll();
      process.exit(process.exitCode ?? 1);
    }
  }
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
