# Apps Script Connector Prioritization

This utility assembles connector inventory details, adoption analytics, and go-to-market inputs into a single prioritization report for the Apps Script rollout.

## Overview

The script merges two layers of data today:

1. **Inventory metadata** – sourced from `production/reports/connector-inventory.json` and `server/connector-manifest.json`.
2. **Analytics impact signals** – curated benchmarks exposed by `analytics/business-intelligence.ts`.

Support for uploading CRM, usage, and support CSV exports will return in a follow-up pass. For now the embedded analytics keep the prioritization ranking deterministic across environments.

It produces:

- A scored ranking saved to `production/reports/apps-script-prioritization.csv`.
- A console summary grouped by Tier 0/1/2 with high-level metrics per connector.
- `npm run update:apps-script-backlog` to translate the CSV into the customer-facing backlog table.

## Running the script

Install dependencies (if you have not already), then execute:

```bash
npm run prioritize:apps-script
```

## Expected CSV columns

The parser is flexible with headers, but the following columns are preferred:

| Export  | Required column       | Optional columns                             |
|---------|-----------------------|-----------------------------------------------|
| CRM     | `connector_id`        | `annual_recurring_revenue`, `pipeline_influence`, `expansion_opportunities` |
| Usage   | `connector_id`        | `monthly_executions`, `active_workflows`, `active_organizations`, `adoption_trend` |
| Support | `connector_id`        | `monthly_tickets`, `escalations`, `avg_resolution_hours` |

Alternate header aliases such as `revenue`, `pipeline`, `executions`, or `tickets` are also recognized.

## Output

The generated CSV contains one row per connector with the merged metrics, calculated scores, assigned tier, and source attribution. Review the console output for a human-readable digest of Tier 0/1/2 priorities plus ARR, usage, and support context.

Use the CSV to align Apps Script rollout sequencing, and update the CRM/usage/support exports to refresh the prioritization as new data arrives.

## Regenerating the runtime coverage CSV

Every rollout PR should refresh the Apps Script runtime coverage export so the tracker sheet stays accurate:

1. Run `npm run report:runtime -- --output production/reports/apps-script-runtime-coverage.csv` after applying the rollout changes locally. This writes the operation-level dataset plus per-connector summaries consumed by the tracker.
2. Commit the updated `production/reports/apps-script-runtime-coverage.csv` alongside the rollout PR so reviewers can confirm the diff.
3. Upload the CSV to the shared tracker sheet (replace the existing data on the runtime coverage tab) once the PR merges.

Regenerating the file every time keeps the rollout dashboard synchronized with the source of truth in the repository.
