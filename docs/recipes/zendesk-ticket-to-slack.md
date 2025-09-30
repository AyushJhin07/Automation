# Recipe: Zendesk Ticket → Slack Notification

Prereqs

- Zendesk API credentials stored (subdomain + API key or OAuth).
- Slack bot token connection stored.
- `GENERIC_EXECUTOR_ENABLED=true` in `.env`.

Option A — Polling

1) Register default Zendesk polling trigger

```
curl -X POST http://localhost:5000/api/triggers/polling/register-default/zendesk \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <your-jwt>' \
  -d '{
    "workflowId": "wf-zendesk-slack",
    "interval": 300
  }'
```

2) Post new/updated tickets to Slack

```
curl -X POST http://localhost:5000/api/integrations/execute \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <your-jwt>' \
  -d '{
    "appName":"slack",
    "functionId":"send_message",
    "parameters": {
      "channel":"C123",
      "text":"🎫 Ticket {{ticket.id}}: {{ticket.subject}} ({{ticket.status}})"
    },
    "provider": "slack"
  }'
```

Option B — Webhook

- Use POST `/api/webhooks/register/zendesk` for a local endpoint and configure Zendesk target/webhook manually.
