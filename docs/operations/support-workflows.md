# Support Workflows for Apps Script Connectors

Support engineers use this playbook to triage and resolve Apps Script connector issues once the rollout graduates a connector to GA.

## Intake
- Create a Zendesk ticket with the connector ID, workspace, and workflow execution URL.
- Label the ticket `apps-script` and assign it to the "Automation Connectors" queue.

## Initial triage
1. Validate the issue using the regression harness logs attached to the ticket.
2. Review recent deployments in the rollout tracker to identify related changes.
3. If reproduction steps are unclear, request the QA log template from the connector team.

## Escalation paths
- **Blocking outages:** Page the on-call engineer via PagerDuty using the "Connector Rollout" service.
- **Credential issues:** Engage the security rotation team via `#security-secrets` Slack channel.
- **Apps Script quota limits:** Coordinate with the platform SRE team and capture the outcome in the tracker.

## Resolution & Closure
- Document root cause and fix summary in the ticket and in the tracker row.
- Link the final PR that resolved the issue.
- Notify customer success via `#apps-script-rollout` once the ticket is closed.
