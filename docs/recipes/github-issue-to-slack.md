# Recipe: GitHub Issue → Slack Notification (Webhook)

Prereqs

- OAuth or PAT stored for GitHub; Slack bot token connection stored.
- Set `GENERIC_EXECUTOR_ENABLED=true` in `.env` and restart.

1) Register local webhook and subscribe on GitHub

```
curl -X POST http://localhost:5000/api/webhooks/subscribe \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <your-jwt>' \
  -d '{
    "provider": "github",
    "workflowId": "wf-github-slack",
    "triggerId": "issue_opened",
    "secret": "<shared-secret>",
    "parameters": { "owner": "<owner>", "repo": "<repo>", "events": ["issues"] },
    "connectionId": "<GITHUB_CONNECTION_ID>"
  }'
```

2) On incoming GitHub issue event, post to Slack

```
curl -X POST http://localhost:5000/api/integrations/execute \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <your-jwt>' \
  -d '{
    "appName":"slack",
    "functionId":"send_message",
    "parameters": {
      "channel":"C123",
      "text":"🆕 Issue #{{number}} opened: {{issue.title}}"
    },
    "provider": "slack"
  }'
```

Notes

- GitHub sends `X-Hub-Signature-256` header; verification handled in WebhookManager.
- You can filter by labels or repository using workflow logic.
