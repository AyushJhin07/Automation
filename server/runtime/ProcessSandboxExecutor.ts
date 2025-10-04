import { spawn, spawnSync } from 'node:child_process';
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
  SandboxResourceLimitError,
  SandboxHeartbeatTimeoutError,
  SandboxPolicyEvent,
  SandboxResourceLimits,
} from './SandboxShared';
import { CgroupController, ExecutionCgroup } from './CgroupController';

const DEFAULT_HEARTBEAT_INTERVAL_MS = 500;
const DEFAULT_HEARTBEAT_TIMEOUT_MS = 3_000;
const RESOURCE_POLL_INTERVAL_MS = 200;

const EXECUTOR_ENV_KEY = 'SANDBOX_PAYLOAD';

let hasPrlimitSupport: boolean | null = null;

function detectPrlimitSupport(): boolean {
  if (hasPrlimitSupport !== null) {
    return hasPrlimitSupport;
  }
  if (process.platform !== 'linux' && process.platform !== 'darwin') {
    hasPrlimitSupport = false;
    return hasPrlimitSupport;
  }
  try {
    const result = spawnSync('prlimit', ['--version'], { stdio: 'ignore' });
    hasPrlimitSupport = result.error == null && (result.status === 0 || result.status === null);
  } catch {
    hasPrlimitSupport = false;
  }
  return hasPrlimitSupport;
}

function applyPosixResourceLimits(pid: number, limits: SandboxResourceLimits): void {
  if (!Number.isInteger(pid) || pid <= 0) {
    return;
  }
  if (!detectPrlimitSupport()) {
    return;
  }

  const args = ['--pid', String(pid)];

  if (Number.isFinite(limits.maxCpuMs) && (limits.maxCpuMs ?? 0) > 0) {
    const seconds = Math.max(1, Math.ceil((limits.maxCpuMs ?? 0) / 1000));
    args.push(`--cpu=${seconds}:${seconds}`);
  }

  if (Number.isFinite(limits.maxMemoryBytes) && (limits.maxMemoryBytes ?? 0) > 0) {
    const bytes = Math.max(1024, Math.floor(limits.maxMemoryBytes ?? 0));
    args.push(`--as=${bytes}:${bytes}`);
  }

  if (args.length <= 2) {
    return;
  }

  try {
    const result = spawnSync('prlimit', args, { stdio: 'ignore' });
    if (result.error) {
      throw result.error;
    }
  } catch (error) {
    console.warn('[Sandbox] Failed to apply POSIX resource limits', error);
  }
}

