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

`dev:stack` runs `drizzle-kit push`, verifies Redis availability, and starts:

- `npm run dev:api`
- `npm run dev:worker`
- `npm run dev:scheduler`
- `npm run dev:rotation`

Inline worker is disabled in this mode, so queue health maps to the dedicated worker process.

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

For deeper docs, see `docs/local-development.md`, `docs/deployment-guide.md`, and `docs/operations`.
