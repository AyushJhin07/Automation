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

## 2. Start the Docker Compose stack

With `.env.development` in place, launch the local services:

```bash
docker compose --env-file .env.development up --build
```

The default configuration in `.env.example` assumes PostgreSQL and Redis are running inside the Compose stack. Adjust the hostnames or ports if you are using external services.

## 3. Next steps

- `npm run dev:api` starts the API in watch mode and automatically boots the Vite-powered frontend
  development server.
- `npm run dev:worker` runs the execution worker that processes queued jobs.
- `npm run dev:scheduler` runs the polling scheduler responsible for enqueuing work.
- `npm run dev:stack` starts the API, scheduler, execution worker, and encryption rotation worker
  together with shared lifecycle and cleanup logic. Use this script whenever you need the queue
  processing components (scheduler + execution worker) online alongside the API.
- Consult `docs/operations/queue.md` if you need advanced Redis/BullMQ tuning.

### Multi-process vs. inline worker flows

Local developers can now choose between a dedicated worker topology or a single-process "inline"
mode when booting the stack:

1. **Multi-process (recommended for parity with production)**
   - Start the API: `npm run dev:api`
   - In a second terminal, start the scheduler: `npm run dev:scheduler`
   - In a third terminal, run the execution worker: `npm run dev:worker`
   - Optional: `npm run dev:rotation` or `npm run dev:stack` to supervise all of the above in one
     shell.
   This mirrors the production Procfile entries so you can observe queue depth and worker logs
   independently.

2. **Inline worker (single terminal)**
   - Export `ENABLE_INLINE_WORKER=true` (or set it in `.env.development`).
   - Run `npm run dev:api`.
   When the flag is present, the API boot sequence automatically starts the execution worker inside
   the same Node process. This is convenient for quick smoke tests when you do not need separate
   worker logs. Turn the flag off to return to the dedicated worker model.

Shut the stack down with:

```bash
docker compose --env-file .env.development down
```

This tears down containers but leaves volumes intact so your data persists between sessions.
