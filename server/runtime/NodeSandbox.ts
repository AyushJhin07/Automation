import { performance } from 'node:perf_hooks';
import { SpanStatusCode } from '@opentelemetry/api';

import { recordNodeLatency, tracer } from '../observability/index.js';
import {
  SandboxExecutionResult,
  SandboxExecutor,
  SandboxExecutorRunOptions,
  SandboxAbortError,
  SandboxTimeoutError,
  dedupeSecrets,
  sanitizeForTransfer,
} from './SandboxShared';
import { WorkerSandboxExecutor } from './WorkerSandboxExecutor';
import { ProcessSandboxExecutor } from './ProcessSandboxExecutor';

const DEFAULT_TIMEOUT_MS = 15_000;

export interface SandboxExecutionOptions {
  code: string;
  entryPoint?: string;
  params?: any;
  context?: any;
  timeoutMs?: number;
  signal?: AbortSignal;
  secrets?: string[];
}

export { collectSecretStrings } from './SandboxShared';
export type { SandboxLogEntry } from './SandboxShared';
export { SandboxAbortError, SandboxTimeoutError } from './SandboxShared';

function resolveExecutorFromEnv(): SandboxExecutor {
  const requested = (process.env.SANDBOX_EXECUTOR || '').toLowerCase();
  if (requested) {
    if (['worker', 'worker_thread', 'worker-threads', 'thread'].includes(requested)) {
      return new WorkerSandboxExecutor();
    }
    if (['process', 'proc', 'child_process', 'processes'].includes(requested)) {
      return new ProcessSandboxExecutor();
    }
  }

  if (process.env.WORKER_SANDBOX_ENABLED === 'true') {
    return new WorkerSandboxExecutor();
  }

  return new ProcessSandboxExecutor();
}

export class NodeSandbox {
  private executor: SandboxExecutor;

  constructor(executor: SandboxExecutor = resolveExecutorFromEnv()) {
    this.executor = executor;
  }

  setExecutor(executor: SandboxExecutor): void {
    this.executor = executor;
  }

  getExecutor(): SandboxExecutor {
    return this.executor;
  }

  async execute(options: SandboxExecutionOptions): Promise<SandboxExecutionResult> {
    const {
      code,
      entryPoint = 'run',
      params = {},
      context = {},
      timeoutMs = DEFAULT_TIMEOUT_MS,
      signal,
      secrets = [],
    } = options;

    if (typeof code !== 'string' || code.trim().length === 0) {
      throw new Error('Sandbox execution requires a code string');
    }

    if (signal?.aborted) {
      throw new SandboxAbortError('Sandbox execution aborted before start');
    }

    const spanAttributes = {
      'workflow.execution_id': (context as Record<string, unknown>)?.executionId as string | undefined,
      'workflow.workflow_id': (context as Record<string, unknown>)?.workflowId as string | undefined,
      'workflow.node_id': (context as Record<string, unknown>)?.nodeId as string | undefined,
      'sandbox.entry_point': entryPoint,
    } as const;

    return tracer.startActiveSpan('workflow.sandbox', { attributes: spanAttributes }, async (span) => {
      const start = performance.now();
      try {
        const sanitizedParams = sanitizeForTransfer(params, 'params');
        const sanitizedContext = sanitizeForTransfer(context, 'context');
        const collectedSecrets = dedupeSecrets(secrets);

        const executorOptions: SandboxExecutorRunOptions = {
          code,
          entryPoint,
          params: sanitizedParams,
          context: sanitizedContext,
          timeoutMs,
          signal,
          secrets: collectedSecrets,
        };

        const outcome = await this.executor.run(executorOptions);

        span.setAttribute('sandbox.log_count', outcome.logs.length);
        span.setStatus({ code: SpanStatusCode.OK });
        return outcome;
      } catch (error) {
        const exception = error instanceof Error ? error : new Error(String(error));
        span.recordException(exception);
        span.setStatus({ code: SpanStatusCode.ERROR, message: exception.message });
        throw error;
      } finally {
        const durationMs = performance.now() - start;
        span.setAttribute('sandbox.duration_ms', durationMs);
        recordNodeLatency(durationMs, {
          workflow_id: spanAttributes['workflow.workflow_id'],
          execution_id: spanAttributes['workflow.execution_id'],
          node_id: spanAttributes['workflow.node_id'],
          entry_point: entryPoint,
        });
        span.end();
      }
    });
  }
}

export const nodeSandbox = new NodeSandbox();
