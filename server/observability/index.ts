import os from 'node:os';
import { Buffer } from 'node:buffer';

import { diag, DiagConsoleLogger, DiagLogLevel, metrics, trace } from '@opentelemetry/api';
import { logs } from '@opentelemetry/api-logs';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { LoggerProvider, BatchLogRecordProcessor, ConsoleLogRecordExporter, type LogRecordExporter, type ReadableLogRecord } from '@opentelemetry/sdk-logs';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { ExportResultCode, hrTimeToMilliseconds, type ExportResult } from '@opentelemetry/core';

import pkg from '../../package.json' assert { type: 'json' };
import { env } from '../env';
import type { OrganizationRegion } from '../database/schema.js';
import type { QueueJobCounts, QueueName } from '../queue/index.js';
import type { SandboxPolicyEvent } from '../runtime/SandboxShared.js';

type MetricAttributes = Record<string, string | number | boolean>;

type QueueDepthByState = Partial<Record<'waiting' | 'active' | 'completed' | 'failed' | 'delayed' | 'paused', number>> & {
  total?: number;
};

type RateBudgetSnapshot = {
  connectorId: string;
  connectionId: string | null;
  organizationId: string | null;
  remaining?: number;
  limit?: number;
  resetMs?: number;
};

interface OpenSearchLogExporterOptions {
  endpoint: string;
  index: string;
  username?: string;
  password?: string;
  headers?: Record<string, string>;
}

class OpenSearchLogExporter implements LogRecordExporter {
  constructor(private readonly options: OpenSearchLogExporterOptions) {}

  async export(logsToExport: ReadableLogRecord[], resultCallback: (result: ExportResult) => void): Promise<void> {
    try {
      await Promise.all(logsToExport.map((record) => this.sendRecord(record)));
      resultCallback({ code: ExportResultCode.SUCCESS });
    } catch (error) {
      diag.error('❌ Failed to export logs to OpenSearch', error);
      resultCallback({ code: ExportResultCode.FAILED, error: error instanceof Error ? error : new Error(String(error)) });
    }
  }

  async shutdown(): Promise<void> {
    return Promise.resolve();
  }

  private async sendRecord(record: ReadableLogRecord): Promise<void> {
    const endpoint = this.options.endpoint.replace(/\/$/, '');
    const url = `${endpoint}/${this.options.index}/_doc`;

    const timestamp = record.hrTime ? new Date(hrTimeToMilliseconds(record.hrTime)) : new Date();
    const bodyValue = typeof record.body === 'string' ? record.body : JSON.stringify(record.body);

    const payload = {
      '@timestamp': timestamp.toISOString(),
      severityText: record.severityText,
      severityNumber: record.severityNumber,
      body: bodyValue,
      attributes: record.attributes ?? {},
      resource: record.resource?.attributes ?? {},
      instrumentationScope: record.instrumentationScope,
      traceId: record.traceId,
      spanId: record.spanId,
    } satisfies Record<string, unknown>;

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      ...(this.options.headers ?? {}),
    };

    if (this.options.username && this.options.password) {
      const auth = Buffer.from(`${this.options.username}:${this.options.password}`).toString('base64');
      headers['authorization'] = `Basic ${auth}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenSearch responded with ${response.status}: ${text}`);
    }
  }
}

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

const sandboxLifecycleCounter = meter.createCounter('sandbox_lifecycle_events_total', {
  description: 'Lifecycle transitions for provisioned sandboxes',
});

const sandboxPolicyViolationCounter = meter.createCounter('sandbox_policy_violations_total', {
  description: 'Policy violations raised inside sandboxes',
});

const sandboxHeartbeatTimeoutCounter = meter.createCounter('sandbox_heartbeat_timeouts_total', {
  description: 'Heartbeats missed by sandboxed executions',
});

const sandboxActiveGauge = meter.createObservableGauge('sandbox_active', {
  description: 'Currently provisioned sandboxes by tenancy scope',
});

const sandboxQuarantinedGauge = meter.createObservableGauge('sandbox_quarantined', {
  description: 'Sandboxes quarantined due to repeated policy violations',
});

const webhookDedupeCounter = meter.createCounter('webhook_dedupe_events_total', {
  description: 'Counts webhook deduplication hits and misses',
});

const schedulerLockAcquiredCounter = meter.createCounter('scheduler_lock_acquired_total', {
  description: 'Counts scheduler cycles that successfully acquired a coordination lock',
});

