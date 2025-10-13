# Troubleshooting Playbook

- 401/403 Unauthorized
  - Re-authenticate the connection (OAuth token expired or missing scopes).
- 429 Rate Limited
  - Backoff automatically applied; reduce request rate; use pagination.
- Validation errors
  - Parameter schema mismatch; check connector docs for required fields.
- Webhook signature invalid
  - Verify secret and header names per vendor; ensure raw body is used where required.
- No results from polling
  - Adjust interval; set `since` or vendor-specific after/updated filters.
- Vendor-specific tips
  - Slack: ensure bot is invited to the channel; check chat:write scope.
  - Stripe: use `starting_after` for pagination; keep keys out of source control.
  - Twilio: provision an SMS-capable **From** number in the console, verify it against your messaging geo permissions, and rotate it when swapping sandboxes to avoid 40013 errors.
  - HubSpot: use `after` for paging; ensure app has contacts scope.
  - Zendesk: subdomain must be provided; use /webhooks for programmatic endpoints.
  - GitHub: PAT or OAuth app with repo scope; set webhook secret.
  - Google: least-privilege scopes; rotate client secrets if exposed.
