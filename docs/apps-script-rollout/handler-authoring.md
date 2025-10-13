# Apps Script Handler Authoring Guide

This guide documents the conventions that all Apps Script rollout handlers must follow when calling external APIs, handling errors, and maintaining trigger state. Apply these patterns when updating existing templates or writing bespoke logic so that generated connectors remain reliable, observable, and easy to debug.

## Helper module recap

Every generated workflow imports the shared helper module exposed by `appsScriptHttpHelpers()`:

- `withRetries(fn, options)` wraps synchronous operations with exponential backoff. Defaults: up to **5 attempts**, **500 ms** initial delay, **2× multiplier**, and a **60 s** maximum backoff.
- `fetchJson(url, requestOptions)` wraps `UrlFetchApp.fetch`, forces `muteHttpExceptions`, parses JSON responses, and throws for non-2xx responses so retry handlers can classify failures.
- Structured logging helpers (`logStructured`, `logInfo`, `logWarn`, `logError`) emit consistent JSON payloads.
- Trigger helpers (`buildTimeTrigger`, `buildPollingWrapper`, `syncTriggerRegistry`, and `clearTriggerByKey`) manage registration, deduplication, and lifecycle logging for Apps Script triggers.

Always import these helpers at the top of your generated file (the compiler handles this automatically) and avoid duplicating logic inline.

## Usage patterns

1. **Wrap outbound calls** – Use `withRetries(() => fetchJson(...))` for every HTTP operation. This ensures exponential backoff, request/response logging, and automatic propagation of retryable failures.
2. **Emit structured logs** – Replace `console.*` with `logInfo`/`logWarn`/`logError`. Include contextual metadata (connector name, operation, cursor values) to speed up on-call investigations.
3. **Surface request metadata** – When calling `fetchJson`, always pass explicit `method`, `headers`, and stringified `payload` values so logs capture the full outbound request (minus secrets).
4. **Record trigger summaries** – Trigger executors should call `runtime.summary({...})` within `buildPollingWrapper` handlers to persist the final state of each execution.

## Error handling semantics

The helper stack distinguishes between **retryable** and **non-retryable** errors:

- HTTP status codes **≥500**, network exceptions, and Apps Script quota hiccups should bubble up through the thrown error. `withRetries` will automatically retry until the maximum attempt count is reached.
- Validation failures (HTTP **4xx** other than **429**) should set `error.retryable = false` before rethrowing so the helper stops retrying and the workflow fails fast.
- Explicit aborts (e.g., duplicate detection) should throw an `Error` with `name = "NonRetryableError"` so downstream monitoring treats them as expected guardrails.

Always include a `logError` call in custom catch blocks and rethrow the error so the retry helper can make the final decision.

### Custom retry configuration

Override the defaults when a connector publishes stricter rate limits:

```javascript
return withRetries(() => fetchJson(url, request), {
  maxAttempts: 4,
  initialDelayMs: 1000,
  backoffMultiplier: 3,
  maxDelayMs: 120000,
});
```

Keep the configuration explicit in the handler so reviewers can confirm it aligns with the vendor guidance.

## Trigger state expectations

When implementing polling or time-driven triggers:

- Return the result of `buildPollingWrapper(triggerKey, executor)` so lifecycle hooks remain wired up.
- Use the provided `runtime.dispatch(payload)` to safely invoke `main` and propagate per-item errors through the helper stack.
- Persist cursors via Script Properties. The polling wrapper automatically passes the last stored cursor as part of the executor `context` argument; update it after each successful batch so the next execution resumes from the correct position.
- Call `syncTriggerRegistry(activeKeys)` inside `setupTriggers()` after registering new triggers via `buildTimeTrigger`. This ensures removed triggers are cleaned up and avoids duplicate schedules.
- Set `ephemeral: true` on one-off delay triggers so they are not recorded in the persistent registry.

## Concrete examples

### Slack `send_message`

```javascript
function sendMessage(input) {
  const url = `${input.baseUrl}/chat.postMessage`;
  const request = {
    method: 'post',
    contentType: 'application/json; charset=utf-8',
    headers: {
      Authorization: `Bearer ${input.tokens.bot}`,
    },
    payload: JSON.stringify({
      channel: input.channel,
      text: input.text,
      thread_ts: input.threadTs,
    }),
    muteHttpExceptions: true,
  };

  return withRetries(() => fetchJson(url, request))
    .then((response) => {
      logInfo('slack_send_message_success', {
        channel: input.channel,
        ts: response.ts,
      });
      return response;
    })
    .catch((error) => {
      logError('slack_send_message_failure', {
        channel: input.channel,
        status: error.response?.status,
      });
      if (error.response && error.response.status >= 400 && error.response.status < 500 && error.response.status !== 429) {
        error.retryable = false;
      }
      throw error;
    });
}
```

### Salesforce `create_record`

```javascript
function createRecord(input) {
  const url = `${input.instanceUrl}/services/data/v57.0/sobjects/${input.objectApiName}`;
  const request = {
    method: 'post',
    contentType: 'application/json; charset=utf-8',
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
    },
    payload: JSON.stringify(input.fields),
    muteHttpExceptions: true,
  };

  return withRetries(() => fetchJson(url, request))
    .then((response) => {
      logInfo('salesforce_create_record_success', {
        id: response.id,
        object: input.objectApiName,
      });
      return response;
    })
    .catch((error) => {
      logError('salesforce_create_record_failure', {
        object: input.objectApiName,
        status: error.response?.status,
        errorCodes: error.response?.body?.[0]?.errorCode,
      });
      if (error.response && error.response.status === 400) {
        error.retryable = false;
      }
      throw error;
    });
}
```

These examples demonstrate the required helper usage (retries, structured logging) and the guardrail for marking validation errors as non-retryable.

## Further reading

- [Apps Script Rollout Spec](spec.md)
- [Shared Apps Script Templates](templates.md)
- [Monitoring Playbook](monitoring.md)
