# Smoke Tests (Dev)

Prereqs: `GENERIC_EXECUTOR_ENABLED=true` in `.env`, JWT for auth.

- Roadmap status
  - GET `/api/roadmap` → should list tasks and counts.
- Connectors stats
  - GET `/api/status/connectors` → should show counts.
- OAuth
  - POST `/api/oauth/authorize` with `{ provider: "slack" }` → returns `authUrl`.
- Initialize via provider
  - POST `/api/integrations/initialize` with `{ provider: "slack" }` (after storing connection) → returns connected.
- Execute generic
  - Slack send_message using `{ provider: "slack" }` and `parameters`.
- Execute paginated
  - HubSpot search_contacts via `/api/integrations/execute-paginated`.
- Default polling
  - POST `/api/triggers/polling/register-default/typeform` with `uid`.
- Webhook register + subscribe
  - POST `/api/webhooks/register/stripe` → returns providerUrl.
  - POST `/api/webhooks/subscribe` for `typeform` and `github`.
