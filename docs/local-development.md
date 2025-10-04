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

Shut the stack down with:

```bash
docker compose --env-file .env.development down
```

This tears down containers but leaves volumes intact so your data persists between sessions.
