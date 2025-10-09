# Automation Platform

Developer-friendly automation stack with workflow builder, queue-backed execution, webhook ingestion, and OAuth connector storage. This README summarizes the fastest path to running the system locally and the key health checks.

## Quickstart

```bash
# 1. Install dependencies
npm install

# 2. Copy env template and fill required values
cp .env.example .env.development
npm run bootstrap:secrets   # generates ENCRYPTION_MASTER_KEY & JWT_SECRET

# 3. Start Redis (if you are not using docker-compose)
redis-server --daemonize yes

# 4. Launch the stack (API + worker + scheduler)
npm run dev:stack
```

`dev:stack` runs `drizzle-kit push`, verifies Redis and Postgres connectivity up front, and starts:

- `npm run dev:api`
- `npm run dev:worker`
- `npm run dev:scheduler`
- `npm run dev:timers`
- `npm run dev:rotation`

Inline worker is disabled in this mode, so queue health maps to the dedicated worker process.

If Redis is misconfigured or `QUEUE_DRIVER=inmemory`, `dev:stack` now fails fast with guidance similar to:

```
[dev:stack] dev:stack requires a durable BullMQ queue driver. QUEUE_DRIVER=inmemory keeps jobs in process memory and will drop work on restart.
[dev:stack] Resolved Redis target: redis://127.0.0.1:6379/0
[dev:stack] Remove QUEUE_DRIVER=inmemory (reserved for isolated tests) and configure QUEUE_REDIS_HOST/PORT/DB so every process connects to the same Redis instance.
```

After each child process starts, the supervisor pings `/api/health/queue` (for the API) or Redis directly to make sure every component is pointed at the same durable BullMQ driver before declaring the stack ready.

## No-Redis Local (fast path)

For quick local iteration without Redis, run the API with an inline worker and use the in-memory queue driver. This is not durable and is only recommended for isolated testing.

```bash
# 1) Create .env.development with these overrides
ENABLE_INLINE_WORKER=true
QUEUE_DRIVER=inmemory

# 2) Apply DB migrations to your configured DATABASE_URL
npx drizzle-kit push

# 3) Bootstrap a dev user/org and seed a workflow
npm run dev:bootstrap

# 4) Start the API (inline worker runs inside the API)
npm run dev

# 5) Optional: run a smoke to enqueue an execution
npm run dev:smoke
```

To switch to a proper setup later, remove `QUEUE_DRIVER=inmemory`, ensure Redis is running, and either keep the inline worker on or start a dedicated worker in a second terminal with `npm run dev:worker`.

### Durable mock queue (for automated tests)

When Redis is unavailable but you still need `/api/health/queue` to report a durable queue (for example in automated smoke tests), set `QUEUE_DRIVER=mock`. The mock driver reuses the in-memory queue implementation but reports a passing, durable status through the health checks so that UI actions like the Run button remain enabled. This mode should only be used for local development and automated testing.

## Health Checks

- Queue heartbeat: `curl http://localhost:5000/api/production/queue/heartbeat`
- API readiness (expect 503 in dev until `NODE_ENV=production`): `curl http://localhost:5000/api/production/ready`
- Dev-only direct runner (bypasses queue):
  ```bash
  curl -X POST http://localhost:5000/api/dev/run-direct \
    -H "Authorization: Bearer <DEV_TOKEN>" \
    -H "X-Organization-Id: <ORG_ID>" \
    -H "Content-Type: application/json" \
    -d '{"workflowId":"<WORKFLOW_ID>","initialData":{"message":"Hi"}}'
  ```

## Developer Utilities

| Command | Purpose |
| --- | --- |
| `npm run dev:bootstrap` | Registers a local dev user, seeds a "Hello World" workflow, prints a ready-to-run curl |
| `npm run dev:smoke` | Logs in, selects the latest workflow, POSTs to `/api/executions` |
| `npm run dev:webhook` | Registers a test webhook and POSTs a sample event |
| `npm run dev:oauth` | Stores a fake OAuth connection using the new encryption columns |
| `npm run check:queue` | Verifies Redis/BullMQ connectivity |
| `npm run ci:smoke-local` | Boots API inline, waits for queue heartbeat, runs all dev smokes (used in CI) |

All smokes rely on `developer@local.test / Devpassw0rd!` (override with `DEV_BOOTSTRAP_EMAIL/DEV_BOOTSTRAP_PASSWORD`).

## Production Processes

Build and start with PM2 (mirrors `Procfile`):

```bash
npm run build
pm2 start ecosystem.config.js
pm2 status
```

Processes:
- `api`: `dist/index.js`
- `worker`: `dist/workers/execution.js`
- `scheduler`: `dist/workers/scheduler.js`
- `timers`: `dist/workers/timerDispatcher.js`
- `encryption-rotation`: `dist/workers/encryption-rotation.js`

Ensure `DATABASE_URL`, `QUEUE_REDIS_*`, and secrets exist in the environment before starting.

## Webhooks

1. Set `SERVER_PUBLIC_URL` (ngrok, Cloudflare Tunnel, etc.).
2. Run `npm run dev:webhook` to register a local test webhook and send a sample event.
3. Inspect execution logs in `/api/executions/<executionId>`.

For production, point providers at `https://<domain>/api/webhooks/<provider>` routes. See `docs/webhooks-slack-events.md` for examples.

## OAuth Smoke

`npm run dev:oauth` stores a fake connection using the `connections` envelope-encryption columns. Replace the `provider` field and token payload when testing a real provider.

When running real OAuth flows:

- Set the provider client ID/secret in your `.env` or secrets manager.
- Ensure `SERVER_PUBLIC_URL` matches the redirect URI registered with the provider.
- After a successful callback, `/api/oauth/store-connection` persists tokens using AES-GCM envelope encryption.

---

For deeper docs, see:

- `docs/local-development.md`
- `docs/runtimes-and-fallbacks.md`
- `docs/connectors/authoring.md`
- `docs/deployment-guide.md`
- `docs/operations`
