# Queue & Worker Infrastructure

This service uses [BullMQ](https://docs.bullmq.io/) backed by Redis for all background job processing. The queue helpers in `server/queue/index.ts` require a healthy Redis connection and will terminate worker startup if the queue cannot be created. Set `QUEUE_DRIVER=inmemory` only for isolated unit tests; production and development workers must run against Redis so jobs are durable. The utilities centralize queue configuration so that every queue, worker, and queue-events instance shares the same connection parameters, telemetry, and defaults.

## Environment variables

Set the following variables to configure the Redis connection that BullMQ should use:

| Variable | Description | Default |
| --- | --- | --- |
| `QUEUE_REDIS_HOST` | Redis host name or IP address. | `127.0.0.1` |
| `QUEUE_REDIS_PORT` | Redis TCP port. | `6379` |
| `QUEUE_REDIS_DB` | Logical Redis database index. | `0` |
| `QUEUE_REDIS_USERNAME` | Optional Redis username when ACLs are enabled. | _empty_ |
| `QUEUE_REDIS_PASSWORD` | Optional Redis password. | _empty_ |
| `QUEUE_REDIS_TLS` | Set to `true` to enable TLS connections. | `false` |
| `QUEUE_METRICS_INTERVAL_MS` | Interval (ms) for periodic queue metrics collection/logging. | `60000` |
| `QUEUE_DRIVER` | Override the queue implementation. Set to `inmemory` only for isolated tests. | _empty_ |
| `EXECUTION_WORKER_CONCURRENCY` | Maximum number of workflow jobs processed concurrently across all tenants. | `2` |
| `EXECUTION_TENANT_CONCURRENCY` | Maximum number of workflow jobs processed concurrently per tenant/organization. | `EXECUTION_WORKER_CONCURRENCY` |

All queues created via the factory automatically honour these settings.

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

## Queue health & readiness

Worker processes call `assertQueueIsReady` during startup and exit immediately if the BullMQ connection cannot be established. The `/api/health` endpoint now reports the queue status, latency, and durability, while `/api/health/ready` returns `503` whenever Redis is unreachable or the queue is running in in-memory mode. Use these probes in Kubernetes or container orchestrators to ensure the workers only receive traffic when the queue is durable.

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
