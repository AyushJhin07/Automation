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
