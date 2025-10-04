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
  resourceLimits?: SandboxResourceLimits;
  networkPolicy?: SandboxNetworkPolicy | null;
  heartbeatIntervalMs?: number;
  heartbeatTimeoutMs?: number;
  onPolicyEvent?: (event: SandboxPolicyEvent) => void;
}

export interface SandboxExecutionResult {
  result: AllowedValue;
  logs: SandboxLogEntry[];
  durationMs: number;
}

export interface SandboxResourceLimits {
  maxCpuMs?: number;
  maxMemoryBytes?: number;
  cpuQuotaMs?: number;
  cgroupRoot?: string;
}

export interface SandboxNetworkAllowlist {
  domains: string[];
  ipRanges: string[];
}

export interface SandboxNetworkPolicy {
  allowlist: SandboxNetworkAllowlist | null;
  denylist?: SandboxNetworkAllowlist | null;
  required?: SandboxNetworkAllowlist | null;
  audit?: {
    organizationId?: string;
    executionId?: string;
    nodeId?: string;
    connectionId?: string;
    userId?: string;
  } | null;
}

export type SandboxPolicyEvent =
  | {
      type: 'network-denied';
      host: string;
      url: string;
      reason: string;
      allowlist?: SandboxNetworkAllowlist | null;
      denylist?: SandboxNetworkAllowlist | null;
      required?: SandboxNetworkAllowlist | null;
      audit?: SandboxNetworkPolicy['audit'];
    }
  | {
      type: 'resource-limit';
      resource: 'cpu' | 'memory';
      usage: number;
      limit: number;
    };

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

const networkPolicyHelpersSource = `function normalizeNetworkList(values) {
  if (!Array.isArray(values)) {
    return [];
  }
  const normalized = [];
  for (const value of values) {
    if (typeof value !== 'string') {
      continue;
    }
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) {
      continue;
    }
    if (!normalized.includes(trimmed)) {
      normalized.push(trimmed);
    }
  }
  return normalized;
}

function parseIpv4(address) {
  if (typeof address !== 'string') {
    return null;
  }
  const parts = address.trim().split('.');
  if (parts.length !== 4) {
    return null;
  }
  let value = 0;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) {
      return null;
    }
    const num = Number(part);
    if (!Number.isInteger(num) || num < 0 || num > 255) {
      return null;
    }
    value = (value << 8) | num;
  }
  return value >>> 0;
}

function expandIpv6(address) {
  if (typeof address !== 'string') {
    return null;
  }
  const trimmed = address.trim();
  if (!trimmed) {
    return null;
  }
  const lower = trimmed.toLowerCase();
  const sections = lower.split('::');
  if (sections.length > 2) {
    return null;
  }
  const head = sections[0] ? sections[0].split(':') : [];
  const tail = sections[1] ? sections[1].split(':') : [];
  if (head.length === 1 && head[0] === '') {
    head.length = 0;
  }
  if (tail.length === 1 && tail[0] === '') {
    tail.length = 0;
  }
  const missing = 8 - (head.length + tail.length);
  if (missing < 0) {
    return null;
  }
  const segments = head.concat(Array(missing).fill('0'), tail);
  if (segments.length !== 8) {
    return null;
  }
  const values = [];
  for (const segment of segments) {
    if (!segment) {
      values.push(0);
      continue;
    }
    if (!/^[0-9a-f]{1,4}$/i.test(segment)) {
      return null;
    }
    values.push(parseInt(segment, 16));
  }
  return values;
}

function parseIpv6(address) {
  const expanded = expandIpv6(address);
  if (!expanded) {
    return null;
  }
  let value = 0n;
  for (const segment of expanded) {
    value = (value << 16n) | BigInt(segment);
  }
  return value;
}

function isIpv4InCidr(ip, cidr) {
  const parts = typeof cidr === 'string' ? cidr.split('/') : [];
  if (parts.length !== 2) {
    return false;
  }
  const [range, prefixStr] = parts;
  const prefix = Number(prefixStr);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
    return false;
  }
  const rangeValue = parseIpv4(range);
  const ipValue = parseIpv4(ip);
  if (rangeValue === null || ipValue === null) {
    return false;
  }
  if (prefix === 0) {
    return true;
  }
  const mask = prefix === 32 ? 0xffffffff : (~((1 << (32 - prefix)) - 1)) >>> 0;
  return (rangeValue & mask) === (ipValue & mask);
}

function isIpv6InCidr(ip, cidr) {
  const parts = typeof cidr === 'string' ? cidr.split('/') : [];
  if (parts.length !== 2) {
    return false;
  }
  const [range, prefixStr] = parts;
  const prefix = Number(prefixStr);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 128) {
    return false;
  }
  const rangeValue = parseIpv6(range);
  const ipValue = parseIpv6(ip);
  if (rangeValue === null || ipValue === null) {
    return false;
  }
  if (prefix === 0) {
    return true;
  }
  const shift = 128 - prefix;
  const mask = shift === 0 ? (1n << 128n) - 1n : ((1n << 128n) - 1n) ^ ((1n << BigInt(shift)) - 1n);
  return (rangeValue & mask) === (ipValue & mask);
}

function isHostnameAllowed(hostname, domains) {
  for (const domain of domains) {
    if (!domain) {
      continue;
    }
    if (domain === '*') {
      return true;
    }
    if (domain.startsWith('*.')) {
      const suffix = domain.slice(2);
      if (hostname === suffix || hostname.endsWith('.' + suffix)) {
        return true;
      }
      continue;
    }
    if (hostname === domain) {
      return true;
    }
    if (hostname.endsWith('.' + domain)) {
      return true;
    }
  }
  return false;
}

function isIpAllowed(hostname, ranges) {
  if (typeof hostname !== 'string') {
    return false;
  }
  const ipv4 = parseIpv4(hostname);
  const ipv6 = ipv4 === null ? parseIpv6(hostname) : null;
  if (ipv4 === null && ipv6 === null) {
    return false;
  }
  for (const range of ranges) {
    if (!range) {
      continue;
    }
    if (range.includes('/')) {
      if (ipv4 !== null && isIpv4InCidr(hostname, range)) {
        return true;
      }
      if (ipv6 !== null && isIpv6InCidr(hostname, range)) {
        return true;
      }
      continue;
    }
    if (hostname === range) {
      return true;
    }
  }
  return false;
}`;

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
  secrets,
  networkPolicy: rawNetworkPolicy,
  heartbeatIntervalMs
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
${networkPolicyHelpersSource}

