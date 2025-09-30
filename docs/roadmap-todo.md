# Phase 1 Roadmap — Execution Tracker

Legend: [x] done, [~] in-progress, [ ] todo

Core

- [x] GenericExecutor: auth injectors, retries, pagination, vendor heuristics
- [x] IntegrationManager fallback via feature flag
- [x] Connection-aware initialize/execute (supports provider/connectionId)
- [x] Webhook registration guidance endpoint + Typeform subscribe helper
- [x] Default polling triggers (Typeform get_responses, Trello get_board, HubSpot search_contacts, Zendesk list_tickets)
- [~] OAuth setups: Slack, HubSpot, Zendesk, Google Drive/Calendar (flows wired; validate in env)
- [ ] Bronze coverage audit for Batch 1 (actions + triggers) and fill missing endpoints
- [ ] Webhook subscribe helpers for GitHub/Zendesk (programmatic)
- [ ] Standardized list response { items, meta } adapter layer for UI
- [ ] CI smoke tests for execute/test endpoints

Docs & Recipes

- [x] OAuth setup guide
- [x] Phase 1 usage (execute/paginated)
- [x] Recipe: Slack on Stripe payment success
- [x] Recipe: HubSpot contact from Typeform
- [x] Recipe: Trello board to Slack (polling)
- [ ] Recipe: GitHub issue to Slack (webhook)
- [ ] Recipe: Zendesk ticket → Slack

Telemetry & Admin

- [ ] Roadmap API endpoint with task status
- [ ] Inventory stats endpoint for connectors/implementations
