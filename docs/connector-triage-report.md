# Connector Triage Report

This report captures the latest `npm run audit:connectors` findings after
extending the audit script to inspect handler coverage and `testConnection`
implementations. Use it alongside `docs/connector-expansion-roadmap.md` to track
phase completion work.

## Inventory snapshot
- 44 connectors are currently marked stable, while 105 remain experimental.
- 44 connectors are fully wired with registered API clients.
- Aggregate issue counts across experimental connectors:
  - Missing API client file: 46
  - Not registered in `ConnectorRegistry.initializeAPIClients`: 59
  - Constructors still calling `super()` without configuration: 58
  - Placeholder base URLs detected: 15
  - Placeholder REST endpoints detected: 16
  - No handler registration detected: 58
  - Partial handler registration detected: 1
  - `testConnection` missing an explicit `APIResponse` return: 58
  - `params` used without definition: 7

### Stable connectors (fully wired)

`ConnectorRegistry.initializeAPIClients` currently registers the following 44
connectors, which the audit script recognises as fully wired:

```
adyen, airtable, bamboohr, bitbucket, box, calendly, confluence, dropbox,
dynamics365, freshdesk, github, gitlab, gmail, google-calendar, google-chat,
google-docs, google-drive, google-forms, google-slides, hubspot, intercom,
jira-service-management, mailchimp, mailgun, microsoft-teams, monday, notion,
onedrive, outlook, pagerduty, pipedrive, quickbooks, salesforce, sendgrid,
servicenow, sharepoint, shopify, slack, smartsheet, stripe, trello, twilio,
typeform, zendesk
```

## Phase 2 wave tracking
The tables below consolidate the audit gaps for each implementation wave defined
in the roadmap. “Handlers detected” refers to the count of catalog
actions/triggers that the audit located in `registerHandler(s)` calls.

### Wave A – CRM & Revenue
| Connector | Audit status | Handlers detected | Primary next step |
| --- | --- | --- | --- |
| QuickBooks | Stable connector already registered in the registry; no audit findings. | n/a (stable) | Continue functional testing as part of regression suite. |
| Salesforce | API client promoted to stable; handler aliases now cover every catalog action. | 6/6 | Add automated smoke tests once staging credentials are provisioned. |
| Dynamics 365 | Stable client registered in the platform. Dataverse handlers now cover every catalog action/trigger. | 11/11 | Monitor smoke runs and capture staging evidence for rollout. |
| Xero | Placeholder client with `api.example.com` base URL and zero handlers. | 0/16 | Implement OAuth + REST calls, wire handlers, then register the client. |
| NetSuite | Placeholder client with empty constructor and no handlers. | 0/7 | Implement SuiteQL/REST endpoints, add handlers, and register the connector. |

### Wave B – HR & People Operations
| Connector | Audit status | Handlers detected | Primary next step |
| --- | --- | --- | --- |
| BambooHR | Stable connector already in production; no audit findings. | n/a (stable) | Keep in smoke tests and backfill docs as features expand. |
| Workday | Placeholder client without base URL configuration or handlers. | 0/17 | Build tenant-aware REST client, implement actions/triggers, then register. |
| ADP Workforce Now | Placeholder client lacking base URL configuration and handlers. | 0/7 | Implement OAuth, worker/payroll endpoints, and register the client. |
| SAP SuccessFactors | Placeholder client lacking base URL configuration and handlers. | 0/7 | Implement OData endpoints, add handlers, and register. |
| Greenhouse | Placeholder client lacking base URL configuration and handlers. | 0/7 | Implement Harvest API calls, add handlers, and register. |
| Lever | Placeholder client lacking base URL configuration and handlers. | 0/18 | Implement REST endpoints, add handlers, and register. |

### Wave C – E-signature & Document Automation
| Connector | Audit status | Handlers detected | Primary next step |
| --- | --- | --- | --- |
| DocuSign | Placeholder client lacking configuration and handlers. | 0/12 | Implement OAuth + envelope lifecycle endpoints, then register. |
| Adobe Acrobat Sign | Placeholder client lacking configuration and handlers. | 0/7 | Implement OAuth + agreement lifecycle endpoints, then register. |
| HelloSign | Placeholder client lacking configuration and handlers. | 0/8 | Implement authentication, signature requests, and register. |

### Wave D – Incident & On-call Operations
| Connector | Audit status | Handlers detected | Primary next step |
| --- | --- | --- | --- |
| PagerDuty | Stable connector already registered; no audit findings. | n/a (stable) | Maintain regression coverage and webhook validation. |
| Opsgenie | Placeholder client with `api.example.com` base URL and no handlers. | 0/11 | Implement alert/team endpoints, add handlers, and register. |

### Wave E – Data & Analytics
| Connector | Audit status | Handlers detected | Primary next step |
| --- | --- | --- | --- |
| Databricks | Placeholder client with `api.example.com` base URL and no handlers. | 0/12 | Implement PAT-authenticated REST calls, add handlers, and register. |
| Snowflake | Placeholder client lacking handlers. | 0/11 | Implement key/token auth + SQL execution endpoints, then register. |
| Tableau | Placeholder client with `api.example.com` base URL and no handlers. | 0/16 | Implement REST extract/report endpoints, add handlers, and register. |
| Power BI | Placeholder client lacking handlers and referencing undefined `params`. | 0/19 | Implement Azure AD auth, dataset/report endpoints, and register. |

## Phase 3 readiness checklist
- Expand smoke tests so every stable connector exercises at least one action per
  release.
- Backfill public documentation with credential setup guides as each wave ships.
- Configure monitoring dashboards to track error rates and rate-limit responses
  for all newly registered connectors.
- Automate connection and action verification via `npm run smoke:connectors`
  before promoting connectors from experimental to stable.

## Priority backlog to unlock 20 new fully wired connectors

To finish the “20 additional connectors” goal in one coordinated push, focus on
the following backlog slices. Each bullet references the audit findings above
and the remediation required to move the connector to the stable column.

1. **High-confidence quick wins** – Dynamics 365, Xero, NetSuite, Workday, ADP,
   SuccessFactors, Greenhouse, Lever. These already have catalog coverage and
   thin client stubs; the work is wiring real endpoints, adding handler
   registration, and registering them in the registry.
2. **Shared OAuth foundations** – DocuSign, Acrobat Sign, HelloSign, Databricks,
   Snowflake. Implement the standardized OAuth/token helpers once and fan them
   into each client to reduce bespoke code.
3. **Incident & analytics expansion** – Opsgenie, Tableau, Power BI. Translate
   catalog actions into REST calls with pagination/rate-limit helpers.
4. **Stretch connectors** – Braze, BigCommerce, Webex, Workfront. These have
   placeholder implementations but require additional scoping; schedule them for
   the second iteration after the first 15 connectors ship.

### Tracking template per connector

For each connector in the priority list, capture the following data in the
shared rollout spreadsheet or project board:

- Engineering owner and reviewer.
- Current audit status (snapshot + link to findings).
- Remaining implementation tasks (auth, handlers, registry registration,
  testing).
- QA sign-off status, including smoke run log links.
- Documentation checkmark with PR/commit references.

Updating the sheet weekly ensures leadership has a single view of where the
phase stands and what remains before the “20 new connectors” milestone is hit.
