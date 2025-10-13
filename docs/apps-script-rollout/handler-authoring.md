# Apps Script Handler Authoring Guide

This guide documents the conventions that all Apps Script rollout handlers must follow when calling external APIs, validating parameters, handling errors, and maintaining trigger state. Apply these patterns whenever you update generated templates or author bespoke logic so Tier‑0 connectors remain reliable, observable, and easy to debug.

## Shared helper module recap

Every generated workflow imports the helper bundle returned by `appsScriptHttpHelpers()`:

- **`withRetries(fn, options?)`** – Wraps synchronous operations with exponential backoff (default: up to 5 attempts, 500 ms initial delay, ×2 multiplier, 60 s max). Retry metadata is surfaced in logs so reviewers can confirm rate‑limit posture.
- **`fetchJson(url, requestOptions)`** – Thin wrapper around `UrlFetchApp.fetch` that enforces `muteHttpExceptions`, captures the raw response payload, parses JSON bodies, and throws on non‑2xx responses so retry handlers can classify failures.
- **Structured logging helpers** – `logStructured`, `logInfo`, `logWarn`, and `logError` emit consistent JSON payloads that power rollout dashboards.
- **Trigger utilities** – `buildTimeTrigger`, `buildPollingWrapper`, `syncTriggerRegistry`, and `clearTriggerByKey` keep trigger registration idempotent and record lifecycle events.
- **OAuth helpers** – `requireOAuthToken` and related utilities encapsulate token resolution, masking, and scope validation.

Always import these helpers at the top of a generated file (the compiler handles this automatically) and avoid duplicating logic inline.

## Parameter validation expectations

Every handler must validate its required inputs **before** making outbound calls. Early validation prevents noisy retries and surfaces actionable errors to the rollout tracker.

1. **Guard required fields** – Check for `null`, `undefined`, and empty strings. Throw a descriptive `Error` with `error.name = 'NonRetryableError'` (or set `error.retryable = false`) so the retry helper halts immediately.
2. **Normalize optional fields** – Trim whitespace, coerce enums to lowercase, and default optional structures to sane values (e.g., `[]` for lists, `{}` for payloads) before passing them to downstream helpers.
3. **Sanitize secrets** – Never log raw tokens or payloads. Use `mask()` (exposed by the helper bundle) or omit sensitive values from log metadata altogether.
4. **Fail fast on configuration gaps** – When Script Properties are missing, throw a non‑retryable error that references the canonical property name. Pair it with a `logError` entry so the rollout dashboard captures the misconfiguration.

A minimal validation pattern looks like this:

```javascript
function assertRequired(value, field) {
  if (value === null || value === undefined || value === '') {
    const error = new Error(field + ' is required');
    error.name = 'NonRetryableError';
    throw error;
  }
  return value;
}
```

Call `assertRequired` (or an equivalent helper) for each user‑supplied field before invoking `withRetries`.

## Retry and error handling patterns

The helper stack distinguishes between **retryable** and **non‑retryable** failures. Follow these guidelines so on‑call engineers can trust the emitted telemetry:

- **Wrap every outbound call** – Use `withRetries(() => fetchJson(...))` (or wrap custom `UrlFetchApp.fetch` calls) so network hiccups, HTTP 5xx responses, and Apps Script quota errors automatically back off.
- **Log contextual metadata** – Replace `console.*` with `logInfo` / `logWarn` / `logError`. Include connector identifiers, operation names, request IDs, and cursor positions so investigators can correlate retries.
- **Mark validation failures as non‑retryable** – For HTTP 4xx responses (except 408/409/429), set `error.retryable = false` before rethrowing. Alternatively, set `error.name = 'NonRetryableError'` so monitoring tools classify it correctly.
- **Respect vendor rate limits** – When a vendor publishes stricter guidance, override retry defaults explicitly:
  ```javascript
  return withRetries(() => fetchJson(url, request), {
    maxAttempts: 4,
    initialDelayMs: 1_000,
    backoffMultiplier: 3,
    maxDelayMs: 120_000,
  });
  ```
  Keep the override inline so reviewers can compare it against vendor documentation.
