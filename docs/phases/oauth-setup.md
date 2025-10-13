# OAuth Setup — Slack, HubSpot, Zendesk, Google

Base URL

- Set `BASE_URL` in `.env` to your server URL (e.g., http://localhost:5000).

Slack

- Create a Slack App → OAuth & Permissions
- Add scopes: `channels:read`, `chat:write`, `users:read`, `files:write` (adjust as needed)
- Set Redirect URL: `${BASE_URL}/api/oauth/callback/slack`
- Save client ID/secret into `.env`: `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`
- Start flow: `POST /api/oauth/authorize` with `{ provider: "slack" }` (authenticated)

HubSpot

- Create a Private App or OAuth App
- Set Redirect URL: `${BASE_URL}/api/oauth/callback/hubspot`
- Scopes required for Apps Script HubSpot actions:
  - `crm.objects.contacts.write` (and `crm.objects.contacts.read` for lookups)
  - `crm.objects.deals.write` and `crm.objects.deals.read`
  - `crm.objects.companies.write`
  - `crm.objects.tickets.write`
  - `crm.objects.notes.write`
- Save into `.env`: `HUBSPOT_CLIENT_ID`, `HUBSPOT_CLIENT_SECRET`
- Start flow: `POST /api/oauth/authorize` with `{ provider: "hubspot" }`
- OAuth Manager persists the OAuth access token as `HUBSPOT_ACCESS_TOKEN` for Apps Script deployments

Zendesk

- Create an OAuth client in your Zendesk subdomain
- Redirect URL: `${BASE_URL}/api/oauth/callback/zendesk`
- Save: `ZENDESK_CLIENT_ID`, `ZENDESK_CLIENT_SECRET` (+ you will need subdomain in credentials/params when executing)
- Start flow: `POST /api/oauth/authorize` `{ provider: "zendesk" }`

Google (Drive/Calendar)

- Create OAuth Client in Google Cloud Console
- Redirect URL example (Drive): `${BASE_URL}/api/oauth/callback/google-drive` (or per provider in OAuthManager)
- Save: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- Start flow: `POST /api/oauth/authorize` with provider id (e.g., `gmail`, `gmail-enhanced` present; Drive/Calendar variants if configured)

Notes

- After callback, tokens are persisted by OAuthManager. Use `/api/integrations/test` or `/api/integrations/initialize` with `connectionId` to validate.
