# Local Development Environment

This guide covers the quickest path to booting the platform locally with Docker Compose.

## 1. Prepare environment variables

1. Copy the sample environment file and use it as your personal development configuration:
   ```bash
   cp .env.example .env.development
   ```
2. Edit `.env.development` to match your local setup. Sensitive values must be generated per developer:
   - `ENCRYPTION_MASTER_KEY`: generate a unique 32-byte value (`openssl rand -base64 32`).
   - `JWT_SECRET`: use a unique, high-entropy string (32+ characters). Avoid reusing production values.
3. Fill in any provider API keys you plan to exercise (OpenAI, Anthropic, Claude, Google, Gemini). Leave them blank to disable those integrations locally.

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
