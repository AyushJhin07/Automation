// Load environment variables as the very first thing
import dotenv from 'dotenv';

// Load .env file
dotenv.config();

// Validate critical environment variables
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'development';
}

const environment = process.env.NODE_ENV;
console.log(`🌍 Environment: ${environment}`);

const requiredInProduction = ['DATABASE_URL', 'ENCRYPTION_MASTER_KEY', 'JWT_SECRET'];
if (environment === 'production') {
  const missing = requiredInProduction.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables for production: ${missing.join(', ')}`
    );
  }
} else {
  const missing = requiredInProduction.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    const missingList = missing.join(', ');
    console.warn(
      `⚠️ Missing environment variables (${missingList}). The application will run in degraded mode. Set them before production deploys.`
    );
  }
}

// Export environment variables for easy access
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
  ENABLE_LLM_FEATURES: process.env.ENABLE_LLM_FEATURES === 'true',
  GENERIC_EXECUTOR_ENABLED: process.env.GENERIC_EXECUTOR_ENABLED === 'true',
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
  OTEL_METRICS_EXPORTER: process.env.OTEL_METRICS_EXPORTER || 'otlp',
  PROMETHEUS_METRICS_PORT: Number.parseInt(process.env.PROMETHEUS_METRICS_PORT ?? '9464', 10),
  PROMETHEUS_METRICS_HOST: process.env.PROMETHEUS_METRICS_HOST ?? '0.0.0.0',
  PROMETHEUS_METRICS_ENDPOINT: process.env.PROMETHEUS_METRICS_ENDPOINT ?? '/metrics',
} as const;

export const FLAGS = {
  GENERIC_EXECUTOR_ENABLED: (process.env.GENERIC_EXECUTOR_ENABLED === 'true')
} as const;
