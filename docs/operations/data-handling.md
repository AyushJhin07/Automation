# Data Handling Policy

The Apps Script rollout follows the platform-wide data handling guidelines to protect customer information across environments.

## PII handling
- Mask personally identifiable information (PII) in logs using the shared logger’s redaction helpers.
- Never export raw workflow payloads to analytics tools without explicit approval from the data governance committee.

## Storage requirements
- Store connector credentials in the managed secrets store. Local `.env` files must not contain production secrets.
- Persist cached data only in encrypted storage backends approved by security.

## Access controls
- Restrict access to regression harness artifacts to the rollout and support teams.
- Rotate elevated permissions after each incident response using the procedure in the encryption rotation runbook.

## Audit logging
- Ensure all customer-impacting changes reference a tracker entry and link the corresponding PR.
- Keep audit logs for a minimum of 180 days in the centralized logging system.
