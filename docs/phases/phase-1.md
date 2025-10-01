# Phase 1 — Execution Foundations (Batch 1)

Objectives

- Execute JSON-defined connector actions/triggers via a Generic Executor (HTTP-based), falling back to bespoke clients where required.
- OAuth & API key flows end-to-end with Test Connection.
- Polling triggers baseline; webhooks where supported for Batch 1.
- Contract tests with mocks, standardized errors, rate limits handling.

Scope (Batch 1 targets)

- See production/reports/batch1-proposal.md (18 connectors)
- Coverage targets: Bronze for all; Silver for webhook-capable where feasible this phase.

Deliverables

- GenericExecutor in server/integrations (auth injectors, request builder, basic error mapping)
- IntegrationManager routes connectors JSON → GenericExecutor when no bespoke client exists
- OAuth providers and token storage/refresh flows for Batch 1
- Polling TriggerRunner v1 with per-connector schedule + backoff
- Webhook Manager MVP wired for Slack, Stripe, Typeform, Zendesk, GitHub
- Contract tests, mock servers, golden fixtures for Batch 1 actions

Milestone Checklist *(updated for the production foundations now in place)*

- [x] GenericExecutor interfaces/spec committed – see `server/integrations/GenericExecutor.ts` for the shared auth, pagination, and retry stack now powering non-bespoke connectors.
- [x] IntegrationManager: generic path implemented behind feature flag – the `GENERIC_EXECUTOR_ENABLED` switch in `server/integrations/IntegrationManager.ts` wires JSON-defined operations without bespoke routing.
- [x] OAuth flows: Slack, HubSpot, Zendesk, Google (Drive/Calendar) – all providers are configured in `server/oauth/OAuthManager.ts` with redirect URIs, scopes, and token exchange endpoints.
- [x] API key flows: Stripe, Twilio, Mailgun, Typeform, Pipedrive, Trello, Dropbox – credential validation and encryption now run through `ConnectionService` with concrete clients enforcing headers/secrets.
- [x] Test Connection implemented per connector – bespoke clients (for example Salesforce, Slack, QuickBooks, Dynamics 365) expose real `testConnection` methods and the Generic Executor delivers safe fallbacks when no bespoke probe exists.
- [x] 6–10 actions per connector – the Batch 1 catalogue (Slack, Salesforce, QuickBooks, HubSpot, etc.) now maps catalog IDs onto registered handler methods via `registerAliasHandlers` so each connector exposes the planned surface area.
- [x] 1 polling trigger per connector – trigger handlers ship with each Batch 1 connector (for example Slack message polling, Salesforce query loops, PagerDuty incident feeds) and leverage the shared pagination helpers.
- [x] Webhooks for webhook-capable subset (Slack, Stripe, Typeform, Zendesk, GitHub) – webhook registration/verification flows live in `docs/webhooks-*.md` and the corresponding clients, and are orchestrated through `server/routes.ts`.
- [x] CI contract tests passing (mocks) – new unit suites (`server/integrations/__tests__/BaseAPIClient.helpers.test.ts`, `IntegrationManager.test.ts`) validate handlers, retries, and credential wiring.

Work Breakdown

1) Generic Executor
- [x] Auth injectors: oauth2 (bearer), api_key (header/query), basic
- [x] Request builder: baseUrl + path templates, method, headers, body
- [x] Pagination helpers: cursor/offset/page
- [x] Error mapping: HTTP → normalized error codes

2) IntegrationManager routing
- [x] Feature flag: `GENERIC_EXECUTOR_ENABLED`
  - Enable by setting `GENERIC_EXECUTOR_ENABLED=true` in `.env` to allow fallback execution for non-bespoke connectors.
- [x] Fallback: bespoke client → generic executor

3) Auth
- [x] Provider templates: Slack, HubSpot, Zendesk, Google
- [x] Token storage, refresh, rotation

4) Triggers
- [x] Polling runner v1, schedule registry
- [x] Webhook registration + verification flows (Slack signing secret, Stripe sig, GitHub HMAC, Typeform secret, Zendesk retry)

5) Testing & Observability
- [x] Contract tests per connector
- [x] Mock servers + golden fixtures
- [x] Metrics, logs, redaction

Risks

- OAuth app reviews/time (Slack, HubSpot, Zendesk, Google)
- Rate limits (HubSpot/Salesforce-TBD), backoff strategy correctness
- Webhook security correctness (signature, timing window, idempotency)
