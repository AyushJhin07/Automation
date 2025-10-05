import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import process from 'node:process';
import IORedis from 'ioredis';

import { getRedisConnectionOptions } from '../server/queue/BullMQFactory.js';

type ManagedProcess = {
  script: string;
  child: ChildProcess;
};

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const scriptsToRun = ['dev:api', 'dev:scheduler', 'dev:worker', 'dev:rotation'];
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

async function main() {
  setupSignalHandlers();

  await ensureRedisIsReachable();

  const readinessMonitor = monitorReadiness();

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

  exitPromises.push(
    readinessMonitor.catch((error) => {
      if (!shuttingDown) {
        const message = error instanceof Error ? error.message : String(error);
        log(`[readiness] Monitor failed: ${message}`);
        exitCode = exitCode || 1;
        terminateAll();
      }
      throw error;
    })
  );

  await Promise.all(exitPromises);
}

function resolveReadinessUrl(): string {
  if (process.env.DEV_STACK_READY_URL) {
    return process.env.DEV_STACK_READY_URL;
  }

  const host = process.env.DEV_STACK_READY_HOST ?? '127.0.0.1';
  const port =
    process.env.DEV_STACK_READY_PORT ??
    process.env.PORT ??
    process.env.npm_package_config_port ??
    '5000';

  const pathname = process.env.DEV_STACK_READY_PATH ?? '/api/production/ready';
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;

  return `http://${host}:${port}${normalizedPath}`;
}

async function monitorReadiness(): Promise<void> {
  if (process.env.SKIP_DEV_STACK_READINESS === 'true') {
    log('[readiness] Monitor disabled via SKIP_DEV_STACK_READINESS=true.');
    return;
  }

  const url = resolveReadinessUrl();
  const pollIntervalMs = Number.parseInt(process.env.DEV_STACK_READY_INTERVAL_MS ?? '5000', 10);
  const startupTimeoutMs = Number.parseInt(process.env.DEV_STACK_READY_STARTUP_TIMEOUT_MS ?? '60000', 10);
  const fetchTimeoutMs = Math.max(2000, Math.min(pollIntervalMs - 500, 10000));
  const startedAt = Date.now();
  let warnedAboutStartupDelay = false;

  log(`[readiness] Polling ${url} every ${pollIntervalMs}ms...`);

  while (!shuttingDown) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(fetchTimeoutMs),
        headers: {
          'user-agent': 'dev-stack-readiness-monitor',
          accept: 'application/json',
        },
      });

      const text = await response.text();
      let payload: any = null;

      try {
        payload = text.length > 0 ? JSON.parse(text) : null;
      } catch (error) {
        log(`[readiness] Received non-JSON response (${response.status}): ${text.slice(0, 120)}${
          text.length > 120 ? '…' : ''
        }`);
      }

      if (!payload || typeof payload !== 'object') {
        if (response.status >= 500) {
          log(`[readiness] ${url} returned ${response.status}. Continuing to poll.`);
        }
      } else {
        const queueHealth = payload.checks?.queue;
        const queueReady =
          queueHealth && queueHealth.status === 'pass' && queueHealth.durable !== false;

        if (!queueReady) {
          const reason = queueHealth?.message ?? 'queue is not ready';
          log(`[readiness] Queue reported unhealthy: ${reason}`);
          exitCode = exitCode || 1;
          terminateAll();
          throw new Error(`Queue readiness failed: ${reason}`);
        }

        if (payload.ready === true) {
          log('[readiness] API reports ready with a healthy queue.');
          return;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`[readiness] Polling error: ${message}`);
    }

    if (!warnedAboutStartupDelay && Date.now() - startedAt >= startupTimeoutMs) {
      log(
        `[readiness] API has not reported ready after ${Math.round(startupTimeoutMs / 1000)}s. ` +
          'If this is expected (e.g., debugging), set SKIP_DEV_STACK_READINESS=true.'
      );
      warnedAboutStartupDelay = true;
    }

    await delay(pollIntervalMs);
  }
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

main()
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${logPrefix} Unhandled error: ${message}`);
    exitCode = exitCode || 1;
  })
  .finally(() => {
    process.exit(exitCode);
  });