const schedulerLockSkippedCounter = meter.createCounter('scheduler_lock_skipped_total', {
  description: 'Counts scheduler cycles skipped due to coordination lock contention',
});

const queueDepthGauge = meter.createObservableGauge('workflow_queue_depth', {
  description: 'Number of jobs in workflow queues by state',
  unit: '{job}',
});

const latestQueueDepths = new Map<string, QueueDepthByState>();
const connectorRateRemainingGauge = meter.createObservableGauge('connector_rate_budget_remaining', {
  description: 'Remaining request budget per connector/connection',
  unit: '{request}',
});
const connectorRateLimitGauge = meter.createObservableGauge('connector_rate_budget_limit', {
  description: 'Configured request budget ceiling per connector/connection',
  unit: '{request}',
});
const connectorRateResetGauge = meter.createObservableGauge('connector_rate_budget_reset_seconds', {
  description: 'Seconds until the current rate limit window resets',
  unit: 's',
});
const latestRateBudgets = new Map<string, RateBudgetSnapshot>();
const crossRegionViolationCounter = meter.createCounter('cross_region_violation_total', {
  description: 'Counts occurrences where a request was routed to the wrong region',
});

type ConnectorConcurrencySnapshot = {
  connectorId: string;
  organizationId: string | null;
  scope: 'global' | 'organization';
  active: number;
  limit?: number;
};

const connectorConcurrencyGauge = meter.createObservableGauge('connector_concurrency_active', {
  description: 'Active connector concurrency slots in use',
  unit: '1',
});
const latestConnectorConcurrency = new Map<string, ConnectorConcurrencySnapshot>();

type SandboxStateRecord = {
  key: string;
  scope: 'tenant' | 'execution';
  organizationId?: string;
  executionId?: string;
  workflowId?: string;
  nodeId?: string;
  state: 'active' | 'quarantined';
};

const sandboxStates = new Map<string, SandboxStateRecord>();

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
  for (const snapshot of latestRateBudgets.values()) {
    const attributes = sanitizeAttributes({
      connector_id: snapshot.connectorId,
      connection_id: snapshot.connectionId ?? 'global',
      organization_id: snapshot.organizationId ?? 'global',
    });

    if (typeof snapshot.remaining === 'number') {
      observableResult.observe(connectorRateRemainingGauge, snapshot.remaining, attributes);
    }

    if (typeof snapshot.limit === 'number') {
      observableResult.observe(connectorRateLimitGauge, snapshot.limit, attributes);
    }

    if (typeof snapshot.resetMs === 'number') {
      const seconds = Math.max(0, Math.round((snapshot.resetMs - Date.now()) / 1000));
      observableResult.observe(connectorRateResetGauge, seconds, attributes);
    }
  }
  for (const snapshot of latestConnectorConcurrency.values()) {
    const attributes = sanitizeAttributes({
      connector_id: snapshot.connectorId,
      organization_id: snapshot.organizationId ?? 'global',
      scope: snapshot.scope,
    });

    observableResult.observe(connectorConcurrencyGauge, snapshot.active, attributes);

    if (typeof snapshot.limit === 'number') {
      observableResult.observe(connectorConcurrencyGauge, snapshot.limit, {
        ...attributes,
        limit: true,
      });
    }
  }

  for (const record of sandboxStates.values()) {
    const attributes = sanitizeAttributes({
      sandbox_scope: record.scope,
      organization_id: record.organizationId ?? 'global',
      execution_id: record.executionId ?? 'n/a',
      workflow_id: record.workflowId ?? 'n/a',
      node_id: record.nodeId ?? 'n/a',
    });

    if (record.state === 'active') {
      observableResult.observe(sandboxActiveGauge, 1, attributes);
    }

    if (record.state === 'quarantined') {
      observableResult.observe(sandboxQuarantinedGauge, 1, attributes);
    }
  }
}, [
  queueDepthGauge,
  connectorRateRemainingGauge,
  connectorRateLimitGauge,
  connectorRateResetGauge,
  connectorConcurrencyGauge,
  sandboxActiveGauge,
  sandboxQuarantinedGauge,
]);

type SandboxIsolationAttributes = {
  scope: 'tenant' | 'execution';
  organizationId?: string;
  executionId?: string;
  workflowId?: string;
  nodeId?: string;
};

function toMetricAttributes(attrs: SandboxIsolationAttributes): Record<string, string> {
  return sanitizeAttributes({
    sandbox_scope: attrs.scope,
    organization_id: attrs.organizationId ?? 'global',
    execution_id: attrs.executionId ?? 'n/a',
    workflow_id: attrs.workflowId ?? 'n/a',
    node_id: attrs.nodeId ?? 'n/a',
  });
}

