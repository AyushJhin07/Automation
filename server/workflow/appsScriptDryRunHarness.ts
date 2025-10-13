import assert from 'node:assert';
import { readFile, readdir } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import crypto from 'node:crypto';
import util from 'node:util';
import vm from 'node:vm';

import type { WorkflowGraph } from '../../common/workflow-types';
import { compileToAppsScript } from './compile-to-appsscript';

export interface AppsScriptFixture {
  id: string;
  description?: string;
  graph: WorkflowGraph;
  entry?: {
    context?: Record<string, any>;
  };
  secrets?: Record<string, string>;
  http?: HttpFixture[];
  expect?: FixtureExpectations;
}

export interface FixtureExpectations {
  context?: Record<string, any>;
  logs?: LogExpectation[];
  httpCalls?: HttpCallExpectation[];
}

export interface HttpFixture {
  name?: string;
  request: HttpRequestExpectation;
  response: HttpResponseMock;
}

export interface HttpRequestExpectation {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  payload?: any;
}

export interface HttpResponseMock {
  status: number;
  body?: any;
  headers?: Record<string, string>;
}

export interface LogExpectation {
  level?: 'log' | 'warn' | 'error';
  includes?: string;
  matches?: string;
}

export interface HttpCallExpectation {
  url?: string;
  method?: string;
  includesPayloadFragment?: string;
}

export interface LogEntry {
  level: 'log' | 'warn' | 'error';
  message: string;
  args: unknown[];
}

export interface RecordedHttpCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  payload?: any;
  fixtureName?: string;
}

export interface FixtureRunResult {
  id: string;
  description?: string;
  success: boolean;
  durationMs: number;
  context?: any;
  logs: LogEntry[];
  httpCalls: RecordedHttpCall[];
  error?: string;
  failedExpectations?: string[];
  stack?: string;
}

export interface AppsScriptDryRunSummary {
  results: FixtureRunResult[];
  passed: number;
  failed: number;
  durationMs: number;
}

interface SandboxOptions {
  secrets?: Record<string, string>;
  httpFixtures?: HttpFixture[];
}

interface SandboxRunResult {
  context: any;
  logs: LogEntry[];
  httpCalls: RecordedHttpCall[];
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');
const DEFAULT_FIXTURE_DIR = resolve(__dirname, '__tests__', 'apps-script-fixtures');

class FixtureAssertionError extends Error {
  public readonly expectationFailures: string[];
  public readonly details?: { context?: any; logs?: LogEntry[]; httpCalls?: RecordedHttpCall[] };

  constructor(message: string, failures: string[], details?: { context?: any; logs?: LogEntry[]; httpCalls?: RecordedHttpCall[] }) {
    super(message);
    this.expectationFailures = failures;
    this.details = details;
    this.name = 'FixtureAssertionError';
  }
}

class ConsoleCapture {
  public readonly logs: LogEntry[] = [];

  log = (...args: unknown[]) => {
    this.push('log', args);
  };

  warn = (...args: unknown[]) => {
    this.push('warn', args);
  };

  error = (...args: unknown[]) => {
    this.push('error', args);
  };

  private push(level: 'log' | 'warn' | 'error', args: unknown[]): void {
    const message = args.length === 0 ? '' : util.format(...args);
    this.logs.push({ level, message, args });
  }
}

class HttpResponse {
  constructor(private readonly mock: HttpResponseMock) {}

  getContentText(): string {
    if (typeof this.mock.body === 'string') {
      return this.mock.body;
    }
    if (this.mock.body === undefined || this.mock.body === null) {
      return '';
    }
    return JSON.stringify(this.mock.body);
  }

  getResponseCode(): number {
    return this.mock.status;
  }

  getAllHeaders(): Record<string, string> {
    return { ...(this.mock.headers ?? {}) };
  }
}

class UrlFetchStub {
  private readonly queue: HttpFixture[];
  private readonly callsInternal: RecordedHttpCall[] = [];

  constructor(fixtures: HttpFixture[]) {
    this.queue = fixtures.map(fixture => ({ ...fixture }));
  }

