# Connector Expansion Execution Plan

This document converts the multi-wave rollout strategy into actionable work streams
so the team can begin executing every phase in parallel. Use it as the canonical
checklist that ties implementation work, QA, and rollout together.

## Phase 0 – Platform Readiness

### Objectives
- Detect placeholder API clients and missing handler registrations.
- Surface catalog drift (JSON definitions that fail to parse, or connectors marked
  stable without a registered implementation).
- Provide engineering teams with a single command that highlights the gaps.

### Action Items
- [x] Add `npm run audit:connectors` (backs the new `scripts/connector-audit.ts`).
- [x] Fix malformed JSON definitions flagged by the audit (`dropbox.json`,
  `github.json`, `google-calendar.json`, `google-drive.json`, `hubspot.json`,
  `stripe.json`, `trello.json`, `zendesk.json`).
- [x] Triage every connector listed under “Connectors Requiring Attention” in the
  audit output. Each entry includes actionable hints (missing API client file,
  placeholder endpoints, lack of handler registration, etc.). See
  `docs/connector-triage-report.md` for the wave-by-wave breakdown generated from
  the latest audit run.
- [x] Extend the audit script once gaps start closing (e.g., count registered
  handlers vs. catalog actions, verify `testConnection` returns an `APIResponse`).
  The script now parses API client source to compare catalog coverage, flag
  missing registrations, and report aggregate issue counts.

## Phase 1 – Foundation Improvements

Parallel Work Streams:

1. **Client SDK Enhancements**
   - [x] Implement shared pagination, retries, and schema helpers inside
     `BaseAPIClient` (see the new `withRetries`, `collectCursorPaginated`, and
     `validatePayload` utilities).
   - [x] Add a helper for handler aliases so catalog action IDs can map directly
     to existing method names via `registerAliasHandlers`.

2. **Testing Scaffolding**
   - [x] Expand `IntegrationManager` unit tests to assert every registered
     connector (including Salesforce) appears in `IMPLEMENTED_CONNECTOR_IDS`.
   - [x] Introduce connector-specific mock tests that cover success, failure,
     pagination, retries, and schema validation for the shared helpers
     (`server/integrations/__tests__/BaseAPIClient.helpers.test.ts`).

3. **Operational Tooling**
   - [x] Build a staging smoke-test runner that invokes `testConnection` and at
     least one action per connector. The new `npm run smoke:connectors` command
     reads credentials from `configs/connector-smoke.config.json` (see the
     `.example` template) and prints pass/fail/skip status for every registered
     connector.

## Phase 2 – Implementation Waves

Execution teams can run these waves concurrently. Each wave should track
progress in the audit report until all connectors in the wave exit the
“requiring attention” list.

Use `npm run report:connector-phases` for a quick status rollup that matches the
checklist below and highlights which connectors in each wave still need to be
promoted from experimental to stable.

### Wave A – CRM & Revenue (5 connectors)
- [x] **Salesforce** – Registered as a stable connector with handler aliases mapping catalog IDs to concrete methods; remaining work focuses on smoke validation.
- [x] **QuickBooks** – Stable connector already registered in production; continue regression coverage.
- [x] **Microsoft Dynamics 365** – Dataverse client now issues real REST calls, registers catalog handlers, and is wired as a stable connector in the registry.
- [ ] **Xero** – Implement OAuth and REST calls, wire handlers, and register the connector.
- [ ] **NetSuite** – Implement SuiteQL/REST endpoints, add handlers, and register the integration.

### Wave B – HR & People Operations (6 connectors)
- [x] **BambooHR** – Stable connector with real REST implementation; maintain regression coverage.
- [ ] **Workday** – Implement tenant-aware base URLs and authentication flows.
- [ ] **ADP Workforce Now** – Build OAuth client-credentials flow and wire worker/payroll endpoints.
- [ ] **SAP SuccessFactors** – Implement OData endpoints, add handlers, and register the connector.
- [ ] **Greenhouse** – Implement Harvest API calls, add handlers, and register.
- [ ] **Lever** – Implement REST endpoints, add handlers, and register.

### Wave C – E-signature & Document Automation (3 connectors)
- [x] **DocuSign** – OAuth, envelope lifecycle handlers, and downloads are wired; keep smoke coverage current.
- [x] **Adobe Acrobat Sign** – Agreement lifecycle handlers and downloads are implemented; keep smoke coverage current.
- [x] **HelloSign** – Signature request handlers, account lookups, and downloads are live; keep smoke coverage current.

