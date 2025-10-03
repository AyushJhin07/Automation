import { Worker } from 'node:worker_threads';
import { performance } from 'node:perf_hooks';
import { SpanStatusCode } from '@opentelemetry/api';

import { recordNodeLatency, tracer } from '../observability/index.js';

const DEFAULT_TIMEOUT_MS = 15_000;
const REDACTION_TOKEN = '[REDACTED]';

type Primitive = string | number | boolean | null;
type AllowedValue = Primitive | AllowedValue[] | { [key: string]: AllowedValue };

type SandboxLogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

export interface SandboxExecutionOptions {
  code: string;
  entryPoint?: string;
  params?: any;
  context?: any;
  timeoutMs?: number;
  signal?: AbortSignal;
  secrets?: string[];
}

export interface SandboxLogEntry {
  level: SandboxLogLevel;
  message: string;
}

export interface SandboxExecutionResult {
  result: AllowedValue;
  logs: SandboxLogEntry[];
  durationMs: number;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function sanitizeForTransfer(value: any, path: string): AllowedValue {
  if (value === null || value === undefined) {
    return null;
  }
  const type = typeof value;
  if (type === 'string' || type === 'boolean') {
    return value as Primitive;
  }
  if (type === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`Non-finite number encountered in sandbox payload at ${path}`);
    }
    return value as Primitive;
  }
  if (type === 'bigint') {
    const numeric = Number(value);
    if (Number.isSafeInteger(numeric)) {
      return numeric as Primitive;
    }
    return value.toString();
  }
  if (Array.isArray(value)) {
    return value.map((entry, index) => sanitizeForTransfer(entry, `${path}[${index}]`));
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value instanceof URL) {
    return value.toString();
  }
  if (value instanceof RegExp) {
    return value.toString();
  }
  if (ArrayBuffer.isView(value)) {
    const view = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    return Array.from(view);
  }
  if (value instanceof ArrayBuffer) {
    return Array.from(new Uint8Array(value));
  }
  if (typeof value.toJSON === 'function') {
    return sanitizeForTransfer(value.toJSON(), `${path}.toJSON()`);
  }
  if (isPlainObject(value)) {
    const result: Record<string, AllowedValue> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (entry === undefined) {
        continue;
      }
      result[key] = sanitizeForTransfer(entry, `${path}.${key}`);
    }
    return result;
  }
  throw new Error(`Unsupported value type in sandbox payload at ${path}: ${Object.prototype.toString.call(value)}`);
}

export function collectSecretStrings(source: any): string[] {
  const found: string[] = [];
  const stack: any[] = [source];
  while (stack.length) {
    const current = stack.pop();
    if (!current) continue;
    if (typeof current === 'string') {
      if (current.length > 0) {
        found.push(current);
      }
      continue;
    }
    if (Array.isArray(current)) {
      for (const entry of current) {
        stack.push(entry);
      }
      continue;
    }
    if (isPlainObject(current)) {
      for (const entry of Object.values(current)) {
        stack.push(entry);
      }
      continue;
    }
  }
  return found;
}

function dedupeSecrets(values: string[]): string[] {
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value !== 'string' || value.length === 0) continue;
    seen.add(value);
  }
  return Array.from(seen);
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function redactValue<T>(value: T, secrets: string[]): T {
  if (!secrets.length) {
    return value;
  }

  const applyRedaction = (input: any): any => {
    if (typeof input === 'string') {
      return secrets.reduce((current, secret) => {
        if (!secret) return current;
        const pattern = new RegExp(escapeForRegExp(secret), 'g');
        return current.replace(pattern, REDACTION_TOKEN);
      }, input);
    }
    if (Array.isArray(input)) {
      return input.map(item => applyRedaction(item));
    }
    if (isPlainObject(input)) {
      const result: Record<string, any> = {};
      for (const [key, entry] of Object.entries(input)) {
        result[key] = applyRedaction(entry);
      }
      return result;
    }
    return input;
  };

  return applyRedaction(value);
}

