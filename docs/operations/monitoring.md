# Monitoring Runbook

This runbook explains how to monitor the Automation API and queue layer using the production health endpoints. The probes are safe to call in any environment and are exposed under the `/api/production` namespace.

## Production Health Endpoints

### `GET /api/production/health`

Use this endpoint for a full snapshot that surfaces database, LLM, workflow, memory, queue, and dependency health. The handler aggregates subsystem checks, downgrading the overall status to `degraded` when any probe returns `warn` and to `unhealthy` when a probe fails; the HTTP status code flips to `503` in the unhealthy case.【F:server/routes/production-health.ts†L60-L103】

### `GET /api/production/ready`

Use this probe for fast readiness checks (Kubernetes-style) and in deployment automation.

* Successful responses return HTTP 200 with `ready: true` once all quick checks pass (LLM configuration, production environment flag, dependency stub, and queue durability). The response body also includes `checks.queueDetails` so operators can inspect the underlying queue probe without issuing another request.【F:server/routes/production-health.ts†L144-L165】
* When Redis is unavailable, the queue check fails with `status: "fail"`, `durable: true`, and a message like `Redis ping failed: ECONNREFUSED`, producing an overall `ready: false` and HTTP 503. The probe logs remediation tips the first time connectivity fails.【F:server/services/QueueHealthService.ts†L29-L71】
* When the queue is running in in-memory mode (no persistence), the readiness probe still returns HTTP 503 and reports `queue: false` with the message `Queue driver is running in non-durable in-memory mode. Jobs will not be persisted.`【F:server/services/QueueHealthService.ts†L81-L98】

During local development `npm run dev:stack` now polls this endpoint and terminates the stack immediately when the queue check reports `false`, preventing workflows from running without a durable queue.【F:scripts/dev-stack.ts†L1-L210】

### `GET /api/production/queue/heartbeat`

Use this endpoint to observe the execution worker heartbeat and queue depth in detail.

* When the dedicated worker is offline (no heartbeat observed), the probe returns HTTP 503 with `status.status: "fail"` and the message `Execution worker has not been started. Queue processing is offline.`【F:server/routes/production-health.ts†L228-L267】
* When Redis is reachable but reports a queue failure (for example, authentication issues), the heartbeat endpoint surfaces the queue health failure message and also returns HTTP 503.【F:server/routes/production-health.ts†L236-L242】
* If heartbeats are stale or a backlog is building, the endpoint downgrades to `warn` and still returns HTTP 503 so alerting can trigger while providing the stale lease count or queue depth in the payload.【F:server/routes/production-health.ts†L244-L258】
* Healthy responses include queue depths, worker metadata, and the latest heartbeat age and return HTTP 200.【F:server/routes/production-health.ts†L260-L285】

## Incident Verification Procedures

### Quick CLI Checks

* Verify the API is ready and Redis is durable:
  ```bash
  curl -fsS "${API_ORIGIN:-http://localhost:5000}/api/production/ready" \
    | jq '{ready: .ready, queueReady: .checks.queue, queueMessage: .checks.queueDetails.message}'
  ```
* Inspect the worker heartbeat and backlog:
  ```bash
  curl -fsS "${API_ORIGIN:-http://localhost:5000}/api/production/queue/heartbeat" \
    | jq '{status: .status.status, message: .status.message, latestHeartbeatAt: .worker.latestHeartbeatAt, queueDepths: .queueDepths}'
  ```
* Capture a one-liner suitable for CI/CD guards (exits non-zero on queue failure):
  ```bash
  curl -fsSL "${API_ORIGIN:-http://localhost:5000}/api/production/ready" \
    | jq -e 'select(.checks.queue == true) | .ready == true' >/dev/null
  ```

### Example Dashboard Panel

For Grafana or any HTTP-capable dashboard, configure a JSON data source panel that queries `/api/production/queue/heartbeat` on a short interval (15–30 seconds) and visualises `status.status` alongside the numeric queue depth. Combine a stat panel for the heartbeat status with a time-series panel charting `sum(map_values(.queueDepths[]; .waiting + .delayed))` so on-call engineers can immediately see when a backlog forms and whether workers are keeping up.