- **Propagate structured errors** – When you transform errors (e.g., to add validation context), always rethrow the original error object so the retry helper can inspect `response` metadata.

## Trigger state management

Polling and time‑driven triggers must keep their state in sync with Script Properties and the rollout registry:

1. **Always return `buildPollingWrapper`** – `buildPollingWrapper(triggerKey, executor)` wires in structured logging, stats aggregation, and cursor persistence. The `executor(runtime)` receives:
   - `runtime.state` – The mutable state object loaded from Script Properties.
   - `runtime.setState(nextState)` – Replaces the persisted state.
   - `runtime.dispatch(payload)` – Calls `main(payload)` safely and increments success/failure counters.
   - `runtime.dispatchBatch(items, mapFn?)` – Convenience helper for array payloads.
   - `runtime.summary(partial)` – Adds metadata (e.g., last cursor, batch size, connector list) to the final stats payload.
2. **Persist cursors deliberately** – Update `runtime.state` after each successful fetch, then call `runtime.summary({ cursor })` (or rely on state persistence) so the next execution resumes correctly.
3. **Synchronize trigger registrations** – In setup flows, call `syncTriggerRegistry(activeKeys)` after registering triggers with `buildTimeTrigger`. This removes orphaned triggers and prevents duplicates.
4. **Use ephemeral triggers for one‑offs** – When scheduling delay handlers or backfills, set `{ ephemeral: true }` so transient triggers are not written to the persistent registry.
5. **Surface trigger health** – On success, emit a `logInfo('trigger_poll_success', …)` via `runtime.summary`. On fatal errors, rely on the helper’s automatic `logError('trigger_poll_error', …)` emission.

## Worked examples for Tier‑0 connectors

The following examples show how the shared helpers keep Slack, Salesforce, and Gmail Tier‑0 flows consistent.

### Slack message send (action)

```javascript
function slackSendMessage(input) {
  assertRequired(input.tokens?.bot, 'Bot token');
  assertRequired(input.channel, 'Channel');
  assertRequired(input.text, 'Message text');

  const url = (input.baseUrl || 'https://slack.com/api') + '/chat.postMessage';
  const request = {
    method: 'post',
    contentType: 'application/json; charset=utf-8',
    headers: {
      Authorization: 'Bearer ' + input.tokens.bot,
    },
    payload: JSON.stringify({
      channel: input.channel.trim(),
      text: input.text,
      thread_ts: input.threadTs || undefined,
    }),
    muteHttpExceptions: true,
  };

  try {
    const response = withRetries(() => fetchJson(url, request));
    logInfo('slack_send_message_success', {
      connector: 'slack',
      channel: input.channel,
      ts: response.ts,
    });
    return response;
  } catch (error) {
    logError('slack_send_message_failure', {
      connector: 'slack',
      channel: input.channel,
      status: error.response?.status,
    });
    if (error.response && error.response.status >= 400 && error.response.status < 500 && error.response.status !== 429) {
      error.retryable = false;
    }
    throw error;
  }
}
```

### Salesforce record create (action)

```javascript
function salesforceCreateRecord(input) {
  assertRequired(input.accessToken, 'Salesforce access token');
  assertRequired(input.instanceUrl, 'Salesforce instance URL');
  assertRequired(input.objectApiName, 'Object API name');
  assertRequired(input.fields, 'Record payload');

  const url = input.instanceUrl.replace(/\/$/, '') +
    '/services/data/v57.0/sobjects/' + encodeURIComponent(input.objectApiName);

  const request = {
    method: 'post',
    contentType: 'application/json; charset=utf-8',
    headers: {
      Authorization: 'Bearer ' + input.accessToken,
    },
    payload: JSON.stringify(input.fields),
    muteHttpExceptions: true,
  };

  try {
    const response = withRetries(() => fetchJson(url, request), {
      maxAttempts: 4,
      initialDelayMs: 750,
      backoffMultiplier: 2,
      maxDelayMs: 90_000,
    });

    logInfo('salesforce_create_record_success', {
      connector: 'salesforce',
      object: input.objectApiName,
      id: response.id,
    });

    return response;
  } catch (error) {
    logError('salesforce_create_record_failure', {
      connector: 'salesforce',
      object: input.objectApiName,
      status: error.response?.status,
      errorCodes: error.response?.body?.[0]?.errorCode,
    });
    if (error.response && error.response.status === 400) {
      error.retryable = false;
    }
    throw error;
  }
}
```

