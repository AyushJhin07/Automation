# Apps Script rollout team structure

This guide outlines who owns which parts of the Apps Script rollout so contributors know where to go for decisions, unblockers, and day-to-day collaboration. Share it with new joiners and link it when planning rollout work so expectations stay clear.

## Responsibilities by group

### Runtime platform team
- Owns Apps Script runtime readiness, including SDK changes and execution environment fixes needed for connector enablement.
- Reviews rollout designs for cross-connector impacts and enforces guardrails that keep platform behaviour consistent.
- Coordinates incident response for runtime regressions and leads postmortems that involve Apps Script execution.

### Connector squads
- Drive connector-specific implementation work, including endpoint coverage, request translation, and connector UX.
- Maintain the sequencing of backlog items and ensure connector nuances are reflected in rollout specs.
- Partner with runtime engineers to validate integration tests and ensure edge cases surface early.

### QA and automation
- Builds and maintains regression suites that verify Apps Script compatibility before and after launch.
- Triages failed runs, highlights gaps in test coverage, and pairs with squads to automate newly discovered scenarios.
- Signs off on readiness to proceed to deployment based on test evidence and outstanding bug burndown.

### Program management
- Facilitates planning cadences, syncs, and milestone reviews so dependencies stay visible.
- Tracks risk, status, and resourcing across squads; coordinates cross-team unblockers.
- Owns communication plans (release notes, stakeholder updates) and keeps the rollout tracker current.

## RACI matrix

| Activity | Runtime platform team | Connector squads | QA and automation | Program management |
| --- | --- | --- | --- | --- |
| Prioritization | Consulted | Consulted | Informed | Accountable / Responsible |
| Implementation | Consulted | Accountable / Responsible | Consulted | Informed |
| Testing | Consulted | Consulted | Accountable / Responsible | Informed |
| Deployment | Responsible | Consulted | Consulted | Accountable |
| Support | Accountable / Responsible | Consulted | Consulted | Informed |

## How to use this doc
- When a rollout task is blocked, escalate to the role listed as **Accountable / Responsible** for that activity.
- Mirror the ownership fields from the rollout tracker so issue triage is traceable to the right contact.
- Link this file from specs, backlog entries, and tooling README pages that expect coordination with Apps Script workstreams.
