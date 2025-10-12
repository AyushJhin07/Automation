# Apps Script Connector Prioritization

This utility assembles connector inventory details, adoption analytics, and go-to-market inputs into a single prioritization report for the Apps Script rollout.

## Overview

The script merges three layers of data:

1. **Inventory metadata** – sourced from `production/reports/connector-inventory.json` and `server/connector-manifest.json`.
2. **Analytics impact signals** – curated benchmarks exposed by `analytics/business-intelligence.ts`.
3. **Operational exports** – optional CRM, usage, and support CSVs that you can upload at runtime.

It produces:

- A scored ranking saved to `production/reports/apps-script-prioritization.csv`.
- A console summary grouped by Tier 0/1/2 with high-level metrics per connector.

## Running the script

Install dependencies (if you have not already), then execute:

```bash
npm run prioritize:apps-script -- \
  --crm ~/Downloads/crm-connectors.csv \
  --usage ~/Downloads/usage-metrics.csv \
  --support ~/Downloads/support-load.csv \
  --weight-usage 1.5 \
  --weight-revenue 1 \
  --weight-support 0.5
```

- `--crm`, `--usage`, and `--support` accept CSV exports. The files are copied into `analytics/inputs/` for traceability before processing.
- Weight flags let you emphasize usage, revenue, or support load when computing the composite score. All weights default to `1`.
- You can omit any of the CSV flags; the script will fall back to analytics benchmarks for missing connectors.

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
