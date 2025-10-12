# Shared Apps Script Templates

## HTTP helper module

Every generated Apps Script workflow now injects a helper module that provides:

- `withRetries(fn, options)`: wraps synchronous operations with exponential backoff (default 5 attempts, 500ms initial delay, 2x multiplier, 60s cap).
- `fetchJson(url, requestOptions)`: small wrapper around `UrlFetchApp.fetch` that enables `muteHttpExceptions`, parses JSON bodies, logs successes and failures, and throws on non-2xx status codes so retry logic can kick in automatically.
- `logStructured(level, event, details)`, plus the convenience helpers `logInfo`, `logWarn`, and `logError`: sends structured JSON payloads to the Apps Script logger so Stackdriver picks them up with consistent metadata.

The helper module lives at the top of `compile-to-appsscript.ts` in the `appsScriptHttpHelpers()` function and is emitted into the generated `Code.gs` before any workflow runtime utilities. Contributors extending the compiler should call `appsScriptHttpHelpers()` when adding new top-level templates.

## Using the helpers in templates

All `REAL_OPS` snippets that talk to third-party APIs must:

1. Call `withRetries(() => fetchJson(...))` instead of using `UrlFetchApp.fetch` directly.
2. Provide `contentType`, `headers`, and stringified `payload` values explicitly so the helper can emit accurate logs.
3. Replace `console.log`/`console.warn` usage with the structured logging helpers (`logInfo`, `logWarn`, `logError`).

When authoring new templates, follow the existing patterns (e.g., Slack, Salesforce, Mailchimp) to ensure outbound requests opt into the shared retry policy and logging. Doing so keeps the generated Apps Script code resilient, debuggable, and consistent across connectors.

## Trigger helper utilities

Time-based triggers and event handlers are orchestrated through additional helpers emitted by `appsScriptHttpHelpers()`:

- `buildTimeTrigger(config)`: registers time-driven triggers and deduplicates them by key. Provide `handler`, a stable `key`, and any scheduling fields (`everyHours`, `everyWeeks`, `atHour`, `runAt`, etc.). Use the `ephemeral` flag for one-off triggers such as delay handlers so the registry is not persisted.
- `syncTriggerRegistry(activeKeys)`: call once from `setupTriggers()` after provisioning triggers to remove any stale project triggers and keep the script properties registry authoritative.
- `buildPollingWrapper(triggerKey, executor)`: wrap trigger bodies to receive lifecycle logging automatically. The executor receives a `runtime` object with `dispatch(payload)` (invokes `main` safely) and `summary(partial)` (merges metadata for the logging payload). All trigger implementations should return the wrapper invocation so success and error signals flow through the shared logger.
- `clearTriggerByKey(triggerKey)`: optional cleanup utility for bespoke teardown scenarios when a trigger key should be removed manually.

When generating new trigger templates:

1. Wrap the handler body with `buildPollingWrapper` and use `runtime.dispatch(...)` to invoke `main` for each payload.
2. Record meaningful metadata via `runtime.summary(...)` so execution logs capture counts, query parameters, or any skip reasons.
3. Emit registration logic through `buildTimeTrigger` inside `setupTriggers()` and keep the returned keys in an array passed to `syncTriggerRegistry`.
4. Prefer `logInfo`/`logWarn`/`logError` for structured messages instead of raw `console` calls.

Following these patterns ensures recurring schedules, polling triggers, and ad-hoc delay triggers are self-healing (no duplicate triggers), observable, and aligned with the rest of the generated runtime.
