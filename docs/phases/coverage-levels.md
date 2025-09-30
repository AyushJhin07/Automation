# Coverage Levels — Connector Definition of Done

Bronze (Core Actions)

- Auth: Test Connection works (OAuth/API key/basic)
- Actions: 6–10 high-value actions implemented
- Triggers: 1 polling trigger (where applicable)
- Errors: Standardized error mapping; rate limit handling (retry/backoff)
- Docs: Auth setup steps + 2 usage examples

Silver (Triggers + Webhooks)

- All Bronze criteria
- Triggers: 2+ triggers, including at least 1 webhook where the API supports it
- Webhooks: Signature verification, secret rotation, dedup/idempotency
- Observability: Basic metrics (success/fail, latency), request logging with redaction
- Multi-connection: Support multiple accounts per user/tenant

Gold (Production-grade Reliability)

- All Silver criteria
- Resilience: Circuit breaker, exponential backoff, jitter, DLQ for failed webhooks
- Quotas: Per-tenant rate limits and burst protection
- UX: Input schema metadata (enums, defaults), strong parameter validations
- Docs: End-to-end guide + 3–5 recipes, known limitations, troubleshooting

