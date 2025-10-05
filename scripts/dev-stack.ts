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

main()
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${logPrefix} Unhandled error: ${message}`);
    exitCode = exitCode || 1;
  })
  .finally(() => {
    process.exit(exitCode);
  });
