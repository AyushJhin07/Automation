# Slack Events Webhooks

- Enable Event Subscriptions in your Slack App.
- Request URL: use vendor-specific route `/api/webhooks/slack/:webhookId` from `/api/webhooks/register/slack` (or generic `/api/webhooks/:id`).
- Subscribe to events like `message.channels`, `reaction_added`.
- Verify signing secret with `X-Slack-Signature` and timestamp.

## Local Testing Checklist

1. Start the dev stack (`npm run dev:stack`), or run API + worker + scheduler separately.
2. Expose the API with a tunnel such as ngrok:
   ```bash
   ngrok http 5000
   export SERVER_PUBLIC_URL=https://<random>.ngrok.io
   ```
3. Register and smoke-test a webhook locally:
   ```bash
   npm run dev:webhook
   ```
   The script calls `/api/webhooks/register`, prints the generated endpoint, and POSTs a sample payload so you can confirm a workflow run in `/api/executions`.
4. Configure your Slack App to deliver events to the printed `https://<random>.ngrok.io/api/webhooks/slack/<id>` URL.
5. Trigger an event in Slack; the execution worker dequeues the job and starts the associated workflow.
