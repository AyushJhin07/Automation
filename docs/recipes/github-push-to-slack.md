# Recipe: GitHub Push → Slack Notification

1) Subscribe webhook on GitHub (repo level)
```
curl -X POST http://localhost:5000/api/webhooks/subscribe \
  -H 'Content-Type: application/json' -H 'Authorization: Bearer <jwt>' \
  -d '{
    "provider":"github",
    "workflowId":"wf-github-push",
    "triggerId":"push",
    "parameters": { "owner":"<owner>", "repo":"<repo>", "events":["push"] },
    "connectionId":"<GITHUB_CONNECTION_ID>"
  }'
```

2) On push event, post to Slack
```
curl -X POST http://localhost:5000/api/integrations/execute \
  -H 'Content-Type: application/json' -H 'Authorization: Bearer <jwt>' \
  -d '{
    "appName":"slack",
    "functionId":"send_message",
    "parameters": { "channel":"C123", "text":"🚀 Push to {{repository.full_name}}: {{head_commit.message}}" },
    "provider":"slack"
  }'
```
