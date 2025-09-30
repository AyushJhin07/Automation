# Deployment Guide

- Feature flags
  - GENERIC_EXECUTOR_ENABLED: set true in non-prod to exercise connectors via JSON definitions.
- Environment
  - Configure OAuth client IDs/secrets in deployment environment; never commit .env.
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
