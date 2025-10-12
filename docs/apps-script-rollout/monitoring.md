# Apps Script rollout monitoring

This guide captures how the staging smoke harness is scheduled, the telemetry it
emits, and the remediation workflow when failures occur. Share it with the Apps
Script rollout squad, QA, and support so the response playbook stays visible.

## Scheduled staging smoke job

- The job is implemented in [`scripts/apps-script-smoke-cron.ts`](../../scripts/apps-script-smoke-cron.ts).
- Run it under a long-lived process manager (e.g. systemd, PM2, Cloud Run) with:
  ```bash
  npm run cron:apps-script-smoke
  ```
- Key environment variables:
  - `APPS_SCRIPT_DRY_RUN_ENVIRONMENT` (default `staging`) — label used in logs,
    metrics, and alerts.
  - `APPS_SCRIPT_DRY_RUN_INTERVAL_MS` (default 30 minutes) — cadence for the
    dry-run harness.
  - `APPS_SCRIPT_DRY_RUN_FIXTURES_DIR` / `APPS_SCRIPT_DRY_RUN_FILTERS` — scope
    the fixture set if a reduced blast radius is required.
  - `APPS_SCRIPT_ROLLOUT_TRACKER_URL` — canonical link included in alerts so
    responders can jump straight to ownership context.
  - `APPS_SCRIPT_QA_ALERT_WEBHOOK` and `APPS_SCRIPT_SUPPORT_ALERT_WEBHOOK` —
    Slack/webhook endpoints that receive paging notifications on failure.
- Use `--once` (or set `APPS_SCRIPT_DRY_RUN_RUN_ONCE=true`) for ad-hoc reruns
  during incident response without mutating the scheduler.

## Metrics emitted

The cron job reuses the OpenTelemetry helpers in
[`server/observability/index.ts`](../../server/observability/index.ts):

- `apps_script_dry_run_runs_total` — execution counter labelled by environment
  and run status.
- `apps_script_dry_run_fixture_results_total` — per-fixture success/failure
  counts labelled with connector IDs.
- `apps_script_dry_run_fixture_duration_ms` — histogram of fixture runtimes.
- `apps_script_dry_run_last_run_timestamp`, `apps_script_dry_run_duration_ms`,
  and `apps_script_dry_run_failed_fixtures` — gauges describing the most recent
  run (timestamp, duration, failure count, total fixture count).

Scrape these metrics from the existing OTLP/Prometheus exporters to back dashboards
and SLOs. The gauges let you plot the most recent failure set even if only one
fixture regresses.

## Alerting and paging

When any fixture fails—or the harness itself crashes—the scheduler raises an
`error` alert via `HealthMonitoringService`. Alerts automatically fan out to the
QA and support webhook channels defined above. Payloads include:

- Environment label
- Failing fixture IDs (if applicable)
- Direct link to the rollout tracker (`APPS_SCRIPT_ROLLOUT_TRACKER_URL`)
- Stack traces for harness crashes

Alerts also remain visible in the `/api/status/alerts` endpoint for the admin UI.

## Runbook / remediation steps

1. **Acknowledge the page** in the QA or support channel. Confirm ownership via
   the rollout tracker link.
2. **Inspect the failing fixtures** by running a one-off smoke locally or in the
   staging environment:
   ```bash
   APPS_SCRIPT_DRY_RUN_FILTERS="<fixture-id-1>,<fixture-id-2>" \
   npm run cron:apps-script-smoke -- --once
   ```
   Review console output for harness errors versus expectation failures.
3. **Check recent merges** touching the reported connectors. Roll back or fix
   regressions in connector definitions, Apps Script templates, or staged
   credentials as appropriate.
4. **Verify secrets**. Ensure staging credential blobs or webhook URLs referenced
   by the fixtures still exist in the shared secret manager. Re-seal or rotate if
   any are missing/expired.
5. **Re-run the scheduler once** to confirm the fix, then re-enable the long-lived
   process if it was paused. Success clears the active alert automatically.
6. **Document the incident** in the rollout tracker (link from the alert) and add
   follow-up tasks for systemic fixes if the root cause requires deeper work.

Keeping this loop tight ensures Apps Script regressions are caught in staging
before they threaten production rollouts.
