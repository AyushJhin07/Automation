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

Milestone Checklist

- [x] GenericExecutor interfaces/spec committed
- [x] IntegrationManager: generic path implemented behind feature flag
- [ ] OAuth flows: Slack, HubSpot, Zendesk, Google (Drive/Calendar)
- [ ] API key flows: Stripe, Twilio, Mailgun, Typeform, Pipedrive, Trello, Dropbox
- [ ] Test Connection implemented per connector
- [ ] 6–10 actions per connector
- [ ] 1 polling trigger per connector
- [ ] Webhooks for webhook-capable subset (Slack, Stripe, Typeform, Zendesk, GitHub)
- [ ] CI contract tests passing (mocks)

Work Breakdown

1) Generic Executor
- [ ] Auth injectors: oauth2 (bearer), api_key (header/query), basic
- [ ] Request builder: baseUrl + path templates, method, headers, body
- [ ] Pagination helpers: cursor/offset/page
- [ ] Error mapping: HTTP → normalized error codes

2) IntegrationManager routing
- [ ] Feature flag: GENERIC_EXECUTOR_ENABLED
  - Enable by setting `GENERIC_EXECUTOR_ENABLED=true` in `.env` to allow fallback execution for non-bespoke connectors.
- [ ] Fallback: bespoke client → generic executor

3) Auth
- [ ] Provider templates: Slack, HubSpot, Zendesk, Google
- [ ] Token storage, refresh, rotation

4) Triggers
- [ ] Polling runner v1, schedule registry
- [ ] Webhook registration + verification flows (Slack signing secret, Stripe sig, GitHub HMAC, Typeform secret, Zendesk retry)

5) Testing & Observability
- [ ] Contract tests per connector
- [ ] Mock servers + golden fixtures
- [ ] Metrics, logs, redaction

Risks

- OAuth app reviews/time (Slack, HubSpot, Zendesk, Google)
- Rate limits (HubSpot/Salesforce-TBD), backoff strategy correctness
- Webhook security correctness (signature, timing window, idempotency)
