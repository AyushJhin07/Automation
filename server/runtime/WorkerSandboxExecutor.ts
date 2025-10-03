import { Worker } from 'node:worker_threads';
import { performance } from 'node:perf_hooks';

import {
  SandboxExecutor,
  SandboxExecutorRunOptions,
  SandboxExecutionResult,
  SandboxLogEntry,
  formatLog,
  SANDBOX_BOOTSTRAP_SOURCE,
  SandboxAbortError,
  SandboxTimeoutError,
  SandboxHeartbeatTimeoutError,
  SandboxPolicyEvent,
} from './SandboxShared';

const DEFAULT_HEARTBEAT_INTERVAL_MS = 500;
const DEFAULT_HEARTBEAT_TIMEOUT_MS = 3_000;

export class WorkerSandboxExecutor implements SandboxExecutor {
  async run(options: SandboxExecutorRunOptions): Promise<SandboxExecutionResult> {
    const {
      code,
      entryPoint,
      params,
      context,
      timeoutMs,
      signal,
      secrets,
      networkPolicy,
      heartbeatIntervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS,
      heartbeatTimeoutMs,
      onPolicyEvent,
    } = options;

    const start = performance.now();
    const effectiveHeartbeatInterval = Number.isFinite(heartbeatIntervalMs)
      ? Math.max(25, Math.floor(heartbeatIntervalMs))
      : DEFAULT_HEARTBEAT_INTERVAL_MS;
    const effectiveHeartbeatTimeout = Number.isFinite(heartbeatTimeoutMs)
      ? Math.max(effectiveHeartbeatInterval * 2, Math.floor(heartbeatTimeoutMs))
      : Math.max(effectiveHeartbeatInterval * 3, DEFAULT_HEARTBEAT_TIMEOUT_MS);

    const worker = new Worker(SANDBOX_BOOTSTRAP_SOURCE, {
      eval: true,
      workerData: {
        code,
        entryPoint,
        params,
        context,
        timeoutMs,
        secrets,
        networkPolicy: networkPolicy ?? null,
        heartbeatIntervalMs: effectiveHeartbeatInterval,
      },
      type: 'module',
    });

    const logs: SandboxLogEntry[] = [];
    let lastHeartbeat = Date.now();
    let heartbeatMonitor: NodeJS.Timeout | null = null;

    const emitPolicyEvent = (event: SandboxPolicyEvent) => {
      try {
        onPolicyEvent?.(event);
      } catch (error) {
        console.warn('[Sandbox] Failed to dispatch policy event', error);
      }
    };

    return new Promise<SandboxExecutionResult>((resolve, reject) => {
      let settled = false;
      let hardTimeout: NodeJS.Timeout | null = null;

      const cleanup = () => {
        signal?.removeEventListener('abort', handleAbort);
        worker.removeAllListeners('message');
        worker.removeAllListeners('error');
        worker.removeAllListeners('exit');
        if (heartbeatMonitor) {
          clearInterval(heartbeatMonitor);
          heartbeatMonitor = null;
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
        worker.terminate().catch(() => {});

        const durationMs = performance.now() - start;
        if (error) {
          reject(error);
        } else {
          resolve({ result: value ?? null, logs, durationMs });
        }
      };

      const handleAbort = () => {
        try {
          worker.postMessage({ type: 'abort' });
        } catch {
          // Channel already closed
        }
        finalize(new SandboxAbortError('Sandbox execution aborted'));
      };

      if (signal) {
        signal.addEventListener('abort', handleAbort, { once: true });
      }

      heartbeatMonitor = setInterval(() => {
        const elapsed = Date.now() - lastHeartbeat;
        if (elapsed > effectiveHeartbeatTimeout) {
          finalize(new SandboxHeartbeatTimeoutError(
            `Sandbox heartbeat missed for ${elapsed}ms (timeout=${effectiveHeartbeatTimeout}ms)`,
          ));
        }
      }, Math.min(Math.max(effectiveHeartbeatInterval, 50), effectiveHeartbeatTimeout));
      if (heartbeatMonitor && typeof heartbeatMonitor.unref === 'function') {
        heartbeatMonitor.unref();
      }

      if (timeoutMs > 0) {
        hardTimeout = setTimeout(() => {
          try {
            worker.postMessage({ type: 'abort' });
          } catch {
            // ignore
          }
          hardTimeout = setTimeout(() => {
            worker.terminate().catch(() => {});
          }, 1000);
          finalize(new SandboxTimeoutError(`Sandbox execution timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }

      worker.on('message', (message: any) => {
        if (!message) return;
        if (message.type === 'heartbeat') {
          lastHeartbeat = Date.now();
          return;
        }
        if (message.type === 'policy_violation') {
          const event = message.event as SandboxPolicyEvent | undefined;
          if (event && event.type) {
            emitPolicyEvent(event);
          }
          return;
        }
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

      worker.once('error', (error) => {
        finalize(error instanceof Error ? error : new Error(String(error)));
      });

      worker.once('exit', (code) => {
        if (settled) return;
        if (code === 0) {
          finalize(new Error('Sandbox worker exited unexpectedly without a result'));
        } else {
          finalize(new Error(`Sandbox worker exited with code ${code}`));
        }
      });
    });
  }
}
