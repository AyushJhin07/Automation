import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';

import {
  SandboxExecutor,
  SandboxExecutorRunOptions,
  SandboxExecutionResult,
  SandboxLogEntry,
  SANDBOX_BOOTSTRAP_SOURCE,
  formatLog,
  SandboxAbortError,
  SandboxTimeoutError,
} from './SandboxShared';

const EXECUTOR_ENV_KEY = 'SANDBOX_PAYLOAD';

export class ProcessSandboxExecutor implements SandboxExecutor {
  async run(options: SandboxExecutorRunOptions): Promise<SandboxExecutionResult> {
    const { code, entryPoint, params, context, timeoutMs, signal, secrets } = options;

    const start = performance.now();
    const payload = JSON.stringify({ code, entryPoint, params, context, timeoutMs, secrets });

    const child = spawn(process.execPath, ['--input-type=module', '--no-warnings', '-e', SANDBOX_BOOTSTRAP_SOURCE], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      env: {
        ...process.env,
        [EXECUTOR_ENV_KEY]: payload,
      },
    });

    const logs: SandboxLogEntry[] = [];

    return new Promise<SandboxExecutionResult>((resolve, reject) => {
      let settled = false;
      let hardTimeout: NodeJS.Timeout | null = null;

      const cleanup = () => {
        signal?.removeEventListener('abort', handleAbort);
        child.removeAllListeners('message');
        child.removeAllListeners('error');
        child.removeAllListeners('exit');
      };

      const terminate = (signalType: NodeJS.Signals = 'SIGKILL') => {
        if (!child.killed) {
          try {
            child.kill(signalType);
          } catch {
            // ignore
          }
        }
      };

      const finalize = (error: Error | null, value?: any) => {
        if (settled) {
          return;
        }
        settled = true;
        if (hardTimeout) {
          clearTimeout(hardTimeout);
          hardTimeout = null;
        }
        cleanup();
        terminate();

        const durationMs = performance.now() - start;
        if (error) {
          reject(error);
        } else {
          resolve({ result: value ?? null, logs, durationMs });
        }
      };

      const handleAbort = () => {
        try {
          child.send({ type: 'abort' });
        } catch {
          // Channel closed or child already exited
        }
        finalize(new SandboxAbortError('Sandbox execution aborted'));
      };

      if (signal) {
        signal.addEventListener('abort', handleAbort, { once: true });
      }

      if (timeoutMs > 0) {
        hardTimeout = setTimeout(() => {
          try {
            child.send({ type: 'abort' });
          } catch {
            // ignore
          }
          hardTimeout = setTimeout(() => {
            terminate();
          }, 1000);
          finalize(new SandboxTimeoutError(`Sandbox execution timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }

      child.on('message', (message: any) => {
        if (!message) return;
        if (message.type === 'log') {
          try {
            const formatted = typeof message.data === 'string'
              ? message.data
              : formatLog(Array.isArray(message.data) ? message.data : [message.data]);
            logs.push({
              level: (message.level as SandboxLogEntry['level']) || 'log',
              message: formatted,
            });
          } catch {
            logs.push({ level: 'warn', message: '[Sandbox] Failed to format log output' });
          }
          return;
        }
        if (message.type === 'result') {
          finalize(null, message.data);
          return;
        }
        if (message.type === 'error') {
          const err = new Error(message.error?.message || 'Sandbox execution failed');
          if (message.error?.name) {
            err.name = message.error.name;
          }
          if (message.error?.stack) {
            err.stack = message.error.stack;
          }
          finalize(err);
        }
      });

      child.once('error', (error) => {
        finalize(error instanceof Error ? error : new Error(String(error)));
      });

      child.once('exit', (code, signalCode) => {
        if (settled) return;
        if (typeof signalCode === 'string' && signalCode.length > 0) {
          finalize(new Error(`Sandbox process terminated due to signal ${signalCode}`));
          return;
        }
        if (code === 0) {
          finalize(new Error('Sandbox process exited unexpectedly without a result'));
        } else {
          finalize(new Error(`Sandbox process exited with code ${code}`));
        }
      });
    });
  }
}
