# Queue & Worker Infrastructure

This service uses [BullMQ](https://docs.bullmq.io/) backed by Redis for all background job processing. The utilities in `server/queue/BullMQFactory.ts` centralize queue configuration so that every queue, worker, and queue-events instance shares the same connection parameters, telemetry, and defaults.

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

All queues created via the factory automatically honour these settings.

## Local development with Docker Compose

A minimal Redis instance suitable for local queue development can be started with Docker Compose:

```yaml
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    command: ["redis-server", "--save", "", "--appendonly", "no"]
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

When TLS or authentication is required, set `QUEUE_REDIS_USERNAME`, `QUEUE_REDIS_PASSWORD`, and `QUEUE_REDIS_TLS=true` accordingly.

## Telemetry & metrics helpers

Use `registerQueueTelemetry` to attach logging and periodic metrics collection to any queue. The helper wires standard BullMQ events (`completed`, `failed`, `stalled`, `waiting`, and `error`) to console logging by default. You can supply custom handlers or a metrics callback to push queue statistics into your observability stack.

Example:

```ts
import { createQueue, createQueueEvents, registerQueueTelemetry } from '../queue/BullMQFactory';

const executionQueue = createQueue('workflow.execute');
const executionEvents = createQueueEvents('workflow.execute');

const detach = registerQueueTelemetry(executionQueue, executionEvents, {
  onMetrics: (counts) => metricsClient.gauge('queue.workflow_execute', counts),
});

// Call detach() during shutdown to remove listeners and timers.
```

The factory exports typed job payloads (e.g. `workflow.execute`) so that enqueueing and worker processors receive type-safe payloads throughout the codebase.