function formatLog(args: any[]): string {
  return args
    .map(arg => {
      if (typeof arg === 'string') {
        return arg;
      }
      if (typeof arg === 'number' || typeof arg === 'boolean') {
        return String(arg);
      }
      if (arg === null) {
        return 'null';
      }
      try {
        return JSON.stringify(arg);
      } catch {
        return '[Unserializable]';
      }
    })
    .join(' ');
}

const sanitizeFunctionSource = sanitizeForTransfer.toString();
const redactFunctionSource = redactValue.toString();
const escapeRegExpSource = escapeForRegExp.toString();
const isPlainObjectSource = isPlainObject.toString();

const sanitizeErrorSource = function sanitizeError(error: any) {
  if (error == null) {
    return { name: 'Error', message: 'Unknown error' };
  }
  if (typeof error === 'string') {
    return { name: 'Error', message: error };
  }
  const name = typeof error.name === 'string' ? error.name : 'Error';
  const message = typeof error.message === 'string' ? error.message : String(error);
  const stack = typeof error.stack === 'string' ? error.stack : undefined;
  const result: Record<string, any> = { name, message };
  if (stack) {
    result.stack = stack;
  }
  return result;
}.toString();
const formatLogSource = formatLog.toString();

const workerSource = `import { parentPort, workerData } from 'node:worker_threads';
import vm from 'node:vm';

const {
  code,
  entryPoint,
  params,
  context,
  timeoutMs,
  secrets
} = workerData;

const isPlainObject = ${isPlainObjectSource};
const sanitizeForTransfer = ${sanitizeFunctionSource};
const escapeForRegExp = ${escapeRegExpSource};
const redactValue = ${redactFunctionSource};
const sanitizeError = ${sanitizeErrorSource};
const formatLog = ${formatLogSource};

const redactionSecrets = Array.isArray(secrets) ? secrets.filter((value) => typeof value === 'string' && value.length > 0) : [];

const abortController = new AbortController();
if (parentPort) {
  parentPort.on('message', (message) => {
    if (message && message.type === 'abort') {
      abortController.abort();
    }
  });
}

const consoleProxy: Record<string, (...args: any[]) => void> = {};
for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
  consoleProxy[level] = (...args: any[]) => {
    const sanitized = sanitizeForTransfer(args, 'console');
    const redacted = redactValue(sanitized, redactionSecrets);
    parentPort?.postMessage({ type: 'log', level, data: redacted });
  };
}

const safeFetch = (input: any, init?: any) => {
  const merged = init ? { ...init } : {};
  if (!merged.signal) {
    merged.signal = abortController.signal;
  }
  return fetch(input, merged);
};

const safeGlobals: Record<string, any> = {
  console: consoleProxy,
  fetch: safeFetch,
  AbortController,
  AbortSignal,
  URL,
  URLSearchParams,
  TextEncoder,
  TextDecoder,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  queueMicrotask,
  atob,
  btoa,
  crypto,
  Date,
  Math,
  JSON,
  Intl,
  Promise,
  Map,
  Set,
  WeakMap,
  WeakSet,
  Array,
  ArrayBuffer,
  DataView,
  Uint8Array,
  Int8Array,
  Int16Array,
  Uint16Array,
  Int32Array,
  Uint32Array,
  Float32Array,
  Float64Array,
  BigInt64Array,
  BigUint64Array,
  String,
  Number,
  Boolean,
  RegExp,
  Object,
  Reflect,
  Proxy,
  Error,
  TypeError,
  SyntaxError,
  RangeError,
  URIError,
  encodeURI,
  encodeURIComponent,
  decodeURI,
  decodeURIComponent,
  performance
};

const globalObject = Object.create(null);
for (const [key, value] of Object.entries(safeGlobals)) {
  globalObject[key] = value;
}

globalObject.global = globalObject;
globalObject.globalThis = globalObject;
globalObject.require = undefined;
globalObject.process = undefined;
globalObject.Buffer = undefined;
globalObject.__dirname = undefined;
globalObject.__filename = undefined;

const moduleContext = vm.createContext(globalObject, { name: 'sandbox-context' });

async function loadModule() {
  const module = new vm.SourceTextModule(code, {
    identifier: 'sandboxed-connector',
    context: moduleContext
  });

  await module.link(() => {
    throw new Error('Imports are not allowed in sandboxed code.');
  });

  await module.evaluate({ timeout: typeof timeoutMs === 'number' && timeoutMs > 0 ? Math.min(timeoutMs, 10_000) : 5_000 });

  return module.namespace;
}

(async () => {
  try {
    const namespace = await loadModule();
    let handler = namespace[entryPoint] as any;
    if (typeof handler !== 'function') {
      if (typeof namespace.default === 'function') {
        handler = namespace.default;
      }
    }

    if (typeof handler !== 'function') {
      throw new Error(\`Entry point ${entryPoint} is not exported as a function\`);
    }

    const payload = {
      params,
      context,
      signal: abortController.signal,
      fetch: safeFetch
    };

    const result = await handler(payload);
    const sanitized = sanitizeForTransfer(result, 'result');
    const redacted = redactValue(sanitized, redactionSecrets);

    parentPort?.postMessage({ type: 'result', data: redacted });
  } catch (error) {
    const serialized = sanitizeError(error);
    const redacted = redactValue(serialized, redactionSecrets);
    parentPort?.postMessage({ type: 'error', error: redacted });
  }
})();
`;

class SandboxTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SandboxTimeoutError';
  }
}

class SandboxAbortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SandboxAbortError';
  }
}

export class NodeSandbox {
  async execute(options: SandboxExecutionOptions): Promise<SandboxExecutionResult> {
    const {
      code,
      entryPoint = 'run',
      params = {},
      context = {},
      timeoutMs = DEFAULT_TIMEOUT_MS,
      signal,
      secrets = []
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

        const worker = new Worker(workerSource, {
          eval: true,
          workerData: {
            code,
            entryPoint,
            params: sanitizedParams,
            context: sanitizedContext,
            timeoutMs,
            secrets: collectedSecrets
          },
          type: 'module'
        });

        const logs: SandboxLogEntry[] = [];

        const outcome = await new Promise<SandboxExecutionResult>((resolve, reject) => {
          let settled = false;
          let hardTimeout: NodeJS.Timeout | null = null;

          const finalize = (error: Error | null, result?: AllowedValue) => {
            if (settled) {
              return;
            }
            settled = true;
            if (hardTimeout) {
              clearTimeout(hardTimeout);
              hardTimeout = null;
            }
            signal?.removeEventListener('abort', handleAbort);
            worker.removeAllListeners?.('message');
            worker.removeAllListeners?.('error');
            worker.removeAllListeners?.('exit');
            worker.terminate().catch(() => {});

            const durationMs = performance.now() - start;

            if (error) {
              reject(error);
            } else {
              resolve({ result: result ?? null, logs, durationMs });
            }
          };

          const handleAbort = () => {
            worker.postMessage({ type: 'abort' });
            finalize(new SandboxAbortError('Sandbox execution aborted'));
          };

          if (signal) {
            signal.addEventListener('abort', handleAbort, { once: true });
          }

          if (timeoutMs > 0) {
            hardTimeout = setTimeout(() => {
              worker.postMessage({ type: 'abort' });
              hardTimeout = setTimeout(() => {
                worker.terminate().catch(() => {});
              }, 1000);
              finalize(new SandboxTimeoutError(`Sandbox execution timed out after ${timeoutMs}ms`));
            }, timeoutMs);
          }

          worker.on('message', (message: any) => {
            if (!message) return;
            if (message.type === 'log') {
              try {
                const formatted = typeof message.data === 'string' ? message.data : formatLog(message.data as any[]);
                logs.push({
                  level: (message.level as SandboxLogLevel) || 'log',
                  message: formatted
                });
              } catch (error) {
                logs.push({ level: 'warn', message: '[Sandbox] Failed to format log output' });
              }
              return;
            }
            if (message.type === 'result') {
              finalize(null, message.data as AllowedValue);
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