const networkPolicy = (() => {
  if (!rawNetworkPolicy || typeof rawNetworkPolicy !== 'object') {
    return null;
  }

  const allowlistSource = rawNetworkPolicy.allowlist;
  const allowlist = allowlistSource && typeof allowlistSource === 'object'
    ? {
        domains: normalizeNetworkList(allowlistSource.domains),
        ipRanges: normalizeNetworkList(allowlistSource.ipRanges)
      }
    : null;

  const denylistSource = rawNetworkPolicy.denylist;
  const denylist = denylistSource && typeof denylistSource === 'object'
    ? {
        domains: normalizeNetworkList(denylistSource.domains),
        ipRanges: normalizeNetworkList(denylistSource.ipRanges)
      }
    : null;

  const requiredSource = rawNetworkPolicy.required;
  const required = requiredSource && typeof requiredSource === 'object'
    ? {
        domains: normalizeNetworkList(requiredSource.domains),
        ipRanges: normalizeNetworkList(requiredSource.ipRanges)
      }
    : null;

  const auditSource = rawNetworkPolicy.audit;
  const audit = auditSource && typeof auditSource === 'object'
    ? {
        organizationId: auditSource.organizationId ?? undefined,
        executionId: auditSource.executionId ?? undefined,
        nodeId: auditSource.nodeId ?? undefined,
        connectionId: auditSource.connectionId ?? undefined,
        userId: auditSource.userId ?? undefined
      }
    : null;

  return { allowlist, denylist, required, audit };
})();

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

let heartbeatTimer = null;

