# Apps Script Rollout Kickoff Checklist

Product managers must complete this checklist before scheduling a new Apps Script connector batch. Each task links to the owners responsible for validating the preconditions and records the status inside the rollout tracker.

## Sandbox Access

- [ ] **Confirm shared sandbox access is granted.** Ensure the Apps Script project and linked Google Workspace sandbox belong to the rollout squad and are accessible by engineering, QA, and security reviewers. Set `APPS_SCRIPT_SANDBOX_ACCESS=granted` in your environment (or the rollout tracker) once verified.
- [ ] **Validate sandbox isolation guardrails.** Confirm that the sandbox project uses dedicated test accounts, separate billing, and isolated data sources so regressions cannot impact production tenants. Record the isolation review notes in the rollout tracker and set `APPS_SCRIPT_SANDBOX_ISOLATION=verified` once complete.

## Credential Provisioning

- [ ] **Provision connector credentials.** Ensure OAuth clients, service accounts, or API keys used for connector smoke tests exist and are stored in the shared secret manager. Update the tracker once credentials are active and tagged for Apps Script usage, and export `APPS_SCRIPT_CREDENTIALS_PROVISIONED=true` for the CLI.
- [ ] **Document credential rotation process.** Capture how secrets will be rotated and which on-call role owns the process. Link the runbook in the tracker entry, confirm rotation cadence with the security team, and set `APPS_SCRIPT_CREDENTIAL_ROTATION=documented`.

## Script Property Standards

- [ ] **Apply standardized property prefixes.** All Script Properties must use the `apps_script__` prefix followed by the connector identifier (for example, `apps_script__slack__client_id`). Note any exceptions in the tracker, secure approval before proceeding, and mark `APPS_SCRIPT_PROPERTY_PREFIXED=true` once aligned.
- [ ] **Backfill required metadata properties.** Populate `apps_script__runtime`, `apps_script__version`, and `apps_script__last_validated_at` for every connector Script Property store. Attach proof (CLI output or screenshots) in the tracker row and export `APPS_SCRIPT_METADATA_BACKFILLED=true` after validation.

## Security Approvals

- [ ] **Complete security architecture review.** Share the integration design and data flow diagrams with security. Record the review date, approver, and follow-up actions in the tracker, then set `APPS_SCRIPT_SECURITY_REVIEWED=approved`.
- [ ] **Log privacy and compliance checks.** Confirm GDPR/CCPA impact assessments and data retention plans are documented. Upload links to the compliance artefacts in the tracker, note outstanding remediation tasks, and set `APPS_SCRIPT_COMPLIANCE_COMPLETE=true`.

Use `tsx scripts/print-apps-script-checklist.ts` to print this checklist with environment-based status hints.
