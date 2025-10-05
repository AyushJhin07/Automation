# Production Monitoring Runbook

This runbook covers the three production health probes exposed by the API. Use them to gate deployments, triage incidents, and
validate queue durability before resuming traffic.

## Endpoint overview

| Endpoint | Purpose | Success signal | Failure cues |
| --- | --- | --- | --- |
| `GET /api/production/ready` | Fast readiness probe used by `npm run dev:stack`, CI smoke tests, and container orchestrators. | `checks.queue` resolves to `true` and the HTTP status is `200`. | Redis outage, in-memory queue driver, or other subsystem checks returning `false` yield HTTP `503` with diagnostics in `queueHealth` and `error`. |
| `GET /api/production/queue/heartbeat` | Deep queue telemetry used to confirm the execution worker is emitting heartbeats and draining backlog. | `status.status === "pass"` with `worker.started === true` and small queue depths. | Returns HTTP `503` with `status.status !== 'pass'` when the worker is offline, heartbeats are stale, or queue backlog is growing. |
| `GET /api/production/health` | Comprehensive health summary consumed by dashboards. | `status === 'healthy'` with all `checks.*.status === 'pass'`. | HTTP `503` when any check fails, including queue durability, database access, or LLM provider configuration. |

All three endpoints live under the `/api/production` namespace and include timestamps to aid correlation across logs and dashboards.【F:server/routes.ts†L263-L270】【F:server/routes/production-health.ts†L35-L217】

## `/api/production/ready`

Example healthy response:

```json
{
  "ready": true,
  "checks": {
    "llm": true,
    "environment": true,
    "dependencies": true,
    "queue": true
  },
  "queueHealth": {
    "status": "pass",
    "durable": true,
    "message": "Redis connection healthy",
    "latencyMs": 2,
    "checkedAt": "2024-05-15T18:45:12.123Z"
  },
  "timestamp": "2024-05-15T18:45:12.125Z"
}
```

Key failure scenarios:

- **Redis outage or credentials drift** – `queueHealth.status` flips to `"fail"`, `queueHealth.message` includes the Redis error, `checks.queue` becomes `false`, and the endpoint responds with HTTP `503`. This condition causes `npm run dev:stack` to abort immediately, prompting engineers to bring Redis online before the workers start.【F:server/routes/production-health.ts†L95-L117】【F:scripts/dev-stack.ts†L85-L167】
- **In-memory queue driver** – When the BullMQ driver is misconfigured and falls back to the in-memory shim, `queueHealth.durable` becomes `false`, forcing `checks.queue` to `false` and returning HTTP `503` so deployments never proceed with non-durable queues.【F:server/services/QueueHealthService.ts†L41-L84】【F:server/routes/production-health.ts†L95-L117】

Because development environments run with `NODE_ENV=development`, the `environment` check stays `false` and the endpoint returns HTTP `503` even when Redis is healthy. `npm run dev:stack` treats `checks.queue === true` as success and continues bootstrapping the remaining workers once the queue is confirmed durable.【F:scripts/dev-stack.ts†L17-L170】

## `/api/production/queue/heartbeat`

This endpoint surfaces the worker telemetry snapshot, including queue depths, leases, and heartbeat ages.【F:server/routes/production-health.ts†L143-L217】 Use it to answer "is the worker alive and draining?" during an incident.

Healthy response highlights:

- `status.status === 'pass'` with message "Execution worker heartbeat is healthy and queue is drained."
- `worker.started === true` and `queueHealth.status === 'pass'`.
- Queue depth counters close to zero.

Failure indicators:

- `status.status === 'fail'` with message `Execution worker has not been started. Queue processing is offline.` when the worker process never reported a heartbeat.【F:server/routes/production-health.ts†L174-L195】
- `status.status === 'fail'` with `queueHealth.status === 'fail'` when Redis is unavailable or the queue driver is misconfigured.【F:server/routes/production-health.ts†L180-L195】
- `status.status === 'warn'` and `details.staleLeases` populated when heartbeats are older than the configured timeout, usually pointing to a stuck worker thread.【F:server/routes/production-health.ts†L195-L211】

## `/api/production/health`

The comprehensive health summary combines database checks, LLM provider validation, workflow repository metrics, and queue durability in a single payload for dashboards.【F:server/routes/production-health.ts†L35-L93】 When Redis is down the queue check fails, flipping the overall `status` to `"unhealthy"` and returning HTTP `503`. When only warning conditions exist (e.g., high memory usage), the endpoint downgrades to `"degraded"` while still responding with HTTP `200` for visibility without tripping hard outages.【F:server/routes/production-health.ts†L55-L91】

## Incident response checklist

1. **Verify readiness** – `curl -sS http://$HOST:$PORT/api/production/ready | jq '{ready: .ready, queue: .checks.queue, message: .queueHealth.message}'`. A `queue: false` result or non-zero exit code means Redis or the queue driver needs attention before continuing.
2. **Inspect worker heartbeat** – `curl -sS http://$HOST:$PORT/api/production/queue/heartbeat | jq '{status: .status.status, message: .status.message, latestHeartbeatAt: .worker.latestHeartbeatAt, queueHealth: .queueHealth.status}'`. Warn or fail statuses indicate worker downtime or stalled leases.
3. **Check system metrics** – `curl -sS http://$HOST:$PORT/api/production/health | jq '{status, queue: .checks.queue, metrics: .metrics}'` to assess broader platform health and backlog sizes.
4. **Document findings** – Capture the JSON payloads in the incident ticket so follow-up analysis can correlate queue depth, heartbeat age, and readiness transitions.

## Sample verification scripts

Embed the following helper in incident runbooks or CI smoke tests to assert queue durability:

```bash
#!/usr/bin/env bash
set -euo pipefail
API_BASE="${API_BASE:-http://localhost:5000}"

payload=$(curl -sS "$API_BASE/api/production/ready")
queue=$(jq -r '.checks.queue' <<<"$payload")
message=$(jq -r '.queueHealth.message // ""' <<<"$payload")

if [[ "$queue" != "true" ]]; then
  echo "Queue readiness failed: ${message:-unknown reason}" >&2
  exit 1
fi

echo "Queue ready (latency: $(jq '.queueHealth.latencyMs' <<<"$payload") ms)"
```

During active incidents, run a live watch to visualize heartbeat freshness:

```bash
watch -n5 'curl -sS http://localhost:5000/api/production/queue/heartbeat | jq "{status: .status.status, latestHeartbeat: .worker.latestHeartbeatAt, depth: (.queueDepths | to_entries)}"'
```

### Dashboard quickstart

Grafana teams using the [JSON API data source](https://grafana.com/grafana/plugins/marcusolsson-json-datasource/) can plot queue health by pointing a panel at `/api/production/queue/heartbeat` and extracting:

- `status.status` → single-stat panel to highlight pass/warn/fail.
- `worker.latestHeartbeatAgeMs` → time series showing heartbeat freshness.
- `queueDepths.*.waiting` and `queueDepths.*.delayed` → bar chart summarizing backlog.

The same datasource can target `/api/production/health` to trend `metrics.totalWorkflows` and system memory usage alongside queue durability for a consolidated operations dashboard.【F:server/routes/production-health.ts†L35-L217】
