import { spawn, type ChildProcess } from 'node:child_process';
import process from 'node:process';
import IORedis from 'ioredis';

import { getRedisConnectionOptions } from '../server/queue/BullMQFactory.js';

type ManagedProcess = {
  script: string;
  child: ChildProcess;
};

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const scriptsToRun = ['dev:api', 'dev:scheduler', 'dev:worker', 'dev:rotation'];
const [primaryScript, ...dependentScripts] = scriptsToRun;
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

  if (!primaryScript) {
    log('No scripts configured to run. Exiting.');
    return;
  }

  const exitPromises: Promise<void>[] = [];

  const startScript = (script: string): Promise<void> => {
    const promise = new Promise<void>((resolve) => {
      const child = spawn(npmCommand, ['run', script], {
        stdio: 'inherit',
        env: { ...process.env },
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

    exitPromises.push(promise);
    return promise;
  };

  startScript(primaryScript);

  await waitForQueueReadiness();

  if (!shuttingDown) {
    for (const script of dependentScripts) {
      startScript(script);
    }
  }

  await Promise.all(exitPromises);
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

async function waitForQueueReadiness() {
  const intervalMs = Number.parseInt(process.env.DEV_STACK_READY_INTERVAL_MS ?? '1000', 10);
  const maxAttempts = Number.parseInt(process.env.DEV_STACK_READY_ATTEMPTS ?? '30', 10);
  const fallbackPort = Number.parseInt(process.env.PORT ?? '5000', 10);
  const readinessHost = process.env.DEV_STACK_READY_HOST ?? '127.0.0.1';
  const readinessUrl =
    process.env.DEV_STACK_READY_URL ?? `http://${readinessHost}:${Number.isFinite(fallbackPort) ? fallbackPort : 5000}/api/production/ready`;

  log(`Polling ${readinessUrl} for queue readiness (max ${maxAttempts} attempts)...`);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (shuttingDown) {
      return;
    }

    try {
      const response = await fetch(readinessUrl, {
        headers: { Accept: 'application/json' },
      });
      const text = await response.text();

      let body: any = null;
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          log(`Attempt ${attempt}: received non-JSON readiness payload: ${text.slice(0, 120)}...`);
        }
      }

      const queueReady = typeof body?.checks?.queue === 'boolean' ? body.checks.queue : undefined;
      const queueMessage = body?.queueHealth?.message ?? body?.error ?? null;

      if (queueReady === false) {
        log('API readiness reported queue=false. The queue is not durable or Redis is unavailable.');
        if (queueMessage) {
          log(`Queue diagnostic: ${queueMessage}`);
        }
        log(`Shutting down dev stack. See docs/operations/monitoring.md for recovery steps.`);
        exitCode = exitCode || 1;
        terminateAll();
        process.exit(exitCode);
      }

      if (queueReady) {
        const readinessState = body?.ready ? 'ready' : 'degraded (non-production environment)';
        log(`Queue health confirmed (${readinessState}). Continuing startup.`);
        return;
      }

      log(
        `Attempt ${attempt}/${maxAttempts}: API not reporting queue readiness yet (HTTP ${response.status}). ` +
          `Retrying in ${intervalMs}ms...`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`Attempt ${attempt}/${maxAttempts}: failed to query readiness (${message}). Retrying in ${intervalMs}ms...`);
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  log(`Timed out waiting for API readiness after ${maxAttempts} attempts. Shutting down dev stack.`);
  exitCode = exitCode || 1;
  terminateAll();
  process.exit(exitCode);
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
