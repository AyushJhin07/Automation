# Phase 0 — Audit, Prioritization, Hygiene

Checklist (maintained as we progress)

- [ ] Inventory connectors (count, categories, availability, enhanced/standard pairs)
- [ ] Generate machine-readable report (JSON) and human summary (Markdown)
- [ ] Define coverage levels (Bronze/Silver/Gold) with acceptance criteria
- [ ] PM confirms [Apps Script rollout kickoff checklist](../apps-script-rollout/kickoff-checklist.md) is complete before scheduling a new connector batch
- [x] Propose Batch 1 candidates (see production/reports/batch1-proposal.md)
- [x] Align UI labels for availability (Stable/Experimental/Coming Soon)
  - API now exposes `statusLabel`, `hasImplementation`, `availability`, `hasWebhooks`
- [ ] Identify auth types per connector (OAuth2/API key/Basic/None)
- [x] Map triggers: polling candidates vs webhook-capable (see webhook capability report)
- [ ] Risks and dependencies (rate limits, special auth, SDKs)

Definition of Done (Phase 0)

- Inventory reports exist under `production/reports/`
- Coverage level definitions committed under `docs/phases/`
- Shortlist for Batch 1 prepared and validated by product

Notes

- Implementation will be gated by IntegrationManager capabilities (bespoke clients vs generic executor).
- This doc serves as the living TODO; we will check items as they complete.

Artifacts

- Inventory: production/reports/connector-inventory.{json,md}
- Batch 1 Proposal: production/reports/batch1-proposal.{json,md}
- Webhook capability: production/reports/webhook-capability.{json,md}
