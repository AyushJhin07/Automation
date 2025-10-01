import { promises as fs } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { performance } from 'perf_hooks';
import Ajv from 'ajv';
import { IntegrationManager } from '../server/integrations/IntegrationManager';
import { connectorRegistry } from '../server/ConnectorRegistry';
import type { APICredentials } from '../server/integrations/BaseAPIClient';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, '..');
const DEFAULT_CONFIG_PATH = resolve(ROOT_DIR, 'configs', 'connector-smoke.config.json');
const SCHEMA_PATH = resolve(ROOT_DIR, 'schemas', 'connector-smoke-config.schema.json');

const ajv = new Ajv({ allErrors: true, strict: false });
const schema = JSON.parse(await fs.readFile(SCHEMA_PATH, 'utf-8'));
const validateSmokeConfig = ajv.compile(schema);

interface SmokeActionConfig {
  id: string;
  parameters?: Record<string, any>;
  expectSuccess?: boolean;
  connectionId?: string;
}

interface ConnectorSmokeConfig {
  credentials?: APICredentials;
  additionalConfig?: Record<string, any>;
  connectionId?: string;
  actions?: SmokeActionConfig[];
  triggers?: SmokeActionConfig[];
  skip?: boolean;
  notes?: string;
}

type SmokeConfig = Record<string, ConnectorSmokeConfig>;

type SmokeStatus = 'passed' | 'failed' | 'skipped';

interface SmokeResult {
  appId: string;
  status: SmokeStatus;
  durationMs: number;
  messages: string[];
}

interface ScriptOptions {
  configPath: string;
  only?: Set<string>;
  includeExperimental: boolean;
}

function parseArgs(argv: string[]): ScriptOptions {
  let configPath = DEFAULT_CONFIG_PATH;
  let only: Set<string> | undefined;
  let includeExperimental = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--config' && argv[i + 1]) {
      configPath = resolve(process.cwd(), argv[++i]);
      continue;
    }
    if (arg === '--only' && argv[i + 1]) {
      const ids = argv[++i]
        .split(',')
        .map(id => id.trim().toLowerCase())
        .filter(Boolean);
      if (ids.length) {
        only = new Set(ids);
      }
      continue;
    }
    if (arg === '--include-experimental') {
      includeExperimental = true;
      continue;
    }
  }

  return { configPath, only, includeExperimental };
}

async function loadConfig(path: string): Promise<SmokeConfig> {
  try {
    const raw = await fs.readFile(path, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!validateSmokeConfig(parsed)) {
      const issues = (validateSmokeConfig.errors ?? [])
        .map(err => `${err.instancePath || '/'} ${err.message ?? ''}`.trim())
        .join('\n  - ');
      throw new Error(`Invalid smoke config at ${path}:\n  - ${issues}`);
    }
    return parsed as SmokeConfig;
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      console.warn(`[connector-smoke] Config file not found at ${path}. All connectors will be skipped.`);
      return {};
    }
    throw error;
  }
}

function formatDuration(ms: number): string {
  return `${ms.toFixed(0)}ms`;
}

function formatHeading(title: string): void {
  console.log(`\n=== ${title} ===`);
}

