# Shared Apps Script Templates

## HTTP helper module

Every generated Apps Script workflow now injects a helper module that provides:

- `withRetries(fn, options)`: wraps synchronous operations with exponential backoff (default 5 attempts, 500ms initial delay, 2x multiplier, 60s cap).
- `fetchJson(url, requestOptions)`: small wrapper around `UrlFetchApp.fetch` that enables `muteHttpExceptions`, parses JSON bodies, logs successes and failures, and throws on non-2xx status codes so retry logic can kick in automatically.
- `logStructured(level, event, details)`, plus the convenience helpers `logInfo`, `logWarn`, and `logError`: sends structured JSON payloads to the Apps Script logger so Stackdriver picks them up with consistent metadata.

The helper module lives at the top of `compile-to-appsscript.ts` in the `appsScriptHttpHelpers()` function and is emitted into the generated `Code.gs` before any workflow runtime utilities. Contributors extending the compiler should call `appsScriptHttpHelpers()` when adding new top-level templates.

## Using the helpers in templates

Refer to the [Handler Authoring Guide](handler-authoring.md) for end-to-end examples that demonstrate how the helpers work in practice. The guide now consolidates helper usage, parameter validation, retry semantics, and trigger state management expectations for Tier‑0 connectors—link to it in design docs and rollout plans. All `REAL_OPS` snippets that talk to third-party APIs must:

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

## Template selection rules

The real Apps Script builder now selects templates from `server/workflow/apps-script-templates.ts` instead of inlining string literals. The generator inspects each connector definition and chooses a template based on the operation metadata:

- **REST POST template** – used for actions whose connector definition declares an `endpoint`, a non-GET HTTP `method`, and a `baseUrl`. The template injects auth headers from `authentication.type` (`oauth2` → bearer tokens, `apiKey` → bearer + `X-API-Key`, `basic` → base64 credentials) and posts a JSON payload assembled from the node context.
- **Retryable fetch template** – applied to actions with `method: GET` (or missing). Pagination hints are derived from request parameters (`cursor`, `page`, `limit`, etc.) and response samples (`next_cursor`, `nextPageToken`, …). When a cursor is detected the template loops with an exponential-backoff fetch until the API stops returning a next token.
- **Polling trigger template** – available when a trigger has `type: "polling"`, an `endpoint`, and the connector exposes a `baseUrl`. Cursor fields from `trigger.dedupe.cursor` and pagination hints are passed through so the generated handler persists state in Script Properties and continues paging on the next run.
- **Webhook reply template** – assigned to triggers with `type: "webhook"`. The template parses the incoming request body, dispatches it to `main`, and returns a JSON acknowledgement.
- Operations missing enough metadata fall back to the `todoTemplate`, which keeps the backlog warnings intact.

### Connector family examples

- **CRM (Salesforce, HubSpot enhanced)** – CRUD endpoints advertise `method: "POST"` or `"PATCH"` plus OAuth 2.0 auth. The generator emits the REST POST template so credentials are pulled from `SALESFORCE_ACCESS_TOKEN`/`INSTANCE_URL` style secrets automatically.
- **Communications (Slack, Gmail list operations)** – read-only endpoints surface `method: "GET"` with pagination hints such as `next_cursor`. The retryable fetch template is chosen, giving Apps Script loops that respect Slack’s cursor-based pagination while logging request batches.
- **Analytics (Power BI)** – dataset polling triggers declare `type: "polling"` and a cursor field in `dedupe.cursor`. When an endpoint is provided the polling trigger template is selected, wiring the cursor into Script Properties so repeated runs keep advancing.
- **Knowledge management (Notion enhanced)** – webhook triggers are marked with `type: "webhook"`. The webhook reply template handles payload parsing, dispatches into the workflow, and returns the `ContentService` JSON confirmation expected by Notion.

Review `server/workflow/apps-script-templates.ts` for the exact template implementations and add new helpers there whenever a connector family needs bespoke scaffolding.

## QA Log Template

Use the following Markdown table when recording manual QA runs. Attach a copy of the table to the connector tracker row and link it in the rollout PR description.

| Scenario | Preconditions | Tester | Result | Notes |
| --- | --- | --- | --- | --- |
| Example: OAuth reconnect flow | Connector configured with expired refresh token | A. Rivera | ✅ Pass | Token refresh prompt surfaced and completed. |

Add or duplicate rows until all test scenarios defined in the rollout tracker are covered.
