# Apps Script Connector Review Checklist

Attach this template to rollout pull requests. Reviewers must confirm each item before approving the PR.

## Connector Readiness
- [ ] Functional parity score meets or exceeds 95%.
- [ ] Regression harness run attached (`pnpm run apps-script:harness --connector <id>`).
- [ ] Manual QA log uploaded using the [QA Log Template](templates.md#qa-log-template).
- [ ] KPI snapshot linked from the tracker entry.

## Quality & Testing
- [ ] Snapshot tests updated and committed.
- [ ] Accessibility review completed and notes attached.
- [ ] Load test artifacts attached or linked.
- [ ] Error handling verified against the [Monitoring playbook](monitoring.md).

## Security & Compliance
- [ ] OAuth scopes validated against the [verified scope inventory](../oauth-verified-scopes.md).
- [ ] Secrets rotation documented in the [encryption rotation runbook](../operations/encryption-rotation-runbook.md).
- [ ] Logging reviewed for PII per the [data handling policy](../operations/data-handling.md).

## Documentation & Support
- [ ] App catalog entry updated with rollout notes.
- [ ] Troubleshooting steps added to the [playbook](../troubleshooting-playbook.md).
- [ ] Support walkthrough completed and recorded in the [support workflows guide](../operations/support-workflows.md).
- [ ] Customer enablement assets linked (deck, recording).

## Approvals
- [ ] Apps Script rollout lead sign-off recorded in the tracker.
- [ ] Connector engineering manager approved the release plan.
- [ ] Support lead acknowledged readiness in `#apps-script-rollout`.
