# OAuth Verified Scopes (Live)

This page will be updated as we validate flows in the live environment.

- Slack (bot)
  - Scopes: chat:write, channels:read, users:read, files:write
  - Callback: /api/oauth/callback/slack

- HubSpot
  - Scopes: contacts, content, reports, timeline (minimum for contacts)
  - Callback: /api/oauth/callback/hubspot

- Zendesk
  - Scopes: read, write (app-level)
  - Callback: /api/oauth/callback/zendesk

- Google Drive
  - Scopes: https://www.googleapis.com/auth/drive.file (least privilege)
  - Callback: /api/oauth/callback/google-drive

- Google Calendar
  - Scopes: https://www.googleapis.com/auth/calendar.events
  - Callback: /api/oauth/callback/google-calendar
