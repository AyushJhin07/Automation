# Phase 1 Usage — Generic Executor

Enable generic execution

- In `.env`, set `GENERIC_EXECUTOR_ENABLED=true` and restart the server.

Test connection (generic)

- POST `/api/integrations/test`
- Body: `{ "appName": "slack", "credentials": { "accessToken": "xoxb-..." } }`

Execute action (generic)

- POST `/api/integrations/execute`
- Body example (Slack send_message):
  `{ "appName":"slack", "functionId":"send_message", "parameters": { "channel":"C123", "text":"Hello" }, "credentials": { "accessToken":"xoxb-..." } }`

Example cURL (Slack send_message)

```
curl -X POST http://localhost:5000/api/integrations/execute \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <your-jwt>' \
  -d '{
    "appName":"slack",
    "functionId":"send_message",
    "parameters": { "channel":"C123", "text":"Hello from GenericExecutor" },
    "credentials": { "accessToken":"xoxb-..." }
  }'
```

Example cURL (HubSpot search_contacts, paginated)

```
curl -X POST http://localhost:5000/api/integrations/execute-paginated \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <your-jwt>' \
  -d '{
    "appName":"hubspot",
    "functionId":"search_contacts",
    "parameters": { "limit": 100, "query": "example" },
    "credentials": { "accessToken":"<hubspot-token>" },
    "maxPages": 3
  }'
```

Notes

- Parameters are sent as JSON body for POST/PUT/PATCH and as query for GET/DELETE.
- Path params like `:id` or `{id}` are supported.
- Auth injectors supported: `oauth2` (Bearer), `api_key` (header/query with optional prefix), `basic`.
- The UI still filters to bespoke-implemented connectors. Use the generic endpoints above to try additional connectors before marking them Stable in UI.

Pagination

- POST `/api/integrations/execute-paginated`
- Body: same as execute, plus optional `maxPages` (default 5)
- Returns `{ items: [...], meta, pages }` with items aggregated across pages when `meta.next`, `meta.next_cursor`, or vendor `has_more` is present.

Execute-list (standardized items)

- POST `/api/integrations/execute-list`
- Body: same as execute; optional `maxPages`
- Returns `{ items, meta }` always, with vendor-specific list unpacked.