const handleControlMessage = (message) => {
  if (message && message.type === 'abort') {
    abortController.abort();
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
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

const heartbeatInterval = typeof heartbeatIntervalMs === 'number' && heartbeatIntervalMs > 0
  ? Math.max(heartbeatIntervalMs, 25)
  : 500;

heartbeatTimer = setInterval(() => {
  sendMessage({ type: 'heartbeat', ts: Date.now() });
}, heartbeatInterval);
if (heartbeatTimer && typeof heartbeatTimer.unref === 'function') {
  heartbeatTimer.unref();
}

const resolveRequestUrl = (input, init) => {
  try {
    if (typeof input === 'string') {
      return input;
    }
    if (input && typeof input === 'object') {
      if (typeof input.url === 'string') {
        return input.url;
      }
      if (typeof input.href === 'string') {
        return input.href;
      }
    }
  } catch {
    return undefined;
  }
  if (init && typeof init.url === 'string') {
    return init.url;
  }
  return undefined;
};

const enforceNetworkPolicy = async (url) => {
  if (!networkPolicy) {
    return;
  }

  const allowlist = networkPolicy.allowlist;
  const denylist = networkPolicy.denylist;
  const required = networkPolicy.required;

  const hasAllowRules = allowlist && (allowlist.domains.length > 0 || allowlist.ipRanges.length > 0);
  const hasDenyRules = denylist && (denylist.domains.length > 0 || denylist.ipRanges.length > 0);

  if (!hasAllowRules && !hasDenyRules) {
    return;
  }

  let parsed;
  try {
    parsed = new URL(url, 'http://sandbox.local');
  } catch {
    return;
  }

  const hostname = parsed.hostname.toLowerCase();
  const port = parsed.port || '';
  const hostWithPort = port ? hostname + ':' + port : hostname;

  const domainDenied = hasDenyRules && denylist && denylist.domains.length > 0 && isHostnameAllowed(hostname, denylist.domains);
  const ipDenied = hasDenyRules && denylist && denylist.ipRanges.length > 0 && isIpAllowed(hostname, denylist.ipRanges);

  if (domainDenied || ipDenied) {
    sendMessage({
      type: 'policy_violation',
      event: {
        type: 'network-denied',
        host: hostWithPort,
        url: parsed.href,
        reason: 'host_denied',
        allowlist: allowlist || null,
        denylist: denylist || null,
        required: required || null,
        audit: networkPolicy.audit || null
      }
    });

    throw new Error('Network request blocked: ' + hostWithPort + ' is explicitly denied for this organization');
  }

  if (hasAllowRules && allowlist) {
    const domainAllowed = allowlist.domains.length > 0 && isHostnameAllowed(hostname, allowlist.domains);
    const ipAllowed = allowlist.ipRanges.length > 0 && isIpAllowed(hostname, allowlist.ipRanges);

    if (domainAllowed || ipAllowed) {
      return;
    }

    sendMessage({
      type: 'policy_violation',
      event: {
        type: 'network-denied',
        host: hostWithPort,
        url: parsed.href,
        reason: 'host_not_allowlisted',
        allowlist,
        denylist: denylist || null,
        required: required || null,
        audit: networkPolicy.audit || null
      }
    });

    throw new Error('Network request blocked: ' + hostWithPort + ' is not allowlisted for this organization');
  }
};

const createSandboxFetch = (originalFetch) => {
  return (input, init) => {
    const merged = init ? { ...init } : {};
    if (!merged.signal) {
      merged.signal = abortController.signal;
    }

    const resolved = resolveRequestUrl(input, merged);

    const execute = async () => {
      if (resolved) {
        await enforceNetworkPolicy(resolved);
      }
      return originalFetch(input, merged);
    };

    return execute();
  };
};

const safeFetch = createSandboxFetch(fetch);

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
  } finally {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
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

export class SandboxPolicyViolationError extends Error {
  public readonly violation: SandboxPolicyEvent;

  constructor(message: string, violation: SandboxPolicyEvent, options?: { cause?: unknown }) {
    super(message);
    this.name = 'SandboxPolicyViolationError';
    this.violation = violation;
    if (options?.cause !== undefined) {
      try {
        (this as any).cause = options.cause;
      } catch {
        // ignore assignment failures in older runtimes
      }
    }
  }
}

export class SandboxResourceLimitError extends SandboxPolicyViolationError {
  public readonly resource: 'cpu' | 'memory';
  public readonly usage: number;
  public readonly limit: number;

  constructor(resource: 'cpu' | 'memory', usage: number, limit: number, message?: string, options?: { cause?: unknown }) {
    const violation: SandboxPolicyEvent = { type: 'resource-limit', resource, usage, limit };
    super(message ?? `Sandbox ${resource.toUpperCase()} limit exceeded`, violation, options);
    this.name = 'SandboxResourceLimitError';
    this.resource = resource;
    this.usage = usage;
    this.limit = limit;
  }
}

export class SandboxHeartbeatTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SandboxHeartbeatTimeoutError';
  }
}
