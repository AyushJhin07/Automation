# Apps Script Rollout Spec

## Purpose
The Apps Script Rollout program aligns connector teams around a unified definition of done (DoD) and a measurable path to feature parity with first-party integrations. This document records the program goals, success metrics, and the connector-level checklists that teams must complete before declaring a connector ready for general availability (GA).

## Program Objectives
- **Parity target:** Achieve at least 95% feature parity (measured by functional parity score) between Apps Script connectors and the corresponding first-party connectors.
- **Connector coverage:** Graduate a minimum of 12 prioritized connectors to GA by the end of Q4.
- **Quality gate compliance:** Maintain a <2% regression rate during the rollout by enforcing the checklist items below.

### Key Performance Indicators (KPIs)
| Metric | Definition | Target | Source |
| --- | --- | --- | --- |
| Functional Parity Score | Percentage of core user flows supported relative to the first-party connector | ≥95% | [Prioritization Report](prioritization.md#feature-parity-scores)
| Rollout Velocity | Number of connectors graduated per month | ≥3 | [Apps Script Tracker](tracker.md#rollout-status)
| Regression Rate | Percentage of graduated connectors requiring hotfixes within 30 days | ≤2% | [Regression Harness](../operations/testing-harness.md)
| Support Ticket Volume | Number of Apps Script-related tickets per connector per month | ≤5 | [Customer Support Dashboard](../operations/support-workflows.md)

> **Note:** When a source link targets another doc that describes operational tooling, consult the linked system or dashboard for the live data.

## Connector Graduation Criteria
A connector may graduate from beta to GA when it meets the following criteria:
1. **DoD Checklist complete:** All required checklist items in the table below are marked "Done" and verified in the PR review template.
2. **KPI compliance:** The connector maintains or exceeds the KPI targets for at least one full reporting cycle.
3. **Launch review sign-off:** The Apps Script rollout lead and the connector team’s engineering manager sign the launch approval section in the tracker.
4. **Documentation published:** User-facing docs, changelog entries, and internal runbooks are published and accessible from the connector catalog entry.

## Definition of Done Checklists
Each connector is expected to complete the following tasks before GA. Teams should track progress in the [Apps Script Tracker](tracker.md) and include evidence links in the tracker row.

### Core Functionality
- [ ] **API coverage validated** – Confirm that all prioritized endpoints pass automated tests in the [Regression Harness](../operations/testing-harness.md).
- [ ] **Authentication flow parity** – Verify OAuth/credential flows align with the [Credential Patterns guide](credentials.md).
- [ ] **Triggers and schedules** – Ensure time-driven and event-driven triggers satisfy documented business rules.
- [ ] **Error handling** – Demonstrate that retryable and non-retryable errors follow the [Monitoring playbook](monitoring.md) and the [Handler Authoring Guide](handler-authoring.md).

### Quality & Testing
- [ ] **Snapshot tests updated** – Refresh snapshots and diffs using the [Snapshot Testing guide](snapshot-testing.md).
- [ ] **Manual QA script executed** – Record results in the [QA Template](templates.md#qa-log-template).
- [ ] **Load testing** – Run 2× expected peak load via the regression harness and capture metrics in the tracker.
- [ ] **Accessibility review** – Confirm Apps Script dialogs satisfy the internal accessibility checklist.

### Security & Compliance
- [ ] **Least-privilege scopes** – Validate scopes against the [OAuth verified scopes](../oauth-verified-scopes.md) inventory.
- [ ] **Secrets rotation** – Rotate and document secrets according to the [Encryption rotation runbook](../operations/encryption-rotation-runbook.md).
- [ ] **Logging review** – Ensure sensitive data is redacted per the [Data Handling policy](../operations/data-handling.md).

### Documentation & Support
- [ ] **Catalog entry updated** – Submit updates to the [App Catalog](../app-catalog.md) with connector-specific FAQs.
- [ ] **Runbook completed** – Publish escalation and rollback steps in the [Troubleshooting Playbook](../troubleshooting-playbook.md).
- [ ] **Customer enablement** – Record training session and share deck in the tracker row.
- [ ] **Support handoff** – Conduct walkthrough with support leads and capture notes in the [Support Workflows doc](../operations/support-workflows.md).

## Tooling References
- **Prioritization Report:** [`docs/apps-script-rollout/prioritization.md`](prioritization.md)
- **Rollout Tracker:** [`docs/apps-script-rollout/tracker.md`](tracker.md)
- **Handler Authoring Guide:** [`docs/apps-script-rollout/handler-authoring.md`](handler-authoring.md)
- **Regression Harness:** [`docs/operations/testing-harness.md`](../operations/testing-harness.md)

## Operational Cadence
- **Weekly sync:** Review KPI dashboards and unblock checklist items.
- **Bi-weekly prioritization review:** Re-score backlog connectors using the prioritization report data.
- **Monthly release board:** Validate connectors ready for GA and file launch approvals in the tracker.

## Change Control & Communication
- Update this spec when program-level goals or KPIs change.
- Announce updates in the #apps-script-rollout Slack channel and reference the change log in the tracker.
- For major updates, publish a summary to Confluence and link back to this spec.

## Confluence Publication
When Confluence is available, create or update the "Apps Script Rollout Program" page with:
- A copy of the Objectives, KPIs, and DoD sections above.
- Links back to the prioritization report, tracker, and regression harness.
- A pointer to the PR review checklist template (see below).

Record the Confluence URL in the tracker’s "Spec Link" column for each connector.