export function recordSandboxLifecycleEvent(
  event: 'provisioned' | 'recycled' | 'disposed' | 'quarantined',
  attrs: SandboxIsolationAttributes & { reason?: string }
): void {
  const attributes = {
    ...toMetricAttributes(attrs),
    reason: attrs.reason ?? 'n/a',
  } as Record<string, string>;

  sandboxLifecycleCounter.add(1, attributes);
}

export function recordSandboxPolicyViolation(
  attrs: SandboxIsolationAttributes,
  violation: SandboxPolicyEvent
): void {
  sandboxPolicyViolationCounter.add(1, {
    ...toMetricAttributes(attrs),
    violation_type: violation.type,
    violation_resource: violation.type === 'resource-limit' ? violation.resource : 'n/a',
  });
}

export function recordSandboxHeartbeatTimeout(attrs: SandboxIsolationAttributes): void {
  sandboxHeartbeatTimeoutCounter.add(1, toMetricAttributes(attrs));
}

export function setSandboxState(
  key: string,
  attrs: SandboxIsolationAttributes,
  state: 'active' | 'quarantined'
): void {
  sandboxStates.set(key, {
    key,
    scope: attrs.scope,
    organizationId: attrs.organizationId,
    executionId: attrs.executionId,
    workflowId: attrs.workflowId,
    nodeId: attrs.nodeId,
    state,
  });
}

export function clearSandboxState(key: string): void {
  sandboxStates.delete(key);
}

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

export function recordSchedulerLockAcquired(attributes: Record<string, unknown>): void {
  schedulerLockAcquiredCounter.add(1, sanitizeAttributes(attributes));
}

