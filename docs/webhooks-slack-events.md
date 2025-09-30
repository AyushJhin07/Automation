# Slack Events Webhooks

- Enable Event Subscriptions in your Slack App.
- Request URL: use vendor-specific route `/api/webhooks/slack/:webhookId` from `/api/webhooks/register/slack` (or generic `/api/webhooks/:id`).
- Subscribe to events like `message.channels`, `reaction_added`.
- Verify signing secret with `X-Slack-Signature` and timestamp.
