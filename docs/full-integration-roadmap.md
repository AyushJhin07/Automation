# Full Integration Roadmap

This roadmap details the phased approach for wiring every catalog connector end-to-end, expanding on the current implementation that supports only Airtable, Gmail, Notion, Shopify, Slack, Sheets, and Time.

## Phase 0 – Platform Hardening
- Derive the supported-app manifest directly from `ConnectorRegistry.getAllConnectors`, replacing the hand-maintained list in `server/integrations/supportedApps.ts`.
- Refactor `IntegrationManager.createAPIClient` to rely on the manifest for connector construction, while preserving bespoke logic for Sheets and Time.
- Replace `GenericAPIClient` with an error-throwing placeholder so unimplemented connectors cannot silently succeed.
- Publish engineering guidelines covering authentication flows, pagination, and error formatting to standardize new clients.

## Phase 1 – Communications & Marketing
- Implement typed API clients for messaging, conferencing, and marketing tools (Twilio, SendGrid, Mailgun, Mailchimp, Zoom, Teams, RingCentral, Webex, etc.).
- Register the new constructors inside the manifest introduced in Phase 0 to avoid growing switch statements.
- Map workflow action IDs to the corresponding client methods through `IntegrationManager.executeFunctionOnClient`.
- Add integration tests that inject credentials and assert representative actions succeed using mocked HTTP responses.

## Phase 2 – CRM & Sales Automation
- Rebuild CRM clients (Salesforce, HubSpot, Pipedrive, Zoho CRM, Dynamics 365) with correct base URLs, OAuth/token refresh support, and typed request helpers.
- Implement adapters that translate workflow function IDs into client method calls for contact, deal, and search operations.
- Add contract tests that validate mock contact/deal lifecycles and propagate API failures correctly.

## Phase 3 – Collaboration & Project Tools
- Deliver REST clients for Asana, Trello, ClickUp, Monday, enhanced Notion, and related collaboration apps, covering task CRUD, board/list management, and comments.
- Extend the workflow dispatcher so IDs like `asana.create_task` resolve to the new client methods with proper parameter normalization.
- Create regression workflows that execute representative tasks end-to-end and validate payload mappings.

## Phase 4 – File Storage & Productivity
- Build clients for Dropbox, Box, Google Drive, OneDrive, SharePoint, DocuSign, Google Docs/Slides, and accounting suites (QuickBooks, Xero, Netsuite).
- Wire document-generation connectors to shared templating helpers so workflows can author and update files.
- Provide sandbox-backed tests that mock file metadata, large payload handling, pagination, and permission errors.

## Phase 5 – Developer & DevOps Ecosystem
- Implement authenticated clients for GitHub, GitLab, Bitbucket, Jenkins, CircleCI, Kubernetes, Terraform Cloud, and related DevOps tools.
- Integrate webhook registration flows for platforms that support push triggers via the shared webhook manager.
- Add automated tests validating repository actions and pipeline triggers using recorded fixtures.

## Phase 6 – Finance, HR, & Scheduling
- Deliver connectors for Brex, Expensify, Netsuite, ADP, Workday, BambooHR, Greenhouse, Calendly, SuccessFactors, etc., with robust pagination and rate-limit handling.
- Define workflow nodes for expense submission, payroll updates, and interview scheduling with normalized schemas.
- Write scenario tests covering approval flows, idempotency, and compliance-focused error handling.

## Phase 7 – Analytics, Identity, & Remaining Catalog
- Implement query-execution clients for BigQuery, Snowflake, Datadog, New Relic, Sentry, Tableau, PowerBI, and similar analytics platforms with streaming/polling support.
- Complete monitoring and identity connectors (Okta) with trigger adapters that normalize webhook payloads.
- Audit the manifest for gaps, update documentation/UI badges, and add smoke tests that iterate through every implemented connector to verify connection testing and at least one action per connector.

## Ongoing Governance
- Track connector readiness via a shared checklist (manifest entry, client implementation, tests, docs).
- Schedule periodic audits ensuring the manifest and documentation stay in sync as the catalog evolves.
- Use feature flags to roll out new connectors progressively and gather user feedback before general availability.