export class ProcessSandboxExecutor implements SandboxExecutor {
  async run(options: SandboxExecutorRunOptions): Promise<SandboxExecutionResult> {
    const {
      code,
      entryPoint,
      params,
      context,
      timeoutMs,
      signal,
      secrets,
      resourceLimits,
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

    const payload = JSON.stringify({
      code,
      entryPoint,
      params,
      context,
      timeoutMs,
      secrets,
      networkPolicy: networkPolicy ?? null,
      heartbeatIntervalMs: effectiveHeartbeatInterval,
    });

    const child = spawn(process.execPath, ['--input-type=module', '--no-warnings', '-e', SANDBOX_BOOTSTRAP_SOURCE], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      env: {
        ...process.env,
        [EXECUTOR_ENV_KEY]: payload,
      },
    });

    const cgroupController = resourceLimits?.cgroupRoot ? CgroupController.create(resourceLimits.cgroupRoot) : null;
    let executionCgroup: ExecutionCgroup | null = null;

    const logs: SandboxLogEntry[] = [];
    let lastHeartbeat = Date.now();

    const emitPolicyEvent = (event: SandboxPolicyEvent) => {
      try {
        onPolicyEvent?.(event);
      } catch (error) {
        console.warn('[Sandbox] Failed to dispatch policy event', error);
      }
    };

    const normalizePolicyEvent = (message: any): SandboxPolicyEvent | null => {
      if (!message || typeof message !== 'object') {
        return null;
      }
      if (message.type === 'network-denied') {
        const allowlistSource = message.allowlist;
        const allowlist = allowlistSource && typeof allowlistSource === 'object'
          ? {
              domains: Array.isArray(allowlistSource.domains)
                ? allowlistSource.domains.filter((value: any) => typeof value === 'string')
                : [],
              ipRanges: Array.isArray(allowlistSource.ipRanges)
                ? allowlistSource.ipRanges.filter((value: any) => typeof value === 'string')
                : [],
            }
          : null;
        const auditSource = message.audit;
        const audit = auditSource && typeof auditSource === 'object'
          ? {
              organizationId: typeof auditSource.organizationId === 'string' ? auditSource.organizationId : undefined,
              executionId: typeof auditSource.executionId === 'string' ? auditSource.executionId : undefined,
              nodeId: typeof auditSource.nodeId === 'string' ? auditSource.nodeId : undefined,
              connectionId: typeof auditSource.connectionId === 'string' ? auditSource.connectionId : undefined,
              userId: typeof auditSource.userId === 'string' ? auditSource.userId : undefined,
            }
          : undefined;
        const host = typeof message.host === 'string' ? message.host : '';
        const url = typeof message.url === 'string' ? message.url : '';
        const reason = typeof message.reason === 'string' ? message.reason : 'policy_violation';
        if (!host || !url) {
          return null;
        }
        return {
          type: 'network-denied',
          host,
          url,
          reason,
          allowlist,
          audit,
        };
      }
      if (message.type === 'resource-limit') {
        const resource = message.resource === 'cpu' || message.resource === 'memory' ? message.resource : null;
        if (!resource) {
          return null;
        }
        const usage = Number(message.usage);
        const limit = Number(message.limit);
        if (!Number.isFinite(usage) || !Number.isFinite(limit)) {
          return null;
        }
        return {
          type: 'resource-limit',
          resource,
          usage,
          limit,
        };
      }
      return null;
    };

    return new Promise<SandboxExecutionResult>((resolve, reject) => {
      let settled = false;
      let hardTimeout: NodeJS.Timeout | null = null;
      let heartbeatMonitor: NodeJS.Timeout | null = null;
      let resourceMonitor: NodeJS.Timeout | null = null;

      const applyRuntimeGuards = async () => {
        if (!resourceLimits) {
          return;
        }
        const pid = child.pid ?? -1;
        if (pid <= 0) {
          return;
        }
        try {
          if (cgroupController) {
            executionCgroup = await cgroupController.createExecutionGroup(resourceLimits);
            if (executionCgroup) {
              await executionCgroup.addProcess(pid);
            }
          } else {
            applyPosixResourceLimits(pid, resourceLimits);
          }
        } catch (error) {
          console.warn('[Sandbox] Failed to apply resource guards', error);
        }
      };

      const cleanup = () => {
        signal?.removeEventListener('abort', handleAbort);
        child.removeAllListeners('message');
        child.removeAllListeners('error');
        child.removeAllListeners('exit');
        if (heartbeatMonitor) {
          clearInterval(heartbeatMonitor);
          heartbeatMonitor = null;
        }
        if (resourceMonitor) {
          clearInterval(resourceMonitor);
          resourceMonitor = null;
        }
        if (executionCgroup) {
          executionCgroup.cleanup().catch(() => {});
          executionCgroup = null;
        }
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
        terminate();
        cleanup();

        const durationMs = performance.now() - start;
        if (error) {
          reject(error);
        } else {
          resolve({ result: value ?? null, logs, durationMs });
        }
      };

      const triggerResourceViolation = (
        resource: 'cpu' | 'memory',
        usage: number,
        limit: number,
      ) => {
        const event: SandboxPolicyEvent = { type: 'resource-limit', resource, usage, limit };
        emitPolicyEvent(event);
        const message = resource === 'cpu'
          ? `Sandbox CPU limit exceeded: ${usage.toFixed(2)}ms > ${limit.toFixed(2)}ms`
          : `Sandbox memory limit exceeded: ${Math.round(usage / (1024 * 1024))}MB > ${Math.round(limit / (1024 * 1024))}MB`;
        terminate();
        finalize(new SandboxResourceLimitError(resource, usage, limit, message));
      };

      const startMonitors = () => {
        if (!heartbeatMonitor) {
          heartbeatMonitor = setInterval(() => {
            const elapsed = Date.now() - lastHeartbeat;
            if (elapsed > effectiveHeartbeatTimeout) {
              finalize(
                new SandboxHeartbeatTimeoutError(
                  `Sandbox heartbeat missed for ${elapsed}ms (timeout=${effectiveHeartbeatTimeout}ms)`,
                ),
              );
            }
          }, Math.min(Math.max(effectiveHeartbeatInterval, 50), effectiveHeartbeatTimeout));
          if (typeof heartbeatMonitor.unref === 'function') {
            heartbeatMonitor.unref();
          }
        }

        if (resourceLimits && !resourceMonitor) {
          const maxCpuMs = Number(resourceLimits.maxCpuMs);
          const maxMemoryBytes = Number(resourceLimits.maxMemoryBytes);
          if (Number.isFinite(maxCpuMs) || Number.isFinite(maxMemoryBytes)) {
            resourceMonitor = setInterval(() => {
              if (settled) {
                return;
              }
              try {
                const usage = child.resourceUsage();
                if (!usage) {
                  return;
                }
                if (Number.isFinite(maxCpuMs)) {
                  const cpuLimit = Number(maxCpuMs);
                  const cpuMs = (usage.userCPUTime + usage.systemCPUTime) / 1000;
                  if (cpuMs > cpuLimit) {
                    triggerResourceViolation('cpu', cpuMs, cpuLimit);
                    return;
                  }
                }
                if (Number.isFinite(maxMemoryBytes) && usage.maxRSS) {
                  const memoryLimit = Number(maxMemoryBytes);
                  const rssBytes = usage.maxRSS * 1024;
                  if (rssBytes > memoryLimit) {
                    triggerResourceViolation('memory', rssBytes, memoryLimit);
                  }
                }
              } catch (error) {
                // resourceUsage may throw before the child is fully initialized
              }
            }, RESOURCE_POLL_INTERVAL_MS);
            if (resourceMonitor && typeof resourceMonitor.unref === 'function') {
              resourceMonitor.unref();
            }
          }
        }
      };

      child.once('spawn', () => {
        (async () => {
          await applyRuntimeGuards();
          startMonitors();
        })().catch((error) => {
          console.warn('[Sandbox] Failed during spawn handling', error);
          startMonitors();
        });
      });

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
        if (message.type === 'heartbeat') {
          lastHeartbeat = Date.now();
          return;
        }
        if (message.type === 'policy_violation') {
          const event = normalizePolicyEvent(message.event);
          if (event) {
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
