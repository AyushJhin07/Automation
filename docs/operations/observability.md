# Observability

This service exposes traces and metrics through OpenTelemetry so that request flows,
queue processing, and sandbox execution can be monitored in production.

## Enabling telemetry

Telemetry is disabled by default. Set the following variables to enable the SDK at
process start:

- `OBSERVABILITY_ENABLED=true`
- `OTEL_SERVICE_NAME` (defaults to `automation-platform`)
- `OTEL_EXPORTER_OTLP_ENDPOINT` or protocol specific variables for your collector
  (for example, `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`,
  `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT`, and `OTEL_EXPORTER_OTLP_HEADERS` for
  authenticated endpoints).
- `OTEL_METRICS_EXPORTER` – set to `otlp` (default) to export via OTLP/HTTP or
  `prometheus` to run an embedded Prometheus endpoint. When using Prometheus you can
  configure `PROMETHEUS_METRICS_HOST`, `PROMETHEUS_METRICS_PORT`, and
  `PROMETHEUS_METRICS_ENDPOINT` (defaults: `0.0.0.0`, `9464`, `/metrics`).

The instrumentation entry point (`server/observability/index.ts`) wires the
OpenTelemetry Node SDK with the configured exporters and resource attributes. The
service name, namespace (`automation`), version (from `package.json`), deployment
environment, and instance ID (hostname) are included on all telemetry resources.

## Instrumented components

- **Express API** – every request creates a `http.server.request` span with
  method, route, request ID, user agent, and status attributes. Request durations
  are also recorded as the `http_request_duration_ms` histogram (milliseconds).
- **BullMQ queue workers** – queue processors run inside `queue.process <queue>`
  spans that capture job IDs, attempt counts, workflow identifiers, and execution
  time (`queue.job.duration_ms`).
- **Sandboxed workflow nodes** – sandbox execution is wrapped in `workflow.sandbox`
  spans with workflow, execution, and node identifiers. Execution duration is
  recorded in the `workflow_node_latency_ms` histogram.

## Metrics

The following metrics are emitted via the configured exporter:

| Metric | Type | Description | Key attributes |
| --- | --- | --- | --- |
| `workflow_queue_depth` | Observable gauge | Number of jobs in each workflow queue broken down by state and total. | `queue_name`, `queue_state` (`waiting`, `active`, `completed`, `failed`, `delayed`, `paused`, `total`) |
| `workflow_node_latency_ms` | Histogram | Latency of sandboxed workflow node executions. | `workflow_id`, `execution_id`, `node_id`, `entry_point` |
| `http_request_duration_ms` | Histogram | Duration of HTTP requests handled by Express. | `http_method`, `http_route`, `http_status_code` |

Queue depth values are refreshed on the interval configured by
`QUEUE_METRICS_INTERVAL_MS` (default: 60s).

## Collector examples

### OTLP/HTTP collector

```
OBSERVABILITY_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=https://otel-collector.example.com:4318
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer <token>
```

### Prometheus scrape

```
OBSERVABILITY_ENABLED=true
OTEL_METRICS_EXPORTER=prometheus
PROMETHEUS_METRICS_HOST=0.0.0.0
PROMETHEUS_METRICS_PORT=9464
PROMETHEUS_METRICS_ENDPOINT=/metrics
```

After enabling, point your Prometheus server at
`http://<host>:9464/metrics` to collect runtime metrics.
