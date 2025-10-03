import os from 'node:os';

import { diag, DiagConsoleLogger, DiagLogLevel, metrics, trace } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';

import pkg from '../../package.json' assert { type: 'json' };
import { env } from '../env';
import type { QueueJobCounts, QueueName } from '../queue/index.js';

type MetricAttributes = Record<string, string | number | boolean>;

type QueueDepthByState = Partial<Record<'waiting' | 'active' | 'completed' | 'failed' | 'delayed' | 'paused', number>> & {
  total?: number;
};

const OBSERVABILITY_ENABLED = env.OBSERVABILITY_ENABLED;

export const tracer = trace.getTracer('automation.platform');
export const meter = metrics.getMeter('automation.platform');

const httpRequestDurationHistogram = meter.createHistogram('http_request_duration_ms', {
  description: 'Duration of HTTP server requests',
  unit: 'ms',
});

const nodeLatencyHistogram = meter.createHistogram('workflow_node_latency_ms', {
  description: 'Latency of sandboxed workflow nodes',
  unit: 'ms',
});

const webhookDedupeCounter = meter.createCounter('webhook_dedupe_events_total', {
  description: 'Counts webhook deduplication hits and misses',
});

const queueDepthGauge = meter.createObservableGauge('workflow_queue_depth', {
  description: 'Number of jobs in workflow queues by state',
  unit: '{job}',
});

const latestQueueDepths = new Map<string, QueueDepthByState>();

meter.addBatchObservableCallback((observableResult) => {
  for (const [queueName, counts] of latestQueueDepths.entries()) {
    const { total = 0, ...states } = counts;
    observableResult.observe(queueDepthGauge, total, {
      queue_name: queueName,
      queue_state: 'total',
    });

    for (const [state, value] of Object.entries(states)) {
      observableResult.observe(queueDepthGauge, value ?? 0, {
        queue_name: queueName,
        queue_state: state,
      });
    }
  }
}, [queueDepthGauge]);

function sanitizeAttributes(attributes: Record<string, unknown>): MetricAttributes {
  const sanitized: MetricAttributes = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined || value === null) {
      continue;
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

export function recordHttpRequestDuration(durationMs: number, attributes: Record<string, unknown>): void {
  httpRequestDurationHistogram.record(durationMs, sanitizeAttributes(attributes));
}

export function recordNodeLatency(durationMs: number, attributes: Record<string, unknown>): void {
  nodeLatencyHistogram.record(durationMs, sanitizeAttributes(attributes));
}

export function recordWebhookDedupeHit(attributes: Record<string, unknown>): void {
  webhookDedupeCounter.add(1, sanitizeAttributes({ ...attributes, outcome: 'hit' }));
}

export function recordWebhookDedupeMiss(attributes: Record<string, unknown>): void {
  webhookDedupeCounter.add(1, sanitizeAttributes({ ...attributes, outcome: 'miss' }));
}

export function updateQueueDepthMetric<Name extends QueueName>(
  queueName: Name,
  counts: QueueJobCounts<Name>
): void {
  const stateCounts: QueueDepthByState = {
    waiting: counts.waiting ?? 0,
    active: counts.active ?? 0,
    completed: counts.completed ?? 0,
    failed: counts.failed ?? 0,
    delayed: counts.delayed ?? 0,
    paused: counts.paused ?? 0,
  };

  stateCounts.total = Object.values(stateCounts).reduce((sum, value) => sum + (value ?? 0), 0);
  latestQueueDepths.set(queueName, stateCounts);
}

function createResource(): Resource {
  const version = typeof pkg.version === 'string' ? pkg.version : '0.0.0';
  const attributes = {
    [SemanticResourceAttributes.SERVICE_NAME]: env.OTEL_SERVICE_NAME,
    [SemanticResourceAttributes.SERVICE_NAMESPACE]: 'automation',
    [SemanticResourceAttributes.SERVICE_VERSION]: version,
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: env.NODE_ENV,
    [SemanticResourceAttributes.SERVICE_INSTANCE_ID]: process.env.HOSTNAME ?? os.hostname(),
  } satisfies Record<string, string | undefined>;

  return new Resource(attributes);
}

function createTraceExporter(): OTLPTraceExporter | null {
  const url = env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ?? env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!url) {
    return null;
  }

  return new OTLPTraceExporter({
    url,
    headers: env.OTEL_EXPORTER_OTLP_HEADERS,
  });
}

function createMetricReader(): PeriodicExportingMetricReader | PrometheusExporter | null {
  if (env.OTEL_METRICS_EXPORTER === 'prometheus') {
    return new PrometheusExporter({
      port: env.PROMETHEUS_METRICS_PORT,
      host: env.PROMETHEUS_METRICS_HOST,
      endpoint: env.PROMETHEUS_METRICS_ENDPOINT,
    });
  }

  const url = env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT ?? env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!url) {
    return null;
  }

  const exporter = new OTLPMetricExporter({
    url,
    headers: env.OTEL_EXPORTER_OTLP_HEADERS,
  });
  return new PeriodicExportingMetricReader({ exporter });
}

if (OBSERVABILITY_ENABLED) {
  const logLevel = env.NODE_ENV === 'development' ? DiagLogLevel.INFO : DiagLogLevel.ERROR;
  diag.setLogger(new DiagConsoleLogger(), logLevel);

  const resource = createResource();
  const traceExporter = createTraceExporter();
  const metricReader = createMetricReader();

  const sdkConfig: {
    resource: Resource;
    traceExporter?: OTLPTraceExporter;
    metricReader?: PeriodicExportingMetricReader | PrometheusExporter;
  } = {
    resource,
  };

  if (traceExporter) {
    sdkConfig.traceExporter = traceExporter;
  }
  if (metricReader) {
    sdkConfig.metricReader = metricReader;
  }

  const sdk = new NodeSDK(sdkConfig);

  sdk
    .start()
    .then(() => {
      console.log('📈 OpenTelemetry instrumentation initialized');
    })
    .catch((error) => {
      console.error('❌ Failed to start OpenTelemetry SDK', error);
    });

  const shutdown = async (signal: NodeJS.Signals) => {
    try {
      await sdk.shutdown();
      console.log(`📪 OpenTelemetry SDK shut down via ${signal}`);
    } catch (error) {
      console.error('❌ Error shutting down OpenTelemetry SDK', error);
    }
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
} else {
  if (process.env.NODE_ENV !== 'test') {
    console.debug('Observability is disabled. Set OBSERVABILITY_ENABLED=true to enable telemetry.');
  }
}

export const observabilityEnabled = OBSERVABILITY_ENABLED;

