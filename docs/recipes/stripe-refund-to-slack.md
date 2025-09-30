# Recipe: Stripe Refund → Slack Notification

Prereqs

- Stripe secret key connection stored.
- Slack bot token connection stored.
- `GENERIC_EXECUTOR_ENABLED=true` in `.env`.

1) Register Stripe webhook (refund event)

- POST `/api/webhooks/register/stripe` (auth required) with `{ "workflowId": "wf-stripe-refund", "triggerId": "charge_refunded", "secret": "whsec_..." }`
- Configure in Stripe Dashboard: `charge.refunded` event.

2) On refund event, post to Slack

```
curl -X POST http://localhost:5000/api/integrations/execute \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <your-jwt>' \
  -d '{
    "appName":"slack",
    "functionId":"send_message",
    "parameters": {
      "channel":"C123",
      "text":"↩️ Refund processed: ${{amount_refunded/100}} for {{charges.data[0].billing_details.email}}"
    },
    "provider": "slack"
  }'
```