  get api() {
    return {
      fetch: (url: string, options?: any) => this.fetch(url, options)
    };
  }

  get calls(): RecordedHttpCall[] {
    return this.callsInternal;
  }

  private normalizeHeaders(headers?: Record<string, string> | null): Record<string, string> {
    const normalized: Record<string, string> = {};
    if (!headers) {
      return normalized;
    }
    for (const [key, value] of Object.entries(headers)) {
      normalized[key.toLowerCase()] = value;
    }
    return normalized;
  }

  private normalizePayload(payload: any): any {
    if (payload === undefined || payload === null) {
      return undefined;
    }
    if (typeof payload === 'string') {
      try {
        return JSON.parse(payload);
      } catch {
        return payload;
      }
    }
    if (payload instanceof ArrayBuffer || ArrayBuffer.isView(payload)) {
      return this.normalizePayload(Buffer.from(payload as any).toString('utf8'));
    }
    if (typeof payload === 'object') {
      return payload;
    }
    return payload;
  }

  fetch(url: string, rawOptions?: any): HttpResponse {
    if (this.queue.length === 0) {
      throw new Error(`Unexpected UrlFetchApp.fetch call for ${url}`);
    }

    const fixture = this.queue.shift()!;
    const options = rawOptions && typeof rawOptions === 'object' ? rawOptions : {};
    const method = (options.method || 'GET').toString().toUpperCase();
    const headers = this.normalizeHeaders(options.headers ?? (options.header || {}));
    const payload = this.normalizePayload(options.payload ?? options.body);

    if (fixture.request.url !== url) {
      throw new Error(`Expected HTTP request to ${fixture.request.url} but received ${url}`);
    }

    if (fixture.request.method && fixture.request.method.toUpperCase() !== method) {
      throw new Error(`Expected HTTP method ${fixture.request.method.toUpperCase()} but received ${method}`);
    }

    if (fixture.request.headers) {
      for (const [key, expected] of Object.entries(fixture.request.headers)) {
        const actual = headers[key.toLowerCase()];
        assert.strictEqual(
          actual,
          expected,
          `Expected header ${key}=${expected} but received ${actual ?? 'undefined'} on ${fixture.request.url}`
        );
      }
    }

    if (fixture.request.payload !== undefined) {
      assertSubset(
        payload,
        fixture.request.payload,
        `payload for ${fixture.request.url}`
      );
    }

    this.callsInternal.push({
      url,
      method,
      headers,
      payload,
      fixtureName: fixture.name
    });

    return new HttpResponse(fixture.response);
  }

  assertAllConsumed(): void {
    if (this.queue.length > 0) {
      const remaining = this.queue.map(f => f.request.url).join(', ');
      throw new Error(`Expected HTTP interactions not executed: ${remaining}`);
    }
  }
}

class PropertiesStore {
  private readonly store: Record<string, string>;

  constructor(initial: Record<string, string>) {
    this.store = { ...initial };
  }

  getProperty(key: string): string | null {
    return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null;
  }

  setProperty(key: string, value: any): void {
    this.store[key] = value == null ? '' : String(value);
  }

  deleteProperty(key: string): void {
    delete this.store[key];
  }

  getProperties(): Record<string, string> {
    return { ...this.store };
  }
}

export class AppsScriptSandbox {
  private readonly consoleCapture = new ConsoleCapture();
  private readonly urlFetch: UrlFetchStub;
  private readonly properties: PropertiesStore;
  private readonly context: vm.Context;

