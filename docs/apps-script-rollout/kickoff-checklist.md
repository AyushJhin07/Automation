# Apps Script Rollout Kickoff Checklist

The kickoff checklist confirms that Apps Script launches begin with the required
access, credentials, configuration hygiene, and approvals. Product managers must
clear every item before engineering schedules a new connector batch.

## Checklist Summary

| Item | Owner | Status |
| --- | --- | --- |
| Sandbox access granted for the Apps Script execution project | PM / IT | ☐ |
| Production credentials requested or issued for the launch connectors | PM | ☐ |
| Script Properties follow the shared naming, scoping, and audit rules | PM / Eng | ☐ |
| Security approvals captured in the rollout record | PM / Security | ☐ |

Use the CLI helper to review the checklist from your terminal:

```bash
npm run apps-script:checklist
```

## Sandbox Access

- Confirm the Apps Script sandbox (clasp project or execution deployment) exists
  for the launch connectors.
- Validate that PMs, engineers, and QA accounts are on the allow list for the
  sandbox project and that they can execute dry runs.
- File access requests with IT/Sec for any missing stakeholders and wait for
  confirmation before scheduling the batch kickoff.
- Document the project ID and access approvers in the rollout tracker.

## Credential Provisioning

- Ensure OAuth clients or service accounts are provisioned for every connector
  in the upcoming batch. Capture credential IDs, redirect URIs, and owner teams
  in the tracker.
- Confirm secrets are stored in the shared secret manager (Vault, Secrets
  Manager, etc.) and mapped to environment variables for staging and production.
- Validate test accounts exist for QA and that scopes/permissions match the
  production request.

## Script Property Standards

- Prefix automation-specific Script Properties with `AUTOMATION_` to avoid
  collisions with historical scripts.
- Store IDs, tokens, and secrets in Script Properties only when they meet the
  encryption requirements documented in [`docs/operations/secret-management.md`](../operations/secret-management.md).
- Record a README entry for each property: name, purpose, owning team, and
  rotation cadence.
- Remove obsolete properties during rollout prep so migration scripts do not
  rehydrate stale configuration.

## Security Approvals

- Record a risk assessment or SOC checklist entry for the Apps Script launch in
  the security tracker, referencing scope, data flows, and contact owners.
- Confirm Data Protection and Security Engineering have acknowledged the launch
  window (email or ticket).
- Verify production monitoring (logging, alerts) is configured before rollout.
- Update the rollout tracker with the approval ticket links and review dates.
