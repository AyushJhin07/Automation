import { spawn, type ChildProcess } from 'node:child_process';
import process from 'node:process';

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

main()
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${logPrefix} Unhandled error: ${message}`);
    exitCode = exitCode || 1;
  })
  .finally(() => {
    process.exit(exitCode);
  });
