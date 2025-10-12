# Apps Script rollout tracker

This folder captures the source of truth for Apps Script rollout planning. The tracker summarizes how many operations each connector exposes, how many already run on Apps Script, and the ownership metadata needed for coordination across squads.

## Files

- `tracker-template.csv` – header-only template that matches the columns used for the rollout tracker. Import this file into Google Sheets or Excel if you prefer working in a spreadsheet UI.
- `apps-script-tracker.csv` – generated export that is kept in git so CI can verify coverage against the connector manifest.

## Generating or refreshing the tracker

1. Make sure `production/reports/apps-script-runtime-coverage.csv` is up to date. The report should include the following columns (case-insensitive):
   - `connector_id` (or `connector`, `app`, etc.) – connector identifier.
   - `apps_script_status` (or any column containing `apps_script`) – indicates whether a given operation already runs on Apps Script. Values such as `done`, `beta`, `ready`, `implemented`, or `true` count as implemented; everything else counts as not implemented.
2. Run the initializer to populate `apps-script-tracker.csv`:

   ```bash
   npx tsx scripts/init-apps-script-tracker.ts
   ```

   Use `--output <path>` if you want to write the tracker to a different location.
3. Review the generated CSV and fill in the placeholders:
   - **owner** – DRI for the next Apps Script milestone on that connector.
   - **squad** – team that owns the workstream.
   - **runtime owner** – primary runtime engineer accountable for unblockers (see [team structure](team-structure.md)).
   - **connector squad owner** – feature squad point of contact for delivery decisions.
   - **QA automation owner** – lead responsible for validation and regression coverage.
   - **program manager** – rollout coordinator who tracks milestones and escalations.
   - **status** – short status summary (for example: `Planning`, `In QA`, `Blocked on API`).
   - **PR link** and **test link** – optional URLs to the latest rollout PR or regression run.
4. Commit the updated CSV so CI can enforce parity with the connector manifest.

## Working with spreadsheets

To convert the CSV into an `.xlsx` workbook:

1. Upload `tracker-template.csv` (or `apps-script-tracker.csv`) to Google Sheets.
2. Use **File → Download → Microsoft Excel (.xlsx)** to create the workbook copy.
3. Share the sheet with the Apps Script rollout distribution list so the ownership metadata stays visible.

## Syncing with Confluence and Jira

- **Confluence:** Embed the Google Sheet (or attach the exported `.xlsx`) in the "Apps Script rollout" space. When the CSV changes, re-export the sheet and update the Confluence attachment so historical status stays in sync.
- **Jira:** For each connector, create (or update) an Apps Script rollout epic. Link the epic in the `status` column, and add a comment summarizing the current totals (`total ops` and `Apps Script implemented ops`).
- **Automation cadence:** Re-run `init-apps-script-tracker.ts` whenever the runtime coverage report changes. After regenerating the tracker, push the updated CSV, refresh the Google Sheet, and drop a short summary in the rollout Confluence page describing what changed.

## CI enforcement

`npm run lint` now runs `scripts/check-apps-script-tracker.ts`, which warns (and fails the build) if any connectors appear in the manifest but not in the tracker export. Re-run the initializer to add new connectors or update the CSV manually before merging.
