# Deployment Guide

- Feature flags
  - GENERIC_EXECUTOR_ENABLED: set true in non-prod to exercise connectors via JSON definitions.
- Environment
  - Configure OAuth client IDs/secrets in deployment environment; never commit .env.
  - Prefer managed secrets: set `SECRET_MANAGER_PROVIDER=aws` and populate AWS Secrets Manager as described in [operations/secret-management](./operations/secret-management.md).
  - Ensure DATABASE_URL is set for persistence.
- Rate limits
  - See GET /api/status/rate-limits for derived vendor limits; adjust reverse proxy if needed.
- Health checks
  - GET /api/health/ready → readiness for registry/OAuth/DB configuration.
  - GET /api/health/features → feature flags.
- Logs & Security
  - Secrets redacted server-side; avoid printing credentials in app logs.
- Rollout
  - Flip connectors to Stable by registering API clients in ConnectorRegistry.
- Process topology
  - Run the web API/UI: `NODE_ENV=production node dist/index.js` (or `tsx server/index.ts` during development).
  - Run at least one execution worker: `NODE_ENV=production tsx server/workers/execution.ts` (scale horizontally for more throughput).
  - A root-level `Procfile` defines the production process manifest (`web`, `worker`, `scheduler`, `timers`, `encryption-rotation`) so platforms like Heroku, Render, or PM2 can auto-discover the correct bundles (`dist/index.js`, `dist/workers/execution.js`, `dist/workers/scheduler.js`, `dist/workers/timerDispatcher.js`, `dist/workers/encryption-rotation.js`).
  - The generated `ecosystem.config.js` mirrors the Procfile for PM2 deployments:

    ```bash
    npm run build
    pm2 start ecosystem.config.js
    pm2 status
    ```

  - Use a process supervisor (systemd, PM2, etc.) to restart the web and worker processes and to forward `SIGTERM` for graceful shutdowns.
  - Both processes require the same environment (DATABASE_URL, API keys). Workers will drain in-flight jobs before exiting.

## Platform-specific process manifests

### Heroku

- The root [`Procfile`](../Procfile) declares **five** dyno types: `web`, `worker`, `scheduler`, `timers`, and `encryption-rotation`. Provision one dyno for each so background jobs, timers, and key-rotation jobs continue to run during deploys.【F:Procfile†L1-L5】
- Add a [release phase](https://devcenter.heroku.com/articles/release-phase) that runs `npm run check:queue` followed by `curl -fsS "$APP_URL/api/production/queue/heartbeat" | jq -e '.status.status == "pass"'` to fail the deploy if Redis or the worker heartbeat is unavailable.【F:scripts/ci-smoke.ts†L32-L58】【F:docs/operations/monitoring.md†L33-L58】
- Use Heroku Redis or point `QUEUE_REDIS_*` at an external instance; the API exits on startup when Redis is unreachable.【F:scripts/dev-stack.ts†L111-L160】

### Render

- Mirror the Procfile by creating one Web Service (API) and four Background Services (worker, scheduler, timers, encryption-rotation). Each service shares the same environment block so Redis credentials remain consistent.【F:docker-compose.dev.yml†L4-L86】
- Add a Render Health Check for `/api/production/queue/heartbeat` to each background service so the dashboard reports unhealthy when the queue stops draining.【F:docs/operations/monitoring.md†L33-L58】
- Render deploy hooks should run `npm run check:queue` or the curl heartbeat guard before flipping traffic, matching the Heroku release step.

### Fly.io

- Run the API and workers as separate Fly apps or as distinct processes within a single machine using `[processes]` blocks for `web`, `worker`, `scheduler`, `timers`, and `encryption-rotation` mirroring the Procfile. Each machine must load identical `DATABASE_URL` and `QUEUE_REDIS_*` secrets.【F:Procfile†L1-L5】
- Configure Fly checks on `/api/production/ready` for the web process and `/api/production/queue/heartbeat` for each worker-oriented process. Treat failures as reasons to halt a deployment.
- Use Fly's release command (or GitHub Action) to call the heartbeat endpoint before promoting a new image.

### PM2 / bare metal

- Run `pm2 start ecosystem.config.js` after `npm run build`. The [`ecosystem.config.js`](../ecosystem.config.js) file already defines five apps matching the Procfile so PM2 supervises the same topology.【F:ecosystem.config.js†L1-L41】
- Configure `pm2-runtime` or your CI/CD hooks to execute `npm run check:queue` and the heartbeat curl before marking the deployment healthy, ensuring Redis and the worker fleet are online.

## Queue health validation in automation

- Add the queue heartbeat probe to your deployment pipelines. The CI smoke harness already waits for `GET /api/production/queue/heartbeat` to succeed before exercising the API; reuse the same command in release automation.【F:scripts/ci-smoke.ts†L16-L61】
- The monitoring runbook documents the exact curl invocation and expected JSON fields—use it as the canonical guardrail before routing external traffic.【F:docs/operations/monitoring.md†L33-L61】