  constructor(options: SandboxOptions) {
    this.urlFetch = new UrlFetchStub(options.httpFixtures ?? []);
    this.properties = new PropertiesStore(options.secrets ?? {});

    const utilities = this.createUtilities();

    const scriptProperties = {
      getProperty: (key: string) => this.properties.getProperty(key),
      setProperty: (key: string, value: any) => {
        this.properties.setProperty(key, value);
      },
      deleteProperty: (key: string) => {
        this.properties.deleteProperty(key);
      },
      getProperties: () => this.properties.getProperties(),
    };

    const propertiesService = {
      getScriptProperties: () => scriptProperties,
      getUserProperties: () => scriptProperties,
      getDocumentProperties: () => scriptProperties,
    };

    const logger = {
      log: (...args: unknown[]) => this.consoleCapture.log(...args),
      info: (...args: unknown[]) => this.consoleCapture.log(...args),
      warn: (...args: unknown[]) => this.consoleCapture.warn(...args),
      error: (...args: unknown[]) => this.consoleCapture.error(...args),
    };

    const session = {
      getActiveUser: () => ({
        getEmail: () => 'apps-script-emulator@example.com'
      })
    };

    const sandbox: Record<string, any> = {
      console: this.consoleCapture,
      Logger: logger,
      PropertiesService: propertiesService,
      UrlFetchApp: this.urlFetch.api,
      Utilities: utilities,
      Session: session,
      ScriptApp: this.createScriptAppStub(),
      globalThis: undefined,
      global: undefined,
    };

    sandbox.globalThis = sandbox;
    sandbox.global = sandbox;

    this.context = vm.createContext(sandbox, {
      name: 'AppsScriptSandbox'
    });
  }

  evaluate(code: string): void {
    const script = new vm.Script(code, { filename: 'Code.gs' });
    script.runInContext(this.context, { displayErrors: true });
  }

  async runMain(initialContext: Record<string, any>): Promise<SandboxRunResult> {
    const mainFn = (this.context as any).main;
    if (typeof mainFn !== 'function') {
      throw new Error('Compiled Apps Script bundle did not expose a main(ctx) function');
    }

    const cloned = clone(initialContext ?? {});
    const maybePromise = mainFn(cloned);
    const contextResult = await Promise.resolve(maybePromise);

    return {
      context: contextResult,
      logs: this.consoleCapture.logs,
      httpCalls: this.urlFetch.calls,
    };
  }

  async runFunction(functionName: string, ...args: any[]): Promise<SandboxRunResult> {
    if (!functionName || typeof functionName !== 'string') {
      throw new Error('runFunction requires a function name');
    }

    const target = (this.context as any)[functionName];
    if (typeof target !== 'function') {
      throw new Error(`Compiled Apps Script bundle did not expose a ${functionName} function`);
    }

    const result = await Promise.resolve(target.apply(undefined, args));

    return {
      context: result,
      logs: this.consoleCapture.logs,
      httpCalls: this.urlFetch.calls,
    };
  }

  verifyHttpExpectations(): void {
    this.urlFetch.assertAllConsumed();
  }

  private createUtilities(): Record<string, any> {
    return {
      sleep: (_ms: number) => { /* no-op in emulator */ },
      base64Decode: (value: string) => Buffer.from(value, 'base64'),
      base64Encode: (value: any) => Buffer.from(value).toString('base64'),
      base64EncodeWebSafe: (value: any) => Buffer.from(value).toString('base64url'),
      computeHmacSha256: (data: any, key: any) => {
        const dataBuffer = Array.isArray(data) ? Buffer.from(data) : Buffer.from(data);
        const keyBuffer = Array.isArray(key) ? Buffer.from(key) : Buffer.from(key);
        return crypto.createHmac('sha256', keyBuffer).update(dataBuffer).digest();
      },
      newBlob: (value: any, _contentType?: string) => {
        const buffer = Buffer.isBuffer(value) ? value : Buffer.from(String(value ?? ''));
        return {
          getBytes: () => Array.from(buffer),
        };
      },
      formatDate: (date: Date | number | string, _timezone: string, _format: string) => {
        const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
        return d.toISOString();
      },
      getUuid: () => crypto.randomUUID(),
    };
  }

