# Recipe: Stripe Payment Succeeded → Slack Notification

1) Register local webhook for Stripe
- POST `/api/webhooks/register/stripe` with `{ "workflowId": "wf-stripe-succeeded", "triggerId": "payment_succeeded", "secret": "whsec_..." }`
- Configure Dashboard event `payment_intent.succeeded`.

2) Post to Slack on event
```
curl -X POST http://localhost:5000/api/integrations/execute \
  -H 'Content-Type: application/json' -H 'Authorization: Bearer <jwt>' \
  -d '{
    "appName":"slack",
    "functionId":"send_message",
    "parameters": { "channel":"C123", "text":"✅ Payment ${{data.object.amount_received/100}} by {{data.object.charges.data[0].billing_details.email}}" },
    "provider":"slack"
  }'
```