async function runSmokeTests(options: ScriptOptions): Promise<SmokeResult[]> {
  const config = await loadConfig(options.configPath);
  const manager = new IntegrationManager();
  const connectors = connectorRegistry
    .getAllConnectors({
      includeExperimental: options.includeExperimental,
      includeDisabled: false,
    })
    .sort((a, b) => a.definition.id.localeCompare(b.definition.id));

  const results: SmokeResult[] = [];
  for (const entry of connectors) {
    const appId = entry.definition.id;
    const inScope = !options.only || options.only.has(appId);

    if (!inScope) {
      continue;
    }

    if (!entry.hasImplementation) {
      if (options.includeExperimental || options.only?.has(appId)) {
        results.push({
          appId,
          status: 'skipped',
          durationMs: 0,
          messages: [
            `No registered implementation (availability: ${entry.availability}).`,
          ],
        });
      }
      continue;
    }

    const connectorConfig = config[appId];
    if (!connectorConfig || connectorConfig.skip) {
      const reason = connectorConfig?.skip
        ? connectorConfig.notes || 'Marked as skip in configuration.'
        : 'No credentials provided in smoke config.';
      results.push({
        appId,
        status: 'skipped',
        durationMs: 0,
        messages: [reason],
      });
      continue;
    }

    if (!connectorConfig.credentials) {
      results.push({
        appId,
        status: 'skipped',
        durationMs: 0,
        messages: ['Configuration is missing credentials property.'],
      });
      continue;
    }

    const messages: string[] = [];
    const startedAt = performance.now();
    let status: SmokeStatus = 'passed';

    try {
      const initResult = await manager.initializeIntegration({
        appName: appId,
        credentials: connectorConfig.credentials,
        additionalConfig: connectorConfig.additionalConfig,
        connectionId: connectorConfig.connectionId,
      });

      if (!initResult.success) {
        status = 'failed';
        messages.push(`Connection test failed: ${initResult.error || 'unknown error'}`);
      } else {
        messages.push('Connection test succeeded.');
      }

      if (status !== 'failed') {
        const actions = connectorConfig.actions ?? [];
        const triggers = connectorConfig.triggers ?? [];
        if (!actions.length && !triggers.length) {
          messages.push('No smoke actions or triggers configured; connection-only coverage.');
        }

        for (const action of [...actions, ...triggers]) {
          const execResult = await manager.executeFunction({
            appName: appId,
            functionId: action.id,
            parameters: action.parameters ?? {},
            credentials: connectorConfig.credentials,
            additionalConfig: connectorConfig.additionalConfig,
            connectionId: action.connectionId ?? connectorConfig.connectionId,
          });

          const expectSuccess = action.expectSuccess !== false;
          if (execResult.success && expectSuccess) {
            messages.push(`Action ${action.id} succeeded.`);
          } else if (!execResult.success && !expectSuccess) {
            messages.push(`Action ${action.id} failed as expected: ${execResult.error}`);
          } else {
            status = 'failed';
            messages.push(
              `Action ${action.id} ${execResult.success ? 'succeeded' : 'failed'} contrary to expectation: ${
                execResult.error || 'no error message'
              }`
            );
            break;
          }
        }
      }
    } catch (error: any) {
      status = 'failed';
      messages.push(`Unhandled error: ${error?.message || error}`);
    }

    if (connectorConfig.notes) {
      messages.push(`Notes: ${connectorConfig.notes}`);
    }

    const durationMs = performance.now() - startedAt;
    results.push({ appId, status, durationMs, messages });
  }

  return results;
}

function printResults(results: SmokeResult[]): void {
  if (!results.length) {
    console.log('No connectors were evaluated. Provide credentials via the smoke config file.');
    return;
  }

  formatHeading('Connector Smoke Results');
  for (const result of results) {
    const icon = result.status === 'passed' ? '✅' : result.status === 'failed' ? '❌' : '⏭️';
    console.log(`${icon} ${result.appId} (${formatDuration(result.durationMs)})`);
    for (const message of result.messages) {
      console.log(`   • ${message}`);
    }
  }

  const summary = results.reduce(
    (acc, result) => {
      acc[result.status] += 1;
      return acc;
    },
    { passed: 0, failed: 0, skipped: 0 } as Record<SmokeStatus, number>
  );

  formatHeading('Summary');
  console.log(`Passed: ${summary.passed}`);
  console.log(`Failed: ${summary.failed}`);
  console.log(`Skipped: ${summary.skipped}`);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  console.log('[connector-smoke] Using config:', options.configPath);

  const results = await runSmokeTests(options);
  printResults(results);

  if (results.some(result => result.status === 'failed')) {
    process.exitCode = 1;
  }
}

await main();
