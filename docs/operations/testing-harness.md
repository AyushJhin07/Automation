# Regression Harness

The regression harness executes contract tests across every published connector configuration. It is implemented as a Node.js CLI (`pnpm run apps-script:harness`) and is designed to run in CI and nightly automation jobs.

## Running the harness
1. Install dependencies with `pnpm install`.
2. Export the connector credentials required by the scenarios listed in the tracker.
3. Run `pnpm run apps-script:harness --connector <id>` to execute the suite for a single connector, or omit `--connector` to run the full matrix.
4. Use `--report junit` to emit JUnit XML that can be uploaded to the rollout dashboard.

## Results interpretation
- **Pass:** All assertions succeeded and the Apps Script logs contain no errors. The connector may proceed to manual QA.
- **Soft fail:** Non-blocking warnings (e.g., rate limit retries) occurred. Record the warning in the tracker and rerun after mitigation.
- **Fail:** Blocking regression detected. File a ticket, assign an owner, and rerun the harness before promoting the connector.

## Artifacts
- Logs are written to `artifacts/apps-script/<connector-id>/logs`.
- Screenshots of Apps Script dialogs are saved under `artifacts/apps-script/<connector-id>/screenshots` when running with `--capture`.

For integration details, review `scripts/apps-script-harness.ts` in the repository.
