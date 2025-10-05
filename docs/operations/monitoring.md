# Monitoring Runbook

This runbook documents the production health endpoints that the platform exposes under `/api/production`. The examples assume the API is running on `http://localhost:5000` (the default for local development); adjust the host and port for your environment.

## `/api/production/health`

A comprehensive health report that surfaces subsystem status and high level metrics. The endpoint returns HTTP `200` when all checks pass, `200` when the service is degraded, and `503` when one or more checks fail.

```json
{
  "status": "healthy",
  "timestamp": "2024-04-01T15:42:11.123Z",
  "checks": {
    "database": { "status": "pass", "message": "Database connection healthy" },
    "llm": { "status": "pass", "message": "LLM providers healthy: openai" },
    "workflows": { "status": "pass", "message": "Workflow repository healthy" },
    "memory": { "status": "pass", "message": "Memory usage: 220MB / 512MB (43%)" },
    "queue": { "status": "pass", "message": "Redis connection healthy" },
    "dependencies": { "status": "pass", "message": "All critical dependencies available" }
  },
  "metrics": {
    "totalWorkflows": 128,
    "activeConnections": 5,
    "memoryUsage": { "rss": 1234567 },
    "cpuUsage": 0.12
  }
}
```

* **Redis outage:** The queue check is marked as `fail` with a message like `"Redis ping failed: connect ECONNREFUSED 127.0.0.1:6379"`; the endpoint responds with HTTP `503` and overall status `"unhealthy"`.
* **Worker outage:** Health will still return `200` because it only validates queue connectivity. Use the heartbeat endpoint (below) to detect worker failures.

## `/api/production/ready`

A lightweight readiness probe designed for orchestrators and startup scripts. The response contains a `ready` boolean plus nested check details. The endpoint returns HTTP `200` when ready and `503` otherwise.

```json
{
  "ready": true,
  "checks": {
    "llm": true,
    "environment": false,
    "dependencies": true,
    "queue": {
      "status": "pass",
      "durable": true,
      "message": "Redis connection healthy",
      "latencyMs": 4,
      "checkedAt": "2024-04-01T15:42:12.456Z"
    }
  },
  "timestamp": "2024-04-01T15:42:12.456Z"
}
```

Key failure modes:

* **Redis unavailable:** HTTP `503`. `checks.queue.status` becomes `"fail"` with the Redis error, and `durable` remains `true`. Startup scripts should treat this as fatal because jobs cannot be persisted.
* **In-memory queue driver:** HTTP `503`. `checks.queue.durable` is `false` with the message `"Queue driver is running in non-durable in-memory mode. Jobs will not be persisted."`
* **Readiness vs. worker health:** `/ready` confirms that Redis is reachable and durable queues are configured. It does **not** confirm that workers are actively processing jobs—pair it with the heartbeat endpoint during incidents.

## `/api/production/queue/heartbeat`

Operational telemetry for execution workers. The endpoint returns HTTP `200` when the worker heartbeat is healthy and `503` when the queue is stalled or workers are offline.

```json
{
  "status": {
    "status": "pass",
    "message": "Execution worker heartbeat is healthy and queue is drained."
  },
  "timestamp": "2024-04-01T15:42:14.000Z",
  "worker": {
    "started": true,
    "id": "worker-1",
    "queue": "execution",
    "heartbeatTimeoutMs": 30000,
    "latestHeartbeatAt": "2024-04-01T15:42:13.500Z",
    "latestHeartbeatAgeMs": 500
  },
  "queueHealth": {
    "status": "pass",
    "durable": true,
    "message": "Redis connection healthy",
    "latencyMs": 3,
    "checkedAt": "2024-04-01T15:42:13.900Z"
  },
  "queueDepths": {
    "execution": { "waiting": 0, "delayed": 0 }
  },
  "leases": []
}
```

* **Redis unavailable:** The embedded `queueHealth.status` field mirrors the readiness failure (`"fail"`) and the endpoint returns HTTP `503`.
* **Workers stopped / no heartbeat:** `status.status` becomes `"fail"` with the message `"Execution worker has not been started. Queue processing is offline."`
* **Stale heartbeats:** `status.status` becomes `"warn"` when leases exceed the heartbeat timeout. Investigate long-running jobs or stalled workers.

## On-call quick checks

The repository includes helper scripts that wrap these endpoints:

* `scripts/check-queue-health.sh` – polls `/api/production/ready` until the queue is healthy and then fetches `/api/production/queue/heartbeat` for operator-friendly output.

Example manual checks during an incident:

```bash
# Verify API readiness and queue durability
curl -sSf http://localhost:5000/api/production/ready | jq

# Inspect worker heartbeat and queue depths
curl -sSf http://localhost:5000/api/production/queue/heartbeat | jq '.status, .worker, .queueDepths'

# Capture a one-off health snapshot (suitable for Grafana JSON panel inputs)
curl -sSf http://localhost:5000/api/production/health > /tmp/automation-health.json
```

For dashboards, the JSON payloads can be ingested into Grafana or Datadog using JSON or log panels. Visualizing `queueDepths.execution.waiting`, `status.status`, and `queueHealth.latencyMs` provides quick signal on backlog and Redis latency.