### Wave D – Incident & On-call Operations (2 connectors)
- [x] **PagerDuty** – Stable connector with incident lifecycle and webhook support; continue regression coverage.
- [ ] **Opsgenie** – Implement alert/team endpoints, add handlers, and register.

### Wave E – Data & Analytics (4 connectors)
- [ ] **Databricks** – Implement PAT-authenticated REST calls, add handlers, and register.
- [ ] **Snowflake** – Implement key/token auth + SQL execution endpoints, then register.
- [ ] **Tableau** – Implement REST extract/report endpoints, add handlers, and register.
- [ ] **Power BI** – Implement Azure AD auth, dataset/report endpoints, and register.

## Phase 3 – QA, Documentation, and Launch

- Extend end-to-end tests to run one smoke action per connector.
- Update documentation/credential guides as connectors graduate to "stable".
- Instrument monitoring dashboards per connector to watch error rates and
  latency once the integrations ship.

## Parallel execution plan to close Phases 2 and 3

The remaining phases require consistent cross-team coordination so that
implementation, QA, and documentation all land together. The table below maps
each wave to the concrete exit criteria we need to hit before calling the phase
“done.” Use it as the shared scoreboard for weekly status reviews.

| Wave | Primary owners | Engineering exit criteria | QA/Documentation exit criteria |
| --- | --- | --- | --- |
| Wave A – CRM & Revenue | Connector squad A | Dynamics 365, Xero, and NetSuite clients compiled with real REST/SOAP calls, handlers registered, and smoke-tested using staged credentials. | Release notes drafted for each connector, customer setup guides reviewed, and smoke run evidence attached to rollout issue. |
| Wave B – HR & People Ops | Connector squad B | Workday, ADP, SuccessFactors, Greenhouse, and Lever clients implemented with pagination + retry helpers; `testConnection` succeeds and at least one action executes in staging. | QA records video walkthrough of core HR flows; docs updated with credential scopes and callback URLs. |
| Wave C – E-signature | Connector squad C | DocuSign, Acrobat Sign, and HelloSign connectors remain smoke-tested every release; backlogs focus on polish and monitoring. | QA maintains signature lifecycle evidence and keeps webhook instructions current. |
| Wave D – Incident Response | Connector squad D | Opsgenie client delivers alert lifecycle handlers, rate limit backoff, and passes smoke script. | Runbook updated with escalation webhook mapping; support checklist signed off. |
| Wave E – Data & Analytics | Connector squad E | Databricks, Snowflake, Tableau, and Power BI clients authenticate, run representative queries/jobs, and stream/paginate results. | Sample dashboards captured for docs; data retention expectations documented. |

### Weekly coordination cadence

1. **Monday** – Audit run (`npm run audit:connectors`) shared in the team channel
   with deltas from the previous week. Highlight connectors that crossed the
   finish line and any new blockers.
2. **Wednesday** – Joint engineering/QA review of the smoke runner output to
   confirm newly wired connectors execute in staging. Capture issues in the
   triage report.
3. **Friday** – Documentation/content sync to ensure credential guides,
   screenshots, and marketing copy are ready for the upcoming launches. Update
   the roadmap checkboxes accordingly.

### Definition of done per connector

- Catalog JSON availability flipped to `"stable"`.
- API client registered in `ConnectorRegistry.initializeAPIClients` and covered
  by unit tests invoking at least one action/trigger.
- `npm run smoke:connectors` shows green `testConnection` + one action using
  staging credentials.
- Docs include a connector-specific onboarding section with auth steps, rate
  limit expectations, and troubleshooting tips.
- Monitoring alert configured for 4xx/5xx spikes leveraging the shared metrics
  pipeline.

## Using the Audit Output to Drive Work

Run the audit script locally or in CI:

```bash
npm run audit:connectors
```

The command prints:

1. A summary of how many connectors are stable/experimental/disabled.
2. The count of fully wired implementations.
3. A sorted list of connectors that still need attention, along with heuristic
   warnings (missing API client, placeholder base URL, missing handler
   registration, etc.).

Teams can own subsets of the list and mark items complete once the audit stops
flagging issues for the targeted connector.

## Running connector smoke tests

Once credentials are available, populate `configs/connector-smoke.config.json`
using the provided `.example` template and run:

```bash
npm run smoke:connectors
```

The smoke runner will call `IntegrationManager.initializeIntegration` for every
registered connector, execute the configured actions/triggers, and print a
summary highlighting passed, failed, and skipped apps. Use the output to track
Phase 3 launch readiness as connectors transition from implementation to QA.

