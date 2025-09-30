# Recipe: Trello Board Activity → Slack Notification (Polling)

Prereqs

- Set `GENERIC_EXECUTOR_ENABLED=true` in `.env` and restart.
- Store Slack connection (OAuth or bot token).
- Trello API key and token saved (connection or direct credentials).

1) Register default Trello polling trigger

```
curl -X POST http://localhost:5000/api/triggers/polling/register-default/trello \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <your-jwt>' \
  -d '{
    "workflowId": "wf-trello-slack",
    "interval": 300,
    "parameters": { "id": "<BOARD_ID>" },
    "connectionId": "<TRELLO_CONNECTION_ID>"
  }'
```

2) On each poll result, post a Slack message

```
curl -X POST http://localhost:5000/api/integrations/execute \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <your-jwt>' \
  -d '{
    "appName":"slack",
    "functionId":"send_message",
    "parameters": {
      "channel":"C123",
      "text":"📌 Trello board updated: {{board.name}}"
    },
    "provider": "slack"
  }'
```

Notes

- To reduce noise, filter Trello actions by date or type before posting.
- Prefer Trello webhooks for low latency when available.
