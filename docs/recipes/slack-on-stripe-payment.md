# Recipe: Send Slack Message When Stripe Payment Succeeds

Prereqs

- Set `GENERIC_EXECUTOR_ENABLED=true` in `.env` and restart.
- Slack bot access token stored (via OAuth or direct) or ready in hand.
- Stripe secret key available and a Stripe webhook signing secret.

Step 1 — Register local webhook

- POST `/api/webhooks/register/stripe` (auth required)
- Body:
  `{ "workflowId": "wf-stripe-slack", "triggerId": "payment_succeeded", "secret": "whsec_..." }`
- Response includes `providerUrl` like `/api/webhooks/stripe/<id>` and guidance.

Step 2 — Configure Stripe

- In Stripe Dashboard → Developers → Webhooks
- Add endpoint using the `providerUrl` from step 1
- Select event `payment_intent.succeeded`
- Copy signing secret into the same value you used in step 1 (`secret`).

Step 3 — Handle event → Slack message

- Use your workflow engine runner to call Slack via the execute API.
- Example cURL (replace `<xoxb>` and channel ID):

```
curl -X POST http://localhost:5000/api/integrations/execute \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <your-jwt>' \
  -d '{
    "appName":"slack",
    "functionId":"send_message",
    "parameters": {
      "channel":"C123",
      "text":"✅ Payment succeeded: ${{amount}} for customer ${{customer_email}}"
    },
    "credentials": { "accessToken": "xoxb-..." }
  }'
```

Mapping notes

- In your runtime, parse the Stripe event payload: `data.object.amount_received`, `charges.data[0].billing_details.email`, etc.
- Format amounts from cents to currency units as needed.

Tips

- To aggregate charges, use `/api/integrations/execute-paginated` for listing, if needed.
- For per-tenant Slack tokens, pass `connectionId` instead of raw credentials in the body.
