# Trello Webhooks

- Create webhook with `create_webhook` action in `connectors/trello/definition.json` via `/api/webhooks/subscribe` (provider=trello).
- Provide `idModel` (board or card id) and a callback URL.
- Trello sends callbacks without signature; include a verification token in the URL if desired and check it server-side.
