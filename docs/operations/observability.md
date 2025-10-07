# Observability

This service exposes traces and metrics through OpenTelemetry so that request flows,
queue processing, and sandbox execution can be monitored in production.

## Enabling telemetry

Telemetry is disabled by default. Set the following variables to enable the SDK at
process start. **Production clusters must set `OBSERVABILITY_ENABLED=true` so the
SDK and health guards stay active.**

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
- `OTEL_LOGS_EXPORTER` (or the legacy alias `OBSERVABILITY_LOG_EXPORTER`) – set to
  `otlp` for collector delivery, `console` for local inspection, or `none` to
  disable log export.
- `OTEL_EXPORTER_OTLP_PROTOCOL` (defaults to `http/protobuf`).

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

## Exporter configuration recipes

### Preferred: Managed OTLP collector

```
OBSERVABILITY_ENABLED=true
OTEL_SERVICE_NAME=automation-platform
OTEL_EXPORTER_OTLP_ENDPOINT=https://otel-collector.example.com:4318
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer <token>
OTEL_METRICS_EXPORTER=otlp
OTEL_LOGS_EXPORTER=otlp
# OBSERVABILITY_LOG_EXPORTER=otlp
```

This configuration forwards traces, metrics, and structured logs to a managed
collector (Grafana Alloy, OpenTelemetry Collector, Honeycomb, etc.). When the
collector is unavailable the SDK retries with exponential backoff while keeping
instrumentation enabled so data flows automatically once the endpoint is
reachable again.

### Metrics fallback: Embedded Prometheus endpoint

```
OBSERVABILITY_ENABLED=true
OTEL_METRICS_EXPORTER=prometheus
PROMETHEUS_METRICS_HOST=0.0.0.0
PROMETHEUS_METRICS_PORT=9464
PROMETHEUS_METRICS_ENDPOINT=/metrics
OTEL_LOGS_EXPORTER=console
# OBSERVABILITY_LOG_EXPORTER=console
```

Use this when a Prometheus scraper is polling the pods directly. Metrics are
exposed on `http://<host>:9464/metrics`, while traces continue to flow through
the collector defined by the OTLP endpoint variables. Setting
`OTEL_LOGS_EXPORTER=console` keeps structured log export available even if the
collector is offline.

### Local development fallback: Console exporters

```
OBSERVABILITY_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_LOGS_EXPORTER=console
# OBSERVABILITY_LOG_EXPORTER=console
OTEL_METRICS_EXPORTER=otlp
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
```

The Node SDK falls back to console logging for log records when the collector
cannot be reached. Developers still see instrumentation boot messages and span
events locally without breaking application startup.

## Boot verification

After setting the environment variables, run the following command. The
`observability:check` script waits for the SDK bootstrap promise and exits with
code `1` if initialisation fails or times out:

```bash
NODE_ENV=production \
OBSERVABILITY_ENABLED=true \
OTEL_EXPORTER_OTLP_ENDPOINT=https://otel-collector.example.com:4318 \
npm run observability:check
```

If the collector is unreachable you will see retry attempts, but the process
should remain running with instrumentation active. Use this check in CI/CD to
validate configuration before rolling out a release, optionally overriding the
timeout with `OBSERVABILITY_BOOT_TIMEOUT_MS`.

## Run viewer resume controls

The in-product run viewer now exposes a **Resume** control beside the existing
retry button for workflow nodes that are waiting on an external callback. When
the runtime issues a resume token the execution metadata stores the
token/signature pair along with the callback URL and expiration timestamp. The
UI surfaces this state as a resumable node and posts the credentials to
`POST /api/runs/{executionId}/nodes/{nodeId}/resume` so operators can manually
enqueue the resume job if a webhook is lost or delayed. Successful submissions
refresh the execution timeline and render a confirmation toast; failures keep
the node expanded and display the error so the operator can retry after
validating the token.