export function recordSchedulerLockSkipped(attributes: Record<string, unknown>): void {
  schedulerLockSkippedCounter.add(1, sanitizeAttributes(attributes));
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

export function getQueueDepthSnapshot(): Record<string, QueueDepthByState> {
  return Object.fromEntries(
    Array.from(latestQueueDepths.entries()).map(([queueName, counts]) => [
      queueName,
      { ...counts },
    ])
  );
}

export function recordCrossRegionViolation(context: {
  subsystem: string;
  expectedRegion: OrganizationRegion;
  actualRegion: OrganizationRegion;
  identifier?: string;
}): void {
  const { subsystem, expectedRegion, actualRegion, identifier } = context;
  crossRegionViolationCounter.add(1, {
    subsystem,
    expected_region: expectedRegion,
    actual_region: actualRegion,
    identifier: identifier ?? 'unknown',
  });

  const details = identifier ? ` (identifier=${identifier})` : '';
  console.error(
    `🚨 Cross-region violation detected in ${subsystem}${details}: expected ${expectedRegion}, received ${actualRegion}`
  );
}

export function updateConnectorRateBudgetMetric(snapshot: RateBudgetSnapshot): void {
  const connectorId = snapshot.connectorId || 'unknown';
  const connectionId = snapshot.connectionId ?? 'global';
  const organizationId = snapshot.organizationId ?? 'global';
  const key = `${connectorId}::${connectionId}::${organizationId}`;

  const hasValues =
    typeof snapshot.remaining === 'number' ||
    typeof snapshot.limit === 'number' ||
    typeof snapshot.resetMs === 'number';

  if (!hasValues) {
    latestRateBudgets.delete(key);
    return;
  }

  latestRateBudgets.set(key, {
    connectorId,
    connectionId,
    organizationId,
    remaining: snapshot.remaining,
    limit: snapshot.limit,
    resetMs: snapshot.resetMs,
  });
}

interface ConnectorConcurrencyMetricInput {
  connectorId: string;
  organizationId: string | null;
  scope: 'global' | 'organization';
  active: number;
  limit?: number;
}

export function updateConnectorConcurrencyMetric(snapshot: ConnectorConcurrencyMetricInput): void {
  const connectorId = snapshot.connectorId || 'unknown';
  const organizationId = snapshot.scope === 'global' ? 'global' : snapshot.organizationId ?? 'global';
  const key = `${connectorId}::${snapshot.scope}::${organizationId}`;

  if (snapshot.active <= 0) {
    latestConnectorConcurrency.delete(key);
    return;
  }

  latestConnectorConcurrency.set(key, {
    connectorId,
    organizationId: snapshot.scope === 'global' ? null : snapshot.organizationId ?? null,
    scope: snapshot.scope,
    active: snapshot.active,
    limit: snapshot.limit,
  });
}

export function getConnectorRateBudgetSnapshot(): ReadonlyMap<string, RateBudgetSnapshot> {
  return new Map(latestRateBudgets);
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

function createTraceExporter(): OTLPTraceExporter | JaegerExporter | null {
  const exporterType = env.OBSERVABILITY_TRACE_EXPORTER?.toLowerCase?.() ?? 'otlp';

  if (exporterType === 'none') {
    return null;
  }

  if (exporterType === 'jaeger') {
    if (!env.JAEGER_TRACE_ENDPOINT) {
      console.warn('⚠️  OBSERVABILITY_TRACE_EXPORTER=jaeger but JAEGER_TRACE_ENDPOINT is not configured');
      return null;
    }
    return new JaegerExporter({ endpoint: env.JAEGER_TRACE_ENDPOINT });
  }

  const endpoint =
    exporterType === 'tempo'
      ? env.TEMPO_TRACES_ENDPOINT ?? env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ?? env.OTEL_EXPORTER_OTLP_ENDPOINT
      : env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ?? env.OTEL_EXPORTER_OTLP_ENDPOINT;

  if (!endpoint) {
    return null;
  }

  return new OTLPTraceExporter({
    url: endpoint,
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

function createLogExporter(): LogRecordExporter | null {
  const exporterType = env.OBSERVABILITY_LOG_EXPORTER?.toLowerCase?.() ?? 'otlp';

  if (exporterType === 'none') {
    return null;
  }

  if (exporterType === 'console') {
    return new ConsoleLogRecordExporter();
  }

  if (exporterType === 'opensearch') {
    if (!env.OPENSEARCH_LOGS_ENDPOINT) {
      console.warn('⚠️  OBSERVABILITY_LOG_EXPORTER=opensearch but OPENSEARCH_LOGS_ENDPOINT is not configured');
      return null;
    }
    return new OpenSearchLogExporter({
      endpoint: env.OPENSEARCH_LOGS_ENDPOINT,
      index: env.OPENSEARCH_LOGS_INDEX,
      username: env.OPENSEARCH_USERNAME,
      password: env.OPENSEARCH_PASSWORD,
    });
  }

  const url = env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT ?? env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!url) {
    return null;
  }

  return new OTLPLogExporter({
    url,
    headers: env.OTEL_EXPORTER_OTLP_HEADERS,
  });
}

function createLoggerProvider(resource: Resource): LoggerProvider | null {
  const exporter = createLogExporter();
  if (!exporter) {
    return null;
  }

  const provider = new LoggerProvider({ resource });
  provider.addLogRecordProcessor(new BatchLogRecordProcessor(exporter));
  logs.setGlobalLoggerProvider(provider);
  return provider;
}

function resolveDiagLevel(): DiagLogLevel {
  const configured = env.OBSERVABILITY_LOG_LEVEL?.toLowerCase?.();
  const mapping: Record<string, DiagLogLevel> = {
    debug: DiagLogLevel.DEBUG,
    verbose: DiagLogLevel.VERBOSE,
    info: DiagLogLevel.INFO,
    warn: DiagLogLevel.WARN,
    error: DiagLogLevel.ERROR,
  };

  if (configured && mapping[configured] !== undefined) {
    return mapping[configured];
  }

  return env.NODE_ENV === 'development' ? DiagLogLevel.INFO : DiagLogLevel.ERROR;
}

if (OBSERVABILITY_ENABLED) {
  const logLevel = resolveDiagLevel();
  diag.setLogger(new DiagConsoleLogger(), logLevel);

  const resource = createResource();
  const traceExporter = createTraceExporter();
  const metricReader = createMetricReader();
  const loggerProvider = createLoggerProvider(resource);

  const sdkConfig: {
    resource: Resource;
    traceExporter?: OTLPTraceExporter | JaegerExporter;
    metricReader?: PeriodicExportingMetricReader | PrometheusExporter;
    loggerProvider?: LoggerProvider;
  } = {
    resource,
  };

  if (traceExporter) {
    sdkConfig.traceExporter = traceExporter;
  }
  if (metricReader) {
    sdkConfig.metricReader = metricReader;
  }
  if (loggerProvider) {
    sdkConfig.loggerProvider = loggerProvider;
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
      if (loggerProvider) {
        await loggerProvider.shutdown();
      }
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

export function getLogger(name: string, version = '1.0.0') {
  return logs.getLogger(name, version);
}

