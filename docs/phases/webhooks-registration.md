# Webhook Registration API (Guidance + Local Trigger)

Endpoint

- POST `/api/webhooks/register/:provider` (auth required)

Body

- `workflowId` (string, required)
- `triggerId` (string, required) — your internal trigger identifier
- `secret` (string, optional) — used for signature verification
- `metadata` (object, optional) — provider-specific context (e.g., events)

Response

- `genericUrl` — `/api/webhooks/:webhookId`
- `providerUrl` — vendor-specific path if available (e.g., `/api/webhooks/stripe/:webhookId`)
- `guidance` — steps to configure the webhook in the provider
- `signatureHeader` — header name used by provider for signatures

Notes

- This endpoint registers the local trigger and returns the callback URL and setup steps. It does not call the vendor API to create the subscription.
- For Stripe, Typeform, GitHub, Slack, follow the returned guidance to complete setup in the vendor UI (or API).
