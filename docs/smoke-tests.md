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

## Baseline Gmail send-email pipeline

- `npx tsx server/workflow/__tests__/WorkflowRuntime.gmail.integration.test.ts`
  - Provisions a Gmail OAuth connection via the encrypted file store, executes the workflow runtime against the connector simulator, and asserts the simulated Gmail response payload.
  - Use this as the minimum sanity check before demos—if this passes, OAuth credentials, connection storage, runtime execution, and the Gmail provider shim are wired end-to-end.

## Connector-specific smoke runner

- Copy `configs/connector-smoke.config.example.json` to
  `configs/connector-smoke.config.json` and fill in staging credentials.
- Run `npm run smoke:connectors` to execute `testConnection` plus the configured
  actions/triggers for every registered connector. Results include pass/fail
  summaries you can attach to release checklists.
- CI runs `npm run ci:smoke`, which exercises the suite against the connector
  simulator fixtures in `server/testing/fixtures` so that smoke coverage is
  available without live credentials.
