# Recipe: Create HubSpot Contact From Typeform Submission

Prereqs

- Set `GENERIC_EXECUTOR_ENABLED=true` in `.env` and restart.
- HubSpot OAuth connection stored for the user.
- Typeform personal token or OAuth stored.

Option A — Webhooks (preferred)

1) Register local webhook

- POST `/api/webhooks/register/typeform` with
  `{ "workflowId": "wf-typeform-hubspot", "triggerId": "form_response", "secret": "<optional>" }`
- Response includes `genericUrl` to configure in Typeform.

2) Configure Typeform webhook

- In Typeform form → Connect → Webhooks → Add new
- Use the `genericUrl` from step 1, set secret if used, and enable.

3) Handle event → Create contact in HubSpot

- Example cURL using the execute API (map from form_response answers):

```
curl -X POST http://localhost:5000/api/integrations/execute \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <your-jwt>' \
  -d '{
    "appName":"hubspot",
    "functionId":"create_contact",
    "parameters": {
      "email": "{{answers.email}}",
      "firstname": "{{answers.first_name}}",
      "lastname": "{{answers.last_name}}"
    },
    "provider": "hubspot"
  }'
```

Option B — Polling (quick start)

1) Register default polling trigger for Typeform responses

```
curl -X POST http://localhost:5000/api/triggers/polling/register-default/typeform \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <your-jwt>' \
  -d '{
    "workflowId": "wf-typeform-hubspot",
    "interval": 300,
    "parameters": { "uid": "<FORM_UID>", "completed": true }
  }'
```

2) On each poll result, call HubSpot create_contact similar to the webhook option.

Notes

- Use `/api/integrations/initialize` with `{ provider: "hubspot" }` to set up the integration using your stored connection.
- For production, prefer webhooks for low latency.
