# Queue & Worker Infrastructure

This service uses [BullMQ](https://docs.bullmq.io/) backed by Redis for all background job processing. The queue helpers in `server/queue/index.ts` require a healthy Redis connection and will terminate worker startup if the queue cannot be created. Set `QUEUE_DRIVER=inmemory` only for isolated unit tests; production and development workers must run against Redis so jobs are durable. The utilities centralize queue configuration so that every queue, worker, and queue-events instance shares the same connection parameters, telemetry, and defaults.

## Environment variables

Set the following variables to configure the Redis connection that BullMQ should use. The defaults mirror `server/env.ts` so
local development falls back to `127.0.0.1:6379/0`, but production deployments **must** provide explicit values either through
your managed secret store (see `docs/operations/secret-management.md`) or the deployment environment:

| Variable | Description | Default |
| --- | --- | --- |
| `QUEUE_REDIS_HOST` | Redis host name or IP address. | `127.0.0.1` |
| `QUEUE_REDIS_PORT` | Redis TCP port. | `6379` |
| `QUEUE_REDIS_DB` | Logical Redis database index. | `0` |
| `QUEUE_REDIS_USERNAME` | Optional Redis username when ACLs are enabled. | _empty_ |
| `QUEUE_REDIS_PASSWORD` | Optional Redis password. | _empty_ |
| `QUEUE_REDIS_TLS` | Set to `true` to enable TLS connections (`rediss://`). | `false` |
| `QUEUE_METRICS_INTERVAL_MS` | Interval (ms) for periodic queue metrics collection/logging. | `60000` |
| `QUEUE_DRIVER` | Override the queue implementation. Set to `inmemory` only for isolated tests. | _empty_ |
| `EXECUTION_WORKER_CONCURRENCY` | Maximum number of workflow jobs processed concurrently across all tenants. | `2` |
| `EXECUTION_TENANT_CONCURRENCY` | Maximum number of workflow jobs processed concurrently per tenant/organization. | `EXECUTION_WORKER_CONCURRENCY` |

All queues created via the factory automatically honour these settings.

> ⚠️ **Redis is mandatory outside of unit tests.** The API, workers, and developer stack all fail fast when `QUEUE_REDIS_*` targets are unreachable. `npm run dev:stack` now verifies both Redis and Postgres connectivity before launching so missing infrastructure is reported immediately.【F:scripts/dev-stack.ts†L37-L160】

## Worker processes

Builds now emit separate entry points for the API (`dist/index.js`), the execution worker
(`dist/workers/execution.js`), the scheduling coordinator (`dist/workers/scheduler.js`), and the
timer dispatcher (`dist/workers/timerDispatcher.js`).

Use the following npm scripts to launch each process locally:

- `npm run start:api` — starts the HTTP server.
- `npm run start:worker` — runs the queue execution worker.
- `npm run start:scheduler` — runs the scheduler that promotes scheduled jobs onto the execution queue.
- `npm run start:timers` — runs the timer dispatcher responsible for delayed job fan-out.

`Dockerfile.api` builds the API container. `Dockerfile.worker` now accepts a `WORKER_SCRIPT`
build-arg/environment variable so the same image can run any of the worker processes. Build it once,
then choose the process at runtime, for example:

```bash
# Execution worker
docker run --env WORKER_SCRIPT=start:worker my-org/automation-worker

# Scheduler
docker run --env WORKER_SCRIPT=start:scheduler my-org/automation-worker

# Timer dispatcher
docker run --env WORKER_SCRIPT=start:timers my-org/automation-worker
```

This tri-process topology keeps queue responsibilities isolated across dedicated containers while
sharing the same build artifacts.

### Launch sequencing

For predictable queue behaviour, launch production processes in the following order:

1. `npm run start:api` (or the API container/Procfile entry)
2. `npm run start:scheduler`
3. `npm run start:worker`
4. `npm run start:timers`

Starting the scheduler before the worker is acceptable, but the worker must be online before queue
backlog grows. The [`/api/health/queue/heartbeat`](../../server/routes/production-health.ts) probe
confirms that the worker heartbeat is current and the queue depth is draining.

When the API is running without the dedicated worker processes (for example, only the `web` dyno is online), the runtime now polls queue depth and worker heartbeats. If backlog builds with no consumers, it logs `[ExecutionQueueService]` warnings and exposes them via `/api/admin/workers/status` so the Admin UI renders a banner instructing operators to start the missing processes.【F:server/services/ExecutionQueueService.ts†L292-L333】【F:client/src/components/automation/WorkerStatusPanel.tsx†L1-L220】 Once a worker heartbeat appears or the backlog drains, the warning clears automatically.

If you prefer to co-locate everything inside the API process for a lightweight environment, export
`ENABLE_INLINE_WORKER=true` (or `INLINE_EXECUTION_WORKER=true`) before starting the server. In
development this flag now defaults to `true` when unset so local API boots automatically start the
execution worker inline. Set `ENABLE_INLINE_WORKER=false` (or
`DISABLE_INLINE_WORKER_AUTOSTART=true`) to return to the recommended multi-process deployment.

## Local development with Docker Compose

A minimal Redis instance suitable for local queue development can be started with Docker Compose:

```yaml
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    command:
      [
        "redis-server",
        "--save", "60", "1",
        "--appendonly", "yes",
        "--appendfsync", "everysec"
      ]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10
```

Export the environment variables before starting the API or workers:

```bash
export QUEUE_REDIS_HOST=127.0.0.1
export QUEUE_REDIS_PORT=6379
export QUEUE_REDIS_DB=0
```

When TLS or authentication is required, set `QUEUE_REDIS_USERNAME`, `QUEUE_REDIS_PASSWORD`, and `QUEUE_REDIS_TLS=true` accordingly. Set `QUEUE_DRIVER=inmemory` only for automated tests that do not start the real workers; production and developer workflows should use Redis.

### Local-only fallback

Set `QUEUE_DRIVER=inmemory` only for ephemeral demos or automated tests that never start the worker fleet. The in-memory queue keeps jobs in the API process, so crashes or restarts will lose work and the scheduler cannot fan out timers. Production health endpoints flag this mode as non-durable and the Admin UI renders a warning banner so operators can see that Redis has been bypassed.【F:server/services/QueueHealthService.ts†L81-L112】【F:client/src/components/automation/WorkerStatusPanel.tsx†L1-L220】 Always revert to Redis-backed BullMQ before exercising shared environments or running integration tests.

## Queue health & readiness

Worker processes call `assertQueueIsReady` during startup and exit immediately if the BullMQ connection cannot be established. If Redis is unreachable the error now includes the exact target (e.g. `rediss://queue-user@redis.internal:6380/1`) and remediation hints that point to `/api/production/queue/heartbeat` and this guide. Run `npm run check:queue` (or `tsx scripts/check-queue-readiness.ts`) in CI/CD pipelines to fail fast when the queue is misconfigured before the API or worker containers begin accepting workload. The `/api/health` endpoint now reports the queue status, latency, and durability, while `/api/health/ready` returns `503` whenever Redis is unreachable or the queue is running in in-memory mode. Use these probes in Kubernetes or container orchestrators to ensure the workers only receive traffic when the queue is durable.

## Telemetry & metrics helpers

Use `registerQueueTelemetry` to attach logging and periodic metrics collection to any queue. The helper wires standard BullMQ events (`completed`, `failed`, `stalled`, `waiting`, and `error`) to console logging by default. You can supply custom handlers or a metrics callback to push queue statistics into your observability stack.

Example:

```ts
import { createQueue, createQueueEvents, registerQueueTelemetry } from '../queue';

const executionQueue = createQueue('workflow.execute');
const executionEvents = createQueueEvents('workflow.execute');

const detach = registerQueueTelemetry(executionQueue, executionEvents, {
  onMetrics: (counts) => metricsClient.gauge('queue.workflow_execute', counts),
});

// Call detach() during shutdown to remove listeners and timers.
```

The factory exports typed job payloads (e.g. `workflow.execute`) so that enqueueing and worker processors receive type-safe payloads throughout the codebase.

## Incident response polling

Administrators can poll the execution infrastructure via `GET /api/admin/workers/status` when triaging queue incidents. The
endpoint is protected by the standard admin token middleware and returns structured JSON suitable for dashboards or ad-hoc
scripts. A sample response includes:

```json
{
  "success": true,
  "data": {
    "timestamp": "2024-05-15T18:19:00.000Z",
    "executionWorker": {
      "started": true,
      "queueDriver": "bullmq",
      "metrics": {
        "queueDepths": {
          "workflow.execute.us": {
            "waiting": 2,
            "active": 1,
            "total": 3
          }
        }
      }
    },
    "scheduler": {
      "preferredStrategy": "postgres",
      "redis": {
        "status": "ready"
      }
    }
  }
}
```

During an incident, query the endpoint at a low cadence (for example every 30–60 seconds) to watch queue depth, confirm that the
execution worker remains started, and verify that the scheduler continues to acquire locks. Combine the payload with existing
telemetry dashboards to quickly spot regional imbalances or lock contention without shelling into the worker containers.