  private createScriptAppStub(): Record<string, any> {
    const builder = {
      timeBased: () => ({
        everyMinutes: (_minutes: number) => ({ create: () => ({ getUniqueId: () => 'trigger-' + Date.now() }) }),
        everyHours: (_hours: number) => ({ create: () => ({ getUniqueId: () => 'trigger-' + Date.now() }) }),
        atHour: (_hour: number) => ({ onWeekDay: () => ({ create: () => ({ getUniqueId: () => 'trigger-' + Date.now() }) }) }),
        create: () => ({ getUniqueId: () => 'trigger-' + Date.now() })
      }),
      forSpreadsheet: () => ({ onEdit: () => ({ create: () => ({ getUniqueId: () => 'trigger-' + Date.now() }) }) })
    };

    return {
      getProjectTriggers: () => [],
      deleteTrigger: () => {},
      newTrigger: () => builder,
      WeekDay: {
        MONDAY: 'MONDAY',
        TUESDAY: 'TUESDAY',
        WEDNESDAY: 'WEDNESDAY',
        THURSDAY: 'THURSDAY',
        FRIDAY: 'FRIDAY',
        SATURDAY: 'SATURDAY',
        SUNDAY: 'SUNDAY'
      },
    };
  }
}

function clone<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function assertSubset(actual: any, expected: any, path: string = ''): void {
  if (expected === null || typeof expected !== 'object') {
    assert.deepStrictEqual(actual, expected, `Mismatch at ${path || 'value'}`);
    return;
  }

  if (Array.isArray(expected)) {
    assert(Array.isArray(actual), `Expected array at ${path || 'value'}`);
    assert.strictEqual(actual.length, expected.length, `Array length mismatch at ${path || 'value'}`);
    expected.forEach((item, index) => {
      assertSubset(actual[index], item, `${path}[${index}]`);
    });
    return;
  }

  assert(actual && typeof actual === 'object', `Expected object at ${path || 'value'}`);

  for (const [key, value] of Object.entries(expected)) {
    const childPath = path ? `${path}.${key}` : key;
    assertSubset((actual as any)[key], value, childPath);
  }
}

function ensureLogExpectations(logs: LogEntry[], expectations: LogExpectation[]): string[] {
  const failures: string[] = [];
  for (const expectation of expectations) {
    const matcher = (entry: LogEntry) => {
      if (expectation.level && entry.level !== expectation.level) {
        return false;
      }
      if (expectation.includes && !entry.message.includes(expectation.includes)) {
        return false;
      }
      if (expectation.matches) {
        const regex = new RegExp(expectation.matches);
        if (!regex.test(entry.message)) {
          return false;
        }
      }
      return true;
    };

    if (!logs.some(matcher)) {
      failures.push(
        expectation.includes
          ? `Expected log containing "${expectation.includes}" not found`
          : expectation.matches
            ? `Expected log matching /${expectation.matches}/ not found`
            : 'Expected log entry not found'
      );
    }
  }
  return failures;
}

function ensureHttpCallExpectations(calls: RecordedHttpCall[], expectations: HttpCallExpectation[]): string[] {
  const failures: string[] = [];
  for (const expectation of expectations) {
    const matcher = (call: RecordedHttpCall) => {
      if (expectation.url && call.url !== expectation.url) {
        return false;
      }
      if (expectation.method && call.method !== expectation.method.toUpperCase()) {
        return false;
      }
      if (expectation.includesPayloadFragment) {
        const payloadString = typeof call.payload === 'string' ? call.payload : JSON.stringify(call.payload ?? '');
        if (!payloadString.includes(expectation.includesPayloadFragment)) {
          return false;
        }
      }
      return true;
    };

    if (!calls.some(matcher)) {
      failures.push(
        `Expected HTTP call${expectation.url ? ` to ${expectation.url}` : ''} ` +
        `${expectation.method ? `with method ${expectation.method.toUpperCase()} ` : ''}`.trim()
      );
    }
  }
  return failures;
}

async function executeFixture(fixture: AppsScriptFixture): Promise<FixtureRunResult> {
  const start = Date.now();
  const compiled = compileToAppsScript(fixture.graph);
  const codeFile = compiled.files.find(file => file.path === 'Code.gs');

  if (!codeFile) {
    throw new Error(`Fixture ${fixture.id} did not produce a Code.gs file`);
  }

  const sandbox = new AppsScriptSandbox({
    secrets: fixture.secrets,
    httpFixtures: fixture.http ?? [],
  });

  sandbox.evaluate(codeFile.content);

  const { context, logs, httpCalls } = await sandbox.runMain(fixture.entry?.context ?? {});

  const expectationFailures: string[] = [];

  try {
    sandbox.verifyHttpExpectations();
  } catch (error) {
    expectationFailures.push(error instanceof Error ? error.message : String(error));
  }

  if (fixture.expect?.context) {
    try {
      assertSubset(context, fixture.expect.context, 'context');
    } catch (error: any) {
      expectationFailures.push(error?.message ?? String(error));
    }
  }

  if (fixture.expect?.logs) {
    expectationFailures.push(...ensureLogExpectations(logs, fixture.expect.logs));
  }

  if (fixture.expect?.httpCalls) {
    expectationFailures.push(...ensureHttpCallExpectations(httpCalls, fixture.expect.httpCalls));
  }

  if (expectationFailures.length > 0) {
    throw new FixtureAssertionError(
      `Fixture ${fixture.id} failed expectations`,
      expectationFailures,
      { context, logs, httpCalls }
    );
  }

  return {
    id: fixture.id,
    description: fixture.description,
    success: true,
    durationMs: Date.now() - start,
    context,
    logs,
    httpCalls,
  };
}

export async function loadAppsScriptFixtures(dir: string = DEFAULT_FIXTURE_DIR): Promise<AppsScriptFixture[]> {
  const entries = await readdir(dir);
  const fixtures: AppsScriptFixture[] = [];

  for (const entry of entries) {
    if (extname(entry) !== '.json') {
      continue;
    }

    const filePath = resolve(dir, entry);
    const raw = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as AppsScriptFixture;
    if (!parsed.id) {
      parsed.id = basename(entry, '.json');
    }
    fixtures.push(parsed);
  }

  return fixtures.sort((a, b) => a.id.localeCompare(b.id));
}

export interface RunFixturesOptions {
  fixturesDir?: string;
  filterIds?: string[];
  stopOnError?: boolean;
}

export async function runAppsScriptFixtures(options: RunFixturesOptions = {}): Promise<AppsScriptDryRunSummary> {
  const fixtures = await loadAppsScriptFixtures(options.fixturesDir ?? DEFAULT_FIXTURE_DIR);
  const filterSet = options.filterIds && options.filterIds.length > 0
    ? new Set(options.filterIds)
    : null;

  const results: FixtureRunResult[] = [];
  const start = Date.now();

  for (const fixture of fixtures) {
    if (filterSet && !filterSet.has(fixture.id)) {
      continue;
    }

    const fixtureStart = Date.now();

    try {
      const result = await executeFixture(fixture);
      results.push(result);
    } catch (error: any) {
      const errorDetails = error instanceof FixtureAssertionError ? error.details : undefined;
      const failure: FixtureRunResult = {
        id: fixture.id,
        description: fixture.description,
        success: false,
        durationMs: Date.now() - fixtureStart,
        logs: errorDetails?.logs ?? [],
        httpCalls: errorDetails?.httpCalls ?? [],
        error: error?.message ?? String(error),
        failedExpectations: error instanceof FixtureAssertionError ? error.expectationFailures : undefined,
        stack: error?.stack,
      };
      if (errorDetails?.context) {
        failure.context = errorDetails.context;
      }
      results.push(failure);
      if (options.stopOnError) {
        break;
      }
    }
  }

  const passed = results.filter(result => result.success).length;
  const failed = results.length - passed;

  return {
    results,
    passed,
    failed,
    durationMs: Date.now() - start,
  };
}

export async function runSingleFixture(fixtureId: string, fixturesDir?: string): Promise<FixtureRunResult> {
  const summary = await runAppsScriptFixtures({ fixturesDir, filterIds: [fixtureId] });
  if (summary.results.length === 0) {
    throw new Error(`No fixture found for id ${fixtureId}`);
  }
  return summary.results[0];
}

export async function importFixtureModule(modulePath: string): Promise<AppsScriptFixture> {
  const moduleUrl = pathToFileURL(resolve(modulePath)).href;
  const mod = await import(moduleUrl);
  if (!mod.default) {
    throw new Error(`Fixture module ${modulePath} does not export default fixture definition`);
  }
  return mod.default as AppsScriptFixture;
}
