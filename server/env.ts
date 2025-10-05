// Load environment variables as the very first thing
import dotenv from 'dotenv';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { hostname } from 'node:os';
import { resolve } from 'node:path';
import {
  loadManagedSecrets,
  recordEnvironmentSecret,
  recordGeneratedSecret,
} from './secrets/SecretManager';

// Load .env and .env.local files (if present)
dotenv.config();

const envLocalPath = resolve(process.cwd(), '.env.local');
dotenv.config({ path: envLocalPath });

// Validate critical environment variables
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'development';
}

const environment = process.env.NODE_ENV;

try {
  const managed = await loadManagedSecrets();
  if (managed.loaded && managed.keys.length > 0) {
    console.info(
      `🔐 Loaded ${managed.keys.length} managed secret${managed.keys.length === 1 ? '' : 's'} from ${managed.provider}`,
    );
  }
} catch (error) {
  if (environment === 'production') {
    throw error;
  }
  console.warn(
    `⚠️ Managed secret loading failed (${(error as Error).message}). Falling back to local env values.`,
  );
}

const requiredVariables = ['DATABASE_URL', 'ENCRYPTION_MASTER_KEY', 'JWT_SECRET'] as const;
const trackedOptionalSecrets = [
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'CLAUDE_API_KEY',
  'GOOGLE_API_KEY',
  'GEMINI_API_KEY',
];

function isMissing(value: string | undefined): boolean {
  return !value || value.trim().length === 0;
}

function deriveDeterministicSecret(key: string): string {
  return createHash('sha256')
    .update(`${key}:${process.cwd()}:${hostname()}`)
    .digest('hex');
}

function updateEnvLocalFile(entries: Record<string, string>): void {
  if (Object.keys(entries).length === 0) {
    return;
  }

  let existingContent = '';
  if (existsSync(envLocalPath)) {
    existingContent = readFileSync(envLocalPath, 'utf8');
  }

  let nextContent = existingContent;
  if (nextContent && !nextContent.endsWith('\n')) {
    nextContent += '\n';
  }

  for (const [key, value] of Object.entries(entries)) {
    const assignment = `${key}=${value}`;
    const pattern = new RegExp(`^${key}=.*$`, 'm');
    if (pattern.test(nextContent)) {
      nextContent = nextContent.replace(pattern, assignment);
    } else {
      nextContent += `${assignment}\n`;
    }
  }

  writeFileSync(envLocalPath, nextContent, 'utf8');
  console.log(`🛡️ Generated local secrets written to ${envLocalPath}`);
}

const missingVariables = requiredVariables.filter((key) => isMissing(process.env[key]));

if (environment === 'production' && missingVariables.length > 0) {
  throw new Error(
    `Missing required environment variables for production: ${missingVariables.join(', ')}`
  );
}

const generatedValues: Record<string, string> = {};
for (const key of missingVariables) {
  if (key === 'DATABASE_URL') {
    continue;
  }
  const generated = deriveDeterministicSecret(key);
  process.env[key] = generated;
  generatedValues[key] = generated;
  recordGeneratedSecret(key);
}

if (Object.keys(generatedValues).length > 0) {
  updateEnvLocalFile(generatedValues);
}

const stillMissing = requiredVariables.filter((key) => isMissing(process.env[key]));
if (stillMissing.length > 0) {
  throw new Error(
    `Missing required environment variables: ${stillMissing.join(', ')}. ` +
      `Set them in your environment or ${envLocalPath}.`
  );
}

for (const key of [...requiredVariables, ...trackedOptionalSecrets]) {
  if (!isMissing(process.env[key])) {
    recordEnvironmentSecret(key);
  }
}

// Export environment variables for easy access
const CONNECTOR_SIMULATOR_FIXTURES_DIR = process.env.CONNECTOR_SIMULATOR_FIXTURES_DIR
  ? resolve(process.cwd(), process.env.CONNECTOR_SIMULATOR_FIXTURES_DIR)
  : resolve(process.cwd(), 'server', 'testing', 'fixtures');

