# Apps Script Rollout Tracker

This tracker centralises the readiness state for each Apps Script connector
batch. Update the boolean columns as PMs complete the kickoff checklist items
outlined in [kickoff-checklist.md](./kickoff-checklist.md).

| Wave | Connector | Sandbox Access | Credentials Provisioned | Script Properties Standard | Security Approved | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Batch 1 | hubspot-enhanced | false | false | false | false | |
| Batch 1 | trello | false | false | false | false | |
| Batch 1 | twilio | false | false | false | false | |
| Batch 1 | jira | false | false | false | false | |
| Batch 1 | kustomer | false | false | false | false | |
| Batch 1 | mailgun | false | false | false | false | |
| Batch 1 | stripe | false | false | false | false | |
| Batch 1 | slack | false | false | false | false | |
| Batch 1 | asana-enhanced | false | false | false | false | |
| Batch 1 | zendesk | false | false | false | false | |
| Batch 1 | github-enhanced | false | false | false | false | |
| Batch 1 | pipedrive | false | false | false | false | |
| Batch 1 | dropbox | false | false | false | false | |
| Batch 1 | salesforce | false | false | false | false | |
| Batch 1 | mailchimp | false | false | false | false | |
| Batch 1 | google-drive | false | false | false | false | |
| Batch 1 | google-calendar | false | false | false | false | |
| Batch 1 | typeform | false | false | false | false | |

- **Sandbox Access** – mark `true` when all delivery stakeholders can run Apps
  Script executions in the sandbox project.
- **Credentials Provisioned** – mark `true` when production/staging credentials
  exist and secret storage has the mappings documented.
- **Script Properties Standard** – mark `true` after property names and
  documentation follow the conventions from the kickoff checklist.
- **Security Approved** – mark `true` once the relevant approvals or tickets are
  linked in the tracker.

Use this tracker during weekly rollout syncs to unblock missing items before the
engineering hand-off.
