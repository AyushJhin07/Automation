# Phase Completion Playbook

This playbook distills the roadmap into actionable checklists for closing out the
remaining phases of the connector expansion effort. Use it alongside the audit
output to manage daily execution.

## Phase 2 – Implementation execution

1. **Connector readiness gates**
   - ✅ Catalog JSON reviewed for accuracy and required scopes.
   - ✅ API client implements authentication helpers (`getAuthHeaders`,
     `testConnection`).
   - ✅ All catalog actions/triggers registered via `registerHandlers` or
     `registerAliasHandlers`.
   - ✅ Unit tests cover success and error paths for each handler, using the mock
     HTTP helpers in `BaseAPIClient`.
2. **Environment validation**
   - Create staging credentials and add them to
     `configs/connector-smoke.config.json` (copy from the `.example` template).
   - Run `npm run smoke:connectors` and record the output in the rollout ticket.
   - File bugs in the triage report for any failing action so they can be
     resolved before QA hand-off.
3. **Registry promotion**
   - Register the API client in `ConnectorRegistry.initializeAPIClients`.
   - Flip the connector JSON `availability` to `"stable"` once smoke tests pass.
   - Add the connector ID to `IntegrationManager` tests if not already covered.

## Phase 3 – QA, documentation, and launch

1. **QA certification**
   - QA re-runs the smoke suite with their own credentials, capturing logs and
     screenshots.
   - Regression cases added to the nightly build matrix.
   - Webhook callbacks verified (where applicable) using staging delivery
     endpoints.
2. **Documentation readiness**
   - Publish setup guides covering authentication, permission scopes, and rate
     limits.
   - Update the public app catalog to show the connector as “Stable.”
   - Add troubleshooting entries for the top three expected error codes.
3. **Operational hand-off**
   - Create monitoring alerts for elevated 4xx/5xx responses and auth failures.
   - Schedule a post-launch health review one week after enabling the connector
     for customers.
   - Archive rollout artifacts (audit snapshot, smoke logs, QA sign-off) in the
     team knowledge base.

## Execution RACI (Responsible, Accountable, Consulted, Informed)

| Area | Responsible | Accountable | Consulted | Informed |
| --- | --- | --- | --- | --- |
| Connector implementation | Connector squad leads | Head of Engineering | Solution architects | Support, Product Marketing |
| QA & smoke validation | QA lead | Head of QA | Connector squads | Support |
| Documentation & launch | Technical writer | Product Marketing | Connector squads, Support | Executive team |

Maintain the RACI table in the project tracker so that ownership stays clear as
connectors move from implementation to launch.