export const env = {
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  CLAUDE_API_KEY: process.env.CLAUDE_API_KEY,
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  JWT_SECRET: process.env.JWT_SECRET,
  PORT: process.env.PORT || '5000',
  SERVER_PUBLIC_URL: process.env.SERVER_PUBLIC_URL || '',
  CORS_ORIGIN: process.env.CORS_ORIGIN || '',
  ENABLE_LLM_FEATURES: process.env.ENABLE_LLM_FEATURES === 'true',
  GENERIC_EXECUTOR_ENABLED: process.env.GENERIC_EXECUTOR_ENABLED === 'true',
  CONNECTOR_SIMULATOR_ENABLED: process.env.CONNECTOR_SIMULATOR_ENABLED === 'true',
  ALLOW_PLAINTEXT_TOKENS_IN_DEV: process.env.ALLOW_PLAINTEXT_TOKENS_IN_DEV === 'true',
  CONNECTOR_SIMULATOR_FIXTURES_DIR,
  QUEUE_REDIS_HOST: process.env.QUEUE_REDIS_HOST || '127.0.0.1',
  QUEUE_REDIS_PORT: Number.parseInt(process.env.QUEUE_REDIS_PORT ?? '6379', 10),
  QUEUE_REDIS_DB: Number.parseInt(process.env.QUEUE_REDIS_DB ?? '0', 10),
  QUEUE_REDIS_USERNAME: process.env.QUEUE_REDIS_USERNAME,
  QUEUE_REDIS_PASSWORD: process.env.QUEUE_REDIS_PASSWORD,
  QUEUE_REDIS_TLS: process.env.QUEUE_REDIS_TLS === 'true',
  QUEUE_METRICS_INTERVAL_MS: Number.parseInt(process.env.QUEUE_METRICS_INTERVAL_MS ?? '60000', 10),
  OBSERVABILITY_ENABLED: process.env.OBSERVABILITY_ENABLED === 'true',
  OTEL_SERVICE_NAME: process.env.OTEL_SERVICE_NAME || 'automation-platform',
  OTEL_EXPORTER_OTLP_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  OTEL_EXPORTER_OTLP_HEADERS: process.env.OTEL_EXPORTER_OTLP_HEADERS,
  OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
  OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT,
  OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT,
  OTEL_METRICS_EXPORTER: process.env.OTEL_METRICS_EXPORTER || 'otlp',
  OTEL_LOGS_EXPORTER: process.env.OTEL_LOGS_EXPORTER,
  OBSERVABILITY_TRACE_EXPORTER: process.env.OBSERVABILITY_TRACE_EXPORTER || 'otlp',
  OBSERVABILITY_LOG_EXPORTER: process.env.OBSERVABILITY_LOG_EXPORTER || 'otlp',
  OBSERVABILITY_LOG_LEVEL: process.env.OBSERVABILITY_LOG_LEVEL || (process.env.NODE_ENV === 'development' ? 'info' : 'error'),
  TEMPO_TRACES_ENDPOINT: process.env.TEMPO_TRACES_ENDPOINT,
  JAEGER_TRACE_ENDPOINT: process.env.JAEGER_TRACE_ENDPOINT,
  OPENSEARCH_LOGS_ENDPOINT: process.env.OPENSEARCH_LOGS_ENDPOINT,
  OPENSEARCH_LOGS_INDEX: process.env.OPENSEARCH_LOGS_INDEX || 'automation-execution-audit',
  OPENSEARCH_USERNAME: process.env.OPENSEARCH_USERNAME,
  OPENSEARCH_PASSWORD: process.env.OPENSEARCH_PASSWORD,
  PROMETHEUS_METRICS_PORT: Number.parseInt(process.env.PROMETHEUS_METRICS_PORT ?? '9464', 10),
  PROMETHEUS_METRICS_HOST: process.env.PROMETHEUS_METRICS_HOST ?? '0.0.0.0',
  PROMETHEUS_METRICS_ENDPOINT: process.env.PROMETHEUS_METRICS_ENDPOINT ?? '/metrics',
  EXECUTION_AUDIT_RETENTION_DAYS: Number.parseInt(process.env.EXECUTION_AUDIT_RETENTION_DAYS ?? '30', 10),
} as const;

export const FLAGS = {
  GENERIC_EXECUTOR_ENABLED: (process.env.GENERIC_EXECUTOR_ENABLED === 'true'),
  CONNECTOR_SIMULATOR_ENABLED: (process.env.CONNECTOR_SIMULATOR_ENABLED === 'true'),
  ALLOW_PLAINTEXT_TOKENS_IN_DEV: (process.env.ALLOW_PLAINTEXT_TOKENS_IN_DEV === 'true'),
} as const;
