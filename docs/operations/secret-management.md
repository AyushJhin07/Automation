# Secret Management

The platform now loads production credentials from a managed secret store instead of
shared `.env` files. Secrets are pulled at runtime during process boot and hydrated into
`process.env` before any dependent modules execute.

## AWS Secrets Manager integration

Set the following environment variables on the API/worker deployments to enable AWS
Secrets Manager:

| Variable | Description |
| --- | --- |
| `SECRET_MANAGER_PROVIDER=aws` | Activates the AWS loader. |
| `AWS_REGION` (or `AWS_DEFAULT_REGION`) | Region that hosts the secret. |
| `AWS_SECRETS_MANAGER_SECRET_IDS` | Comma-separated list of secret ARNs or names. |

Each referenced secret should resolve to a JSON object (e.g. `{"OPENAI_API_KEY":"sk-..."}`)
containing the desired key/value pairs. Non-JSON secrets fall back to a single key derived
from the secret name.

When provisioning Redis for BullMQ, store the following keys in the same secret payload so they hydrate into the runtime
environment alongside your API credentials:

```json
{
  "QUEUE_REDIS_HOST": "redis.production.example.com",
  "QUEUE_REDIS_PORT": "6379",
  "QUEUE_REDIS_DB": "0",
  "QUEUE_REDIS_USERNAME": "queue-user",
  "QUEUE_REDIS_PASSWORD": "super-secure-password",
  "QUEUE_REDIS_TLS": "true"
}
```

The loader honours per-region overrides (`QUEUE_REDIS_<REGION>_*`) if you provide multi-tenant secrets; export values for every
region that needs a dedicated Redis endpoint.

AWS credentials are resolved from the ambient environment variables
(`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, optional `AWS_SESSION_TOKEN`). When running on
managed infrastructure (EKS, ECS, Lambda, etc.) assign an IAM role with `secretsmanager:GetSecretValue`
and surface the credentials as environment variables or inject them via the runtime’s
metadata service before the Node process starts.

Boot logs only confirm that managed secrets were loaded (count + provider) and never echo
individual keys. Failures in production short-circuit startup; in development a warning is
emitted and the loader falls back to local `.env` entries.

## Local development fallback

Local contributors can continue to use `.env.development` or `.env.local` files. Missing values
for `JWT_SECRET` and `ENCRYPTION_MASTER_KEY` are generated deterministically and written to
`.env.local` to avoid collisions between developers.

The loader records the origin of each sensitive value (`aws`, `environment`, or `generated`).
Administrators can inspect the consolidated view at `GET /api/health/credentials`, which is
protected by the existing `authenticateToken` + `adminOnly` middleware stack.

## Repository / pipeline audit

Run `npm run audit:secrets` locally or in CI to ensure real credentials never make it into
tracked files. The audit checks for:

- tracked `.env` files (except `.env.example`)
- file names containing `secret`/`secrets`
- common API-key patterns (`sk-`, `AWS_SECRET_ACCESS_KEY`, `AIza...`, PEM private keys)

The command exits with a non-zero status when suspicious files are detected, providing a
short list for manual review.

Add the audit step to build pipelines after dependency installation to guarantee secrets
are stripped before packaging artefacts or generating release branches.
