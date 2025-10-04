# Local Development Environment

This guide describes how to run the API, background workers, and observability stack locally with Docker Compose. It also explains how to switch between the in-memory development queue and the Redis-backed BullMQ queue used in production.

## Prerequisites

1. Install Docker and Docker Compose v2.
2. Install Node.js 22+ and npm 10+ (see the `engines` field in `package.json`).
3. Install project dependencies:
   ```bash
   npm install
   ```
4. (First run only) apply the latest database schema:
   ```bash
   npm run db:push
   ```

Create a `.env` file at the repository root with the secrets you want to use locally. For development you can supply placeholder values to silence warnings:

```env
ENCRYPTION_MASTER_KEY=dev-master-key
JWT_SECRET=dev-jwt-secret
```

## Running with Docker Compose

Launch the full stack with a single command:

```bash
docker compose -f docker-compose.dev.yml up --build
```

The compose file starts Postgres, Redis, Jaeger, and three Node.js processes bound to the local workspace:

| Service    | Command                | Ports exposed | Purpose |
| ---------- | --------------------- | ------------- | ------- |
| postgres   | `postgres`             | `5432`        | Workflow metadata + trigger storage |
| redis      | `redis-server`         | `6379`        | BullMQ queue backend |
| jaeger     | all-in-one collector   | `16686`, `4318` | Trace UI + OTLP HTTP ingest |
| api        | `npm run dev:api`      | `5000`        | HTTP + Vite frontend dev server |
| worker     | `npm run dev:worker`   | _internal_    | Workflow execution worker |
| scheduler  | `npm run dev:scheduler`| _internal_    | Polling trigger scheduler |

Jaeger’s UI is available at [http://localhost:16686](http://localhost:16686). The API listens on [http://localhost:5000](http://localhost:5000).

The Node containers mount your local workspace, so edits on the host trigger `tsx watch` restarts inside each process. If you change dependencies, rerun `npm install` on the host and restart the compose stack so the containers pick up the updated `node_modules`.

## Queue backends: in-memory vs Redis

The execution queue automatically falls back to in-memory behavior when the database is unavailable. When `DATABASE_URL` is missing or migrations have not been applied, `ExecutionQueueService` logs a warning and skips worker startup, letting workflow execution remain synchronous for quick prototyping.【F:server/database/schema.ts†L1094-L1111】【F:server/services/ExecutionQueueService.ts†L189-L211】 This mode does not require Redis or Postgres.

To exercise the production-like BullMQ flow, provide a valid `DATABASE_URL` and Redis configuration. The compose file wires each Node service to Postgres and Redis via environment variables so that `ExecutionQueueService` creates the BullMQ queue and background worker automatically.【F:docker-compose.dev.yml†L4-L74】【F:server/queue/BullMQFactory.ts†L42-L81】 You can also export the same variables in your shell when running processes outside Docker:

```bash
export DATABASE_URL=postgres://automation:automation@localhost:5432/automation
export QUEUE_REDIS_HOST=127.0.0.1
export QUEUE_REDIS_PORT=6379
export QUEUE_REDIS_DB=0
```

With Redis enabled, start the worker (`npm run dev:worker`) and scheduler (`npm run dev:scheduler`) alongside the API so queued jobs are actually processed. The `npm run dev:stack` helper launches the API, scheduler, execution worker, and encryption rotation worker together and keeps their lifecycles in sync.

## Observability

Set `OBSERVABILITY_ENABLED=true` to enable OpenTelemetry instrumentation. The compose stack already points the processes at Jaeger’s OTLP HTTP endpoint (`http://jaeger:4318/v1/traces`), so spans appear automatically once traffic flows through the API.【F:docker-compose.dev.yml†L4-L74】【F:server/observability/index.ts†L58-L126】 If you prefer to disable tracing temporarily, set `OBSERVABILITY_ENABLED=false` before starting the containers.
