export type Primitive = string | number | boolean | null;
export type AllowedValue = Primitive | AllowedValue[] | { [key: string]: AllowedValue };

export type SandboxLogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

export interface SandboxLogEntry {
  level: SandboxLogLevel;
  message: string;
}

export interface SandboxExecutorRunOptions {
  code: string;
  entryPoint: string;
  params: AllowedValue;
  context: AllowedValue;
  timeoutMs: number;
  signal?: AbortSignal;
  secrets: string[];
}

export interface SandboxExecutionResult {
  result: AllowedValue;
  logs: SandboxLogEntry[];
  durationMs: number;
}

export interface SandboxExecutor {
  run(options: SandboxExecutorRunOptions): Promise<SandboxExecutionResult>;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function sanitizeForTransfer(value: any, path: string): AllowedValue {
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

export function dedupeSecrets(values: string[]): string[] {
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value !== 'string' || value.length === 0) continue;
    seen.add(value);
  }
  return Array.from(seen);
}

export function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function redactValue<T>(value: T, secrets: string[]): T {
  if (!secrets.length) {
    return value;
  }

  const applyRedaction = (input: any): any => {
    if (typeof input === 'string') {
      return secrets.reduce((current, secret) => {
        if (!secret) return current;
        const pattern = new RegExp(escapeForRegExp(secret), 'g');
        return current.replace(pattern, '[REDACTED]');
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

export function formatLog(args: any[]): string {
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

const sanitizeFunctionSource = sanitizeForTransfer.toString();
const redactFunctionSource = redactValue.toString();
const escapeRegExpSource = escapeForRegExp.toString();
const isPlainObjectSource = isPlainObject.toString();
const formatLogSource = formatLog.toString();

export const SANDBOX_BOOTSTRAP_SOURCE = `import { parentPort, workerData } from 'node:worker_threads';
import vm from 'node:vm';

const runtimeData = (() => {
  if (typeof workerData !== 'undefined' && workerData) {
    return workerData;
  }
  if (typeof process !== 'undefined' && process?.env?.SANDBOX_PAYLOAD) {
    try {
      return JSON.parse(process.env.SANDBOX_PAYLOAD);
    } finally {
      delete process.env.SANDBOX_PAYLOAD;
    }
  }
  throw new Error('Missing sandbox payload');
})();

const {
  code,
  entryPoint: requestedEntryPoint,
  params,
  context,
  timeoutMs,
  secrets
} = runtimeData;

const resolvedEntryPoint = typeof requestedEntryPoint === 'string' && requestedEntryPoint.length > 0
  ? requestedEntryPoint
  : 'run';

const { SourceTextModule } = vm;
if (typeof SourceTextModule !== 'function') {
  throw new Error('Node runtime missing vm.SourceTextModule; start with NODE_OPTIONS=--experimental-vm-modules');
}

const isPlainObject = ${isPlainObjectSource};
const sanitizeForTransfer = ${sanitizeFunctionSource};
const escapeForRegExp = ${escapeRegExpSource};
const redactValue = ${redactFunctionSource};
const sanitizeError = ${sanitizeErrorSource};
const formatLog = ${formatLogSource};

const redactionSecrets = Array.isArray(secrets) ? secrets.filter((value) => typeof value === 'string' && value.length > 0) : [];

const abortController = new AbortController();
const sendMessage = (message) => {
  if (parentPort) {
    parentPort.postMessage(message);
    return;
  }
  if (typeof process !== 'undefined' && typeof process.send === 'function') {
    process.send(message);
  }
};

const handleControlMessage = (message) => {
  if (message && message.type === 'abort') {
    abortController.abort();
  }
};

if (parentPort) {
  parentPort.on('message', handleControlMessage);
} else if (typeof process !== 'undefined') {
  process.on('message', handleControlMessage);
}

const consoleProxy = {};
for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
  consoleProxy[level] = (...args) => {
    const sanitized = sanitizeForTransfer(args, 'console');
    const redacted = redactValue(sanitized, redactionSecrets);
    sendMessage({ type: 'log', level, data: redacted });
  };
}

const safeFetch = (input, init) => {
  const merged = init ? { ...init } : {};
  if (!merged.signal) {
    merged.signal = abortController.signal;
  }
  return fetch(input, merged);
};

const safeGlobals = {
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
  const module = new SourceTextModule(code, {
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
    let handler = namespace[resolvedEntryPoint];
    if (typeof handler !== 'function') {
      if (typeof namespace.default === 'function') {
        handler = namespace.default;
      }
    }

    if (typeof handler !== 'function') {
      throw new Error('Entry point ' + resolvedEntryPoint + ' is not exported as a function');
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

    sendMessage({ type: 'result', data: redacted });
  } catch (error) {
    const serialized = sanitizeError(error);
    const redacted = redactValue(serialized, redactionSecrets);
    sendMessage({ type: 'error', error: redacted });
  }
})();
`;

export class SandboxTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SandboxTimeoutError';
  }
}

export class SandboxAbortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SandboxAbortError';
  }
}
