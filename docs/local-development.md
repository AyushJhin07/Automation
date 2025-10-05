# Local Development Environment

This guide covers the quickest path to booting the platform locally with Docker Compose.

> 📘 **Need a mental model for the runtime?** Read the [Workflow Runtime Interaction Guide](./architecture/workflow-runtime-interactions.md) to understand how WorkflowRuntime, IntegrationManager, GenericExecutor, and RetryManager coordinate while you run local flows.

## 1. Prepare environment variables

1. Copy the sample environment file and use it as your personal development configuration:
   ```bash
   cp .env.example .env.development
   ```
2. Generate per-developer secrets before starting any local processes:
   ```bash
   npm run bootstrap:secrets
   ```
   This script backfills strong random values for `ENCRYPTION_MASTER_KEY` and `JWT_SECRET`, matching the minimum length enforced by `EncryptionService`.
3. Edit `.env.development` to match your local setup. Fill in any provider API keys you plan to exercise (OpenAI, Anthropic, Claude, Google, Gemini). Leave them blank to disable those integrations locally.

4. If your local database has not yet been migrated to the envelope-encryption schema, enable the development fallback for OAuth tokens:

   ```bash
   echo "ALLOW_PLAINTEXT_TOKENS_IN_DEV=true" >> .env.development
   ```

   The API logs a 🚨 warning whenever this bypass is active. Once the migration that adds `connections.data_key_ciphertext` and related encryption metadata lands locally, remove or set this flag to `false` so tokens resume flowing through the secure storage path.

> ℹ️  When running outside of Docker Compose, either export the variables manually or copy `.env.development` to `.env` so `dotenv` can pick them up. Never commit personal secrets.

## 2. Initialize the database (one-time)

Run the schema migrations and seed the encryption key before booting the services. These
commands target the database referenced by `DATABASE_URL` in `.env.development`:

```bash
npm run db:push
npm run seed:encryption-key
```

`npm run seed:encryption-key` derives a deterministic 256-bit key from
`ENCRYPTION_MASTER_KEY`. Ensure `npm run bootstrap:secrets` has populated that variable in
your `.env.development` file first. Re-run the seed after wiping your database to restore the
active key record. If you need connector metadata locally, run
`npx tsx scripts/seed-all-connectors.ts seed` once migrations have succeeded.

> ℹ️  `npm run dev:stack` automatically executes `npm run db:push` on startup. Running the
> commands above ahead of time provides fast feedback and guarantees that the seed completes
> before the API or workers begin processing traffic.

## 3. Start the Docker Compose stack

With `.env.development` in place, launch the local services:

```bash
docker compose --env-file .env.development up --build
```

The default configuration in `.env.example` assumes PostgreSQL and Redis are running inside the Compose stack. Adjust the hostnames or ports if you are using external services.

## 4. Next steps

- `npm run dev:api` starts the API in watch mode and automatically boots the Vite-powered frontend
  development server. In development the API now defaults to running the execution worker inline when
  `ENABLE_INLINE_WORKER` is not explicitly set, preventing silent queues when you forget to start a
  separate worker.
- `npm run dev:worker` runs the execution worker that processes queued jobs.
- `npm run dev:scheduler` runs the polling scheduler responsible for enqueuing work.
- `npm run dev:stack` starts the API, scheduler, execution worker, and encryption rotation worker
  together with shared lifecycle and cleanup logic. It also disables the inline auto-start on the API
  so the dedicated worker process can take over.
- Consult `docs/operations/queue.md` if you need advanced Redis/BullMQ tuning.

### Multi-process vs. inline worker flows

Local developers can now choose between a dedicated worker topology or a single-process "inline"
mode when booting the stack:

1. **Multi-process (recommended for parity with production)**
   - Set `ENABLE_INLINE_WORKER=false` (or run through `npm run dev:stack`, which configures this for
     you).
   - Start the API: `npm run dev:api`
   - In a second terminal, start the scheduler: `npm run dev:scheduler`
   - In a third terminal, run the execution worker: `npm run dev:worker`
   - Optional: `npm run dev:rotation` or `npm run dev:stack` to supervise all of the above in one
     shell.
   This mirrors the production Procfile entries so you can observe queue depth and worker logs
   independently.

2. **Inline worker (single terminal)**
   - Leave `ENABLE_INLINE_WORKER` unset or set it to `true` in `.env.development`.
   - Run `npm run dev:api`.
   When the flag resolves to true, the API boot sequence automatically starts the execution worker
   inside the same Node process. This is convenient for quick smoke tests when you do not need
   separate worker logs. Export `ENABLE_INLINE_WORKER=false` (or `DISABLE_INLINE_WORKER_AUTOSTART=true`)
   to return to the dedicated worker model.

In development and CI the API now refuses to finish booting if it cannot detect a fresh execution
worker heartbeat. When you see the startup failure, start `npm run dev:worker`/`npm run dev:scheduler`
or enable the inline worker flag before retrying. Set `SKIP_WORKER_HEARTBEAT_CHECK=true` only when you
deliberately want to bypass this guard (for example in a one-off smoke test container).

Shut the stack down with:

```bash
docker compose --env-file .env.development down
```

This tears down containers but leaves volumes intact so your data persists between sessions.
