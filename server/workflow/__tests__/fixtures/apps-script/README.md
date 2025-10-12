# Apps Script workflow fixtures

These JSON graphs model representative workflows for each Apps Script rollout tier. They are consumed by
`compile-to-appsscript.snapshots.test.ts` to validate the generated Apps Script output against stable
snapshots.

The fixtures intentionally exercise:

- **Authentication** flows that depend on stored secrets.
- **Polling triggers** (Gmail, Sheets, and time-based schedules).
- **Retry helpers** emitted by the compiler for high-reliability HTTP requests.
- **Error-handling** branches via conditional nodes and fallback actions.

Use the `refresh-snapshots.ts` helper to regenerate the snapshot files when compiler templates change.
See `docs/apps-script-rollout/snapshot-testing.md` for full instructions.