### Gmail polling trigger (Tier‑0 trigger)

```javascript
function gmailPollNewMessages() {
  return buildPollingWrapper('trigger.gmail:new_messages', function (runtime) {
    const accessToken = PropertiesService.getScriptProperties().getProperty('GMAIL_ACCESS_TOKEN');
    assertRequired(accessToken, 'GMAIL_ACCESS_TOKEN');

    const cursor = runtime.state.cursor || null;
    const query = cursor ? 'after:' + cursor : 'newer_than:1d';
    const request = {
      method: 'get',
      contentType: 'application/json; charset=utf-8',
      headers: {
        Authorization: 'Bearer ' + accessToken,
      },
      muteHttpExceptions: true,
    };

    const baseUrl = 'https://gmail.googleapis.com/gmail/v1/users/me';
    const url = baseUrl + '/messages?maxResults=50&q=' + encodeURIComponent(query);

    let response;
    try {
      response = withRetries(() => fetchJson(url, request), {
        maxAttempts: 5,
        initialDelayMs: 1_000,
        backoffMultiplier: 2,
        maxDelayMs: 120_000,
      });
    } catch (error) {
      logError('gmail_poll_failure', {
        connector: 'gmail',
        status: error.response?.status,
      });
      if (error.response && error.response.status >= 400 && error.response.status !== 429) {
        error.retryable = false;
      }
      throw error;
    }

    const messages = response.messages || [];

    runtime.dispatchBatch(messages, (message) => ({
      messageId: message.id,
      threadId: message.threadId,
    }));

    const pollSummary = {
      connector: 'gmail',
      lastMessageId: null,
      cursor: runtime.state.cursor,
      batchSize: messages.length,
    };

    const newestMessage = messages[0];
    if (newestMessage) {
      pollSummary.lastMessageId = newestMessage.id;
      try {
        const detail = withRetries(() => fetchJson(baseUrl + '/messages/' + newestMessage.id + '?format=metadata', request));
        if (detail.internalDate) {
          runtime.state.cursor = String(detail.internalDate);
          pollSummary.cursor = runtime.state.cursor;
        }
      } catch (detailError) {
        logWarn('gmail_poll_cursor_resolution_failed', {
          connector: 'gmail',
          messageId: newestMessage.id,
          status: detailError.response?.status,
        });
      }
    }

    runtime.summary(pollSummary);

    return runtime.state;
  });
}
```

This trigger example loads the persisted cursor from Script Properties, emits structured logs automatically via the helper, and updates the cursor only after successfully dispatching the batch.

## Authentication callouts

Apps Script handlers that call Google APIs often rely on Script Properties to differentiate between delegated OAuth tokens and service accounts. Document the chosen credential type in rollout plans and confirm staging/production stores carry the same scopes before promoting Tier‑0 automations.

- **Delegated OAuth** – Store the user token (e.g., `GOOGLE_SHEETS_ACCESS_TOKEN`, `GMAIL_ACCESS_TOKEN`) with the scopes required by both actions and triggers. Handlers downgrade to read‑only scopes when possible.
- **Service accounts** – Persist the raw JSON key (e.g., `GOOGLE_SHEETS_SERVICE_ACCOUNT`) and, when using domain‑wide delegation, the impersonated email. The runtime exchanges the JWT for an access token and surfaces structured errors when payloads are malformed.

## Further reading

- [Apps Script Rollout Spec](spec.md)
- [Shared Apps Script Templates](templates.md)
- [Monitoring Playbook](monitoring.md)
- [Script Properties Reference](script-properties.md)
