# Apps Script command reference

The npm scripts below power the Apps Script rollout workflow. Use this quick reference to understand when to run each command, what data it needs, and which files or artefacts it produces.

## Runtime coverage

### `npm run report:runtime`
- **Purpose:** Generates the connector runtime coverage report and prints a per-connector summary that highlights Node.js vs. Apps Script enablement. This is the source for the tracker and rollout status reviews.
- **Prerequisites:**
  - Install dependencies with `npm install`.
  - Ensure `server/connector-manifest.json` and runtime metadata files are up to date (the script reads the manifest directly).
- **Outputs:**
  - Console table showing every operation with runtime availability and enablement flags.
  - Writes `production/reports/apps-script-runtime-coverage.csv` by default (override with `--output <path>`).

### `npm run report:apps-script-real-ops`
- **Purpose:** Compares Apps Script-capable actions and triggers defined in `connectors/*/definition.json` against the `REAL_OPS` builders compiled in `server/workflow/compile-to-appsscript.ts`. Use it to confirm every Apps Script operation has a native implementation before promoting connectors.
- **Prerequisites:**
  - Install dependencies (`npm install`) so `npx tsx` can execute TypeScript entry points.
  - Keep `server/workflow/compile-to-appsscript.ts` and `server/workflow/realOps.generated.ts` in sync (`npm run build:apps-script`) so coverage numbers reflect reality.
- **Outputs:**
  - Logs a coverage summary (`covered/total` operations plus per-connector gaps) and fails the process when coverage drops below `APPS_SCRIPT_REAL_OPS_TARGET` (defaults to `0`).
  - Writes both `production/reports/apps-script-real-ops-coverage.json` (detailed connector breakdown) and `production/reports/apps-script-real-ops-coverage.csv` (spreadsheet-friendly view) for handoffs.

## Prioritization and backlog

### `npm run prioritize:apps-script`
- **Purpose:** Builds the Apps Script prioritization CSV by merging connector manifest data with analytics impact scores so rollout tiers remain data-driven.
- **Prerequisites:**
  - Install dependencies (`npm install`).
  - Ensure the following source files exist and are current:
    - `server/connector-manifest.json`
    - `production/reports/connector-inventory.json`
    - `analytics/business-intelligence.ts`
- **Outputs:**
  - Console summary grouped by rollout tier.
  - Writes `production/reports/apps-script-prioritization.csv`.

### `npm run update:apps-script-backlog`
- **Purpose:** Regenerates `docs/apps-script-rollout/backlog.md` so the human-readable backlog stays aligned with the prioritization CSV and connector manifest.
- **Prerequisites:**
  - Run `npm run prioritize:apps-script` first so `production/reports/apps-script-prioritization.csv` is fresh.
  - Keep `server/connector-manifest.json` and connector definition JSON files synced with the latest rollout state.
- **Outputs:**
  - Rewrites `docs/apps-script-rollout/backlog.md` with tier sections, runtime status, and planning placeholders.

### `npm run check:apps-script-backlog`
- **Purpose:** Validates that `docs/apps-script-rollout/backlog.md` lists the same connectors as `server/connector-manifest.json`, preventing drift between planning docs and code.
- **Prerequisites:**
  - Backlog regenerated via `npm run update:apps-script-backlog`.
  - No additional environment variables required.
- **Outputs:**
  - Prints a success checkmark when the backlog matches the manifest.
  - Emits an error and non-zero exit code if any connector is missing or extra.

## Tracker enforcement

### `npm run check:apps-script-tracker`
- **Purpose:** Ensures `docs/apps-script-rollout/apps-script-tracker.csv` covers every connector in the manifest so the rollout tracker is CI-enforced.
- **Prerequisites:**
  - Refresh the tracker export (for example with `npx tsx scripts/init-apps-script-tracker.ts`).
  - Keep `server/connector-manifest.json` updated.
- **Outputs:**
  - Logs missing or extra connectors and fails the run when gaps are detected.
  - Prints a success message when the tracker aligns with the manifest.

## Builder generation and smoke tests

### `npm run build:apps-script`
- **Purpose:** Regenerates Apps Script builder stubs (`server/workflow/realOps.generated.ts`) used by the compiler and tests.
- **Prerequisites:**
  - Install dependencies.
  - Ensure backlog references in `docs/apps-script-rollout/backlog.md` are accurate—the generator uses them for TODO annotations.
- **Outputs:**
  - Writes `server/workflow/realOps.generated.ts` with the latest stub implementations.

### `npm run check:apps-script-builders`
- **Purpose:** Runs the builder generator in `--check` mode to confirm `server/workflow/realOps.generated.ts` is in sync without rewriting files (CI-safe smoke check).
- **Prerequisites:**
  - Regenerate builders locally with `npm run build:apps-script` when changes are intentional.
- **Outputs:**
  - Exits cleanly when the generated file matches expectations.
  - Prints guidance and exits non-zero if regeneration is required.

### `npm run test:apps-script`
- **Purpose:** Executes the Vitest suite that compiles workflows to Apps Script and verifies snapshot parity—use it as a smoke test before shipping rollout changes.
- **Prerequisites:**
  - Install dependencies and keep snapshots current (`node --experimental-strip-types server/workflow/__tests__/fixtures/apps-script/refresh-snapshots.ts`).
- **Outputs:**
  - Vitest coverage report for the Apps Script compiler suite.
  - Fails on snapshot drift or runtime compilation issues.
