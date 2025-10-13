# Credential management for Apps Script workflows

This guide describes how generated Apps Script workflows resolve secrets at runtime. All credential lookups flow through the shared `getSecret` helper that is emitted with every workflow build.

## `getSecret(propertyName, opts)`

The helper lives in `compile-to-appsscript.ts` and is injected into the generated `Code.gs`. It provides a single entry point for retrieving connector credentials:

- Looks up the requested `propertyName` from the script's [Script Properties](https://developers.google.com/apps-script/guides/properties) store.
- Falls back to JSON payloads pushed from IntegrationManager via Vault exports.
- Supports declarative overrides so connector-specific aliases (for example mapping `SLACK_WEBHOOK_URL` to `SLACK_ACCESS_TOKEN`) resolve automatically.
- Throws a descriptive error and emits a structured `secret_missing` log when a credential cannot be found.

```js
const token = getSecret('SLACK_BOT_TOKEN');
const optionalValue = getSecret('WORKFLOW_LOGS', { defaultValue: '[]' });
const webhook = getSecret('SLACK_WEBHOOK_URL', { aliases: ['SLACK_ACCESS_TOKEN'] });
```

### Options

`getSecret` accepts an `opts` object with the following keys:

| Option | Description |
| --- | --- |
| `aliases` | String or array of strings representing alternative property names to try. |
| `defaultValue` | Value returned when no credential is found in properties or Vault. Prevents the helper from throwing. |
| `connectorKey` / `connector` | Identifier used to load overrides from `SECRET_HELPER_OVERRIDES.connectors`. If omitted, the helper infers a key from the leading segment of the property name (`SLACK_WEBHOOK_URL` → `slack`). |
| `mapTo` | Explicit property name to prioritize during lookup. |
| `logResolved` | When `true`, emits a `secret_resolved` info log showing which key satisfied the request (never logs the secret value). |

### Configuration surface

`getSecret` reads an optional `SECRET_HELPER_OVERRIDES` object that can be declared in a custom `Code.gs` file before workflow execution. The structure is:

```js
var SECRET_HELPER_OVERRIDES = {
  defaults: {
    SLACK_WEBHOOK_URL: {
      aliases: ['SLACK_ACCESS_TOKEN'],
      defaultValue: null
    }
  },
  connectors: {
    slack: {
      SLACK_WEBHOOK_URL: {
        mapTo: 'SLACK_ACCESS_TOKEN'
      }
    }
  }
};
```

Overrides in `defaults` apply to every lookup for the matching property name. Entries inside `connectors` activate when the helper resolves the same connector key (either provided explicitly or inferred from the property prefix). This enables per-connector credential remapping without editing the generated workflow.

## `requireOAuthToken(connectorKey, opts)`

Workflows that rely on OAuth access tokens can call `requireOAuthToken` to enforce that the credential exists and surface clear configuration hints when it does not. The helper normalizes the connector key, forwards the lookup to `getSecret`, and raises a descriptive error that lists the canonical Script Property name plus any supported aliases. When provided, the optional `scopes` array is echoed back in the error message to highlight which OAuth grants the deployment expects.

```js
const slackToken = requireOAuthToken('slack', { scopes: ['chat:write'] });
const jiraToken = requireOAuthToken('jira');
```

`requireOAuthToken` uses the same alias metadata as `getSecret`, so namespaced Script Properties like `apps_script__slack__bot_token` and historical synonyms such as `SLACK_ACCESS_TOKEN` resolve automatically.

## Script Properties expectations

Before deploying a workflow, populate Script Properties with the credentials required by the connectors in use. Property names are uppercase with underscores and match the service being called. Common examples include:

| Connector | Script Properties |
| --- | --- |
| Slack | `SLACK_BOT_TOKEN` (required), optional `SLACK_WEBHOOK_URL` |
| Salesforce | `SALESFORCE_ACCESS_TOKEN`, `SALESFORCE_INSTANCE_URL` |
| Twilio | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` |
| Shopify | `SHOPIFY_ACCESS_TOKEN`, `SHOPIFY_SHOP_DOMAIN` |
| Square | `SQUARE_ACCESS_TOKEN`, `SQUARE_APPLICATION_ID`, optional `SQUARE_ENVIRONMENT` (`sandbox` by default) |
| Google Admin | `GOOGLE_ADMIN_ACCESS_TOKEN`, optional `GOOGLE_ADMIN_CUSTOMER_ID` (defaults to `my_customer`) |
| DocuSign | `DOCUSIGN_ACCESS_TOKEN`, `DOCUSIGN_ACCOUNT_ID`, optional `DOCUSIGN_BASE_URI` |

The helper automatically infers connector keys from the property prefix, so additional overrides can be added to `SECRET_HELPER_OVERRIDES.connectors` when bespoke aliases are required.

### Tier-0 and Tier-1 connector reference

Tier-0/Tier-1 connectors ship in the first rollout batches and must have their Script Properties documented with consistent aliases. Use the tables below when wiring Apps Script properties, populating Vault exports, or configuring `SECRET_HELPER_OVERRIDES`. Each table lists the canonical property requested by generated workflows, the `apps_script__` alias that keeps Script Properties namespaced, and the operational docs to reference during rollout.

The Apps Script runtime now seeds these aliases as defaults, so deployments can rely on the `apps_script__<connector>__...` property names without declaring custom overrides.

When preferring namespaced properties, declare overrides similar to:

```js
var SECRET_HELPER_OVERRIDES = {
  connectors: {
    hubspot: {
      HUBSPOT_API_KEY: {
        aliases: ['apps_script__hubspot__api_key']
      }
    }
  }
};
```

This keeps connector code unchanged while letting the helper resolve prefixed properties or sealed credential bundles (for example `apps_script__hubspot__sealed_credentials`) transparently.

#### Airtable

| Script property | Required? | Purpose | Preferred aliases |
| --- | --- | --- | --- |
| `AIRTABLE_API_KEY` | Yes | API key for REST calls | `apps_script__airtable__api_key` |
| `AIRTABLE_BASE_ID` | Yes | Default base identifier used by triggers/actions | `apps_script__airtable__base_id` |

- Runbook: [Troubleshooting Playbook](../troubleshooting-playbook.md)
- Script Property tips: `AIRTABLE_BASE_ID` seeds the pagination cursor for `list_records`, so workflows resume from the last offset even after the Apps Script runtime restarts.

#### Slack

| Script property | Required? | Purpose | Preferred aliases |
| --- | --- | --- | --- |
| `SLACK_BOT_TOKEN` | Yes | OAuth access token used for `chat.postMessage`, channel management, reactions, file uploads, and history polling. Must include `chat:write`, `channels:manage`, `channels:read`, `groups:history`, `mpim:history`, `im:history`, `users:read`, `reactions:write`, and `files:write` scopes. | `apps_script__slack__bot_token`, historical `SLACK_ACCESS_TOKEN` |
| `SLACK_WEBHOOK_URL` | No | Fallback incoming webhook URL for legacy automations that still rely on webhooks when OAuth tokens are unavailable. | `apps_script__slack__webhook_url` |

- Script Property tips: Configure the Apps Script deployment with a bot token that includes the scopes listed above. The runtime calls `requireOAuthToken('slack', …)` for every action and trigger, so missing scopes surface before the API call. Incoming webhooks remain supported as a safety valve but are only used when explicitly configured alongside the OAuth token.

#### Trello Enhanced

| Script property | Required? | Purpose | Preferred aliases |
| --- | --- | --- | --- |
| `TRELLO_API_KEY` | Yes | Public API key required for Trello REST requests. | `apps_script__trello_enhanced__api_key`, historical `apps_script__trello__api_key` |
| `TRELLO_TOKEN` | Yes | Trello member token paired with the API key for authentication. | `apps_script__trello_enhanced__token`, historical `apps_script__trello__token` |
| `TRELLO_WEBHOOK_CALLBACK_URL` | Conditional | Default callback URL used when webhook nodes omit an explicit `callbackURL`. Configure when building webhook-based automations. | `apps_script__trello_enhanced__webhook_callback_url`, legacy `apps_script__trello__webhook_callback_url` |

- Script Property tips: API keys and tokens come from https://trello.com/app-key. Generate a member token with write access so actions can create cards, labels, checklists, and webhooks. Populate `TRELLO_WEBHOOK_CALLBACK_URL` with the HTTPS endpoint that receives Trello webhook payloads when the workflow relies on webhook triggers.

#### Salesforce

| Script property | Required? | Purpose | Preferred aliases |
| --- | --- | --- | --- |
| `SALESFORCE_ACCESS_TOKEN` | Yes | Short-lived OAuth access token for REST calls | `apps_script__salesforce__access_token` |
| `SALESFORCE_INSTANCE_URL` | Yes | Instance base URL (for example, `https://example.my.salesforce.com`) used to compose REST endpoints | `apps_script__salesforce__instance_url` |

- Script Property tips: Salesforce access tokens typically expire within 12 hours. Automations must refresh the token via a scheduled job (or another CI system) and overwrite `SALESFORCE_ACCESS_TOKEN` before it expires. The Apps Script handler validates that both the access token and instance URL are present, so missing properties fail fast during execution.
- OAuth refresh expectations: Configure the connected app with `offline_access` and persist the issued refresh token outside of Apps Script. Use that token to rotate the access token on a cadence and update Script Properties so deployments stay authorized.
- Rate limits: Responses often include `errorCode`, `message`, and `fields` arrays. The handler wraps API calls in `rateLimitAware`, surfaces those arrays in the thrown error, and reuses Salesforce's suggested backoff hints.


#### Asana

| Script property | Required? | Purpose | Preferred aliases |
| --- | --- | --- | --- |
| `ASANA_ACCESS_TOKEN` | Yes | Personal access token used for task automation | `apps_script__asana__access_token` |

- Runbook: [Troubleshooting Playbook](../troubleshooting-playbook.md)
- Script Property tips: Generate a PAT that includes `tasks:write` and store it verbatim in Script Properties. The REAL_OPS handler validates the configured project GID, so mismatched environments surface clear errors before the API call.
- Rate limits: Asana enforces per-user and per-app quotas. The handler now uses `rateLimitAware`, which automatically honors `Retry-After` headers and retries with backoff—plan workflows assuming the default 150 requests/minute ceiling.

#### Box

| Script property | Required? | Purpose | Preferred aliases |
| --- | --- | --- | --- |
| `BOX_ACCESS_TOKEN` | Yes | OAuth access token for Box API requests | `apps_script__box__access_token` |

- Runbook: [Troubleshooting Playbook](../troubleshooting-playbook.md)
- The token must include the `item_upload` scope (or equivalent enterprise permission) so upload sessions can create files in the target folders.
- Apps Script uploads under 45 MB use the standard multipart endpoint. Larger payloads transparently switch to [chunked upload sessions](https://developer.box.com/guides/uploads/chunked/)—ensure the Box account tier supports them and allow a small buffer for the session `part_size` overhead when sizing payloads.

#### Dropbox

| Script property | Required? | Purpose | Preferred aliases |
| --- | --- | --- | --- |
| `DROPBOX_ACCESS_TOKEN` | Yes | OAuth access token for Dropbox file operations | `apps_script__dropbox__access_token` |

- Runbook: [Troubleshooting Playbook](../troubleshooting-playbook.md)
- Generate the token with the `files.content.write` scope so workflows can create or overwrite files in Dropbox.
- Direct uploads are capped at 150 MB; the compiler automatically falls back to upload sessions for larger files. Configure Script Properties with tokens that can initiate sessions and confirm the Apps Script project has enough execution quota to stream the chunks.

#### GitHub

| Script property | Required? | Purpose | Preferred aliases |
| --- | --- | --- | --- |
| `GITHUB_ACCESS_TOKEN` | Yes | Personal access token or GitHub App installation token | `apps_script__github__access_token` |

- **Script Property expectations:** Store a token that includes the `repo` scope. The Apps Script runtime now calls `requireOAuthToken('github')`, so missing or scope-limited tokens surface descriptive errors that mention the canonical Script Property name and its aliases. Repositories are validated in `owner/repo` format; misconfigured values will stop execution before a failing API call.

- Runbook: [Troubleshooting Playbook](../troubleshooting-playbook.md)
- Additional guidance: [GitHub → Slack automation recipe](../recipes/github-issue-to-slack.md#recipe-github-issue--slack-notification-webhook)

#### Google Drive

| Script property | Required? | Purpose | Preferred aliases |
| --- | --- | --- | --- |
| `GOOGLE_DRIVE_ACCESS_TOKEN` | Yes (unless service account configured) | OAuth access token resolved by `requireOAuthToken('google-drive')` | `apps_script__google_drive__access_token` |
| `GOOGLE_DRIVE_SERVICE_ACCOUNT` | Optional | JSON service-account key used when OAuth tokens are unavailable | `apps_script__google_drive__service_account` |

- Runbook: [OAuth setup — Google](../phases/oauth-setup.md#google-drivecalendar)
- Apps Script now issues REST calls with `rateLimitAware` and `requireOAuthToken`. Store an access token scoped to `https://www.googleapis.com/auth/drive.file` (or broader) in Script Properties before deploying Tier‑0 automations.
- Service accounts are supported for back-office automations. Save the raw JSON key in `GOOGLE_DRIVE_SERVICE_ACCOUNT`; the handler exchanges it for an access token at runtime. The account must have access to the destination folders.
- Parent folder IDs are validated via the Drive API before creation. Misconfigured IDs surface structured errors in workflow logs—double-check shared-drive permissions if validation fails.

#### HubSpot

| Script property | Required? | Purpose | Preferred aliases |
| --- | --- | --- | --- |
| `HUBSPOT_API_KEY` | Yes | Private app token for CRM endpoints | `apps_script__hubspot__api_key` |

- Runbook: [OAuth setup — HubSpot](../phases/oauth-setup.md#hubspot)
- Additional guidance: [Typeform → HubSpot recipe](../recipes/hubspot-contact-from-typeform.md#recipe-create-hubspot-contact-from-typeform-submission)

#### Jira

| Script property | Required? | Purpose | Preferred aliases |
| --- | --- | --- | --- |
| `JIRA_API_TOKEN` | Yes | API token created from Atlassian profile | `apps_script__jira__api_token` |
| `JIRA_BASE_URL` | Yes | Cloud site base URL (e.g., `https://acme.atlassian.net`) | `apps_script__jira__base_url` |
| `JIRA_EMAIL` | Yes | Account email paired with the API token | `apps_script__jira__email` |

- Runbook: [Troubleshooting Playbook](../troubleshooting-playbook.md)
- Script Property tips: Store `JIRA_BASE_URL` without a trailing slash—the Apps Script runtime reuses it to build browse links that get persisted to context logs. When tokens are missing, the handler raises actionable errors that mention the canonical Script Property names.
- Rate limits: Atlassian returns granular `errorMessages` and field-level `errors`. Wrapping calls in `rateLimitAware` means the handler respects `Retry-After` hints and surfaces those payloads in the thrown exception for rapid debugging.

#### Notion

| Script property | Required? | Purpose | Preferred aliases |
| --- | --- | --- | --- |
| `NOTION_ACCESS_TOKEN` | Yes | Internal integration token or OAuth access token for Notion API | `apps_script__notion__access_token` |
| `NOTION_DATABASE_ID` | Optional | Default database ID used when a manifest omits `parent.database_id` | `apps_script__notion__database_id` |
| `NOTION_PAGE_ID` | Optional | Default page ID used when a manifest sets `parent.type` to `page_id` without a value | `apps_script__notion__page_id` |

- OAuth guidance: Create an internal integration in Notion (or complete the OAuth handshake) and share the target databases/pages with that integration so the token stored in `NOTION_ACCESS_TOKEN` can create content. Populate `NOTION_DATABASE_ID` or `NOTION_PAGE_ID` when workflows rely on those defaults.
- Runbook: [Troubleshooting Playbook](../troubleshooting-playbook.md)

#### Shopify

| Script property | Required? | Purpose | Preferred aliases |
| --- | --- | --- | --- |
| `SHOPIFY_ACCESS_TOKEN` | Yes | Private app or custom storefront access token | `apps_script__shopify__access_token` |
| `SHOPIFY_SHOP_DOMAIN` | Yes | Shop domain used to resolve REST endpoints | `apps_script__shopify__shop_domain` |

- Runbook: [Troubleshooting Playbook](../troubleshooting-playbook.md)
- Required scopes: Apps Script order creation expects an access token authorized for `write_orders` so draft orders can be created, plus `read_customers`/`write_customers` when the workflow enriches or upserts customer profiles alongside the order payload.
- Script Property tips: Populate `SHOPIFY_SHOP_DOMAIN` without the `https://` prefix (for example `acme-store`) so generated handlers can construct both Admin URLs and customer-facing order status links.

#### Stripe

| Script property | Required? | Purpose | Preferred aliases |
| --- | --- | --- | --- |
| `STRIPE_SECRET_KEY` | Yes | Secret API key for payments, refunds, and subscription automation | `apps_script__stripe__secret_key` |

- Runbook: [Troubleshooting Playbook](../troubleshooting-playbook.md)
- Additional guidance: [Stripe payment succeeded → Slack recipe](../recipes/stripe-payment-succeeded-to-slack.md#recipe-stripe-payment-succeeded-%E2%86%92-slack-notification)

#### Trello

| Script property | Required? | Purpose | Preferred aliases |
| --- | --- | --- | --- |
| `TRELLO_API_KEY` | Yes | REST API key from Trello developer portal | `apps_script__trello__api_key` |
| `TRELLO_TOKEN` | Yes | OAuth token tied to the API key | `apps_script__trello__token` |
| `TRELLO_WEBHOOK_CALLBACK_URL` | Conditional | Default callback URL for Trello Enhanced webhook registration | `apps_script__trello__webhook_callback_url`, `apps_script__trello_enhanced__webhook_callback_url` |

- Runbook: [Trello webhook registration](../webhooks-trello.md)
- Troubleshooting: [Playbook](../troubleshooting-playbook.md)
- Script Property tips: Generate the key/token pair from the same Trello account and scope the token for board access. Populate `TRELLO_WEBHOOK_CALLBACK_URL` with the externally reachable HTTPS endpoint that Trello should call for webhook triggers or when workflows use the `create_webhook` action—runtime handlers fall back to this property when the node omits an explicit callback URL. Successful runs persist the created card ID and URL to the workflow context so downstream steps can link back to Trello.
- Rate limits: Trello may reply with `Retry-After` headers when bursting. The REAL_OPS handler now delegates to `rateLimitAware`, which waits for those windows and rethrows descriptive errors that include Trello's response payload.

#### Twilio

| Script property | Required? | Purpose | Preferred aliases |
| --- | --- | --- | --- |
| `TWILIO_ACCOUNT_SID` | Yes | Account identifier for API authentication | `apps_script__twilio__account_sid` |
| `TWILIO_AUTH_TOKEN` | Yes | Secret token for API authentication | `apps_script__twilio__auth_token` |
| `TWILIO_FROM_NUMBER` | Yes | Default sending phone number for outbound messages | `apps_script__twilio__from_number` |

- Runbook: [Troubleshooting Playbook](../troubleshooting-playbook.md)

#### Typeform

| Script property | Required? | Purpose | Preferred aliases |
| --- | --- | --- | --- |
| `TYPEFORM_ACCESS_TOKEN` | Yes | Personal token for form management APIs | `apps_script__typeform__access_token` |

- Runbook: [Troubleshooting Playbook](../troubleshooting-playbook.md)
- Additional guidance: [Typeform webhook workflow recipe](../recipes/hubspot-contact-from-typeform.md#recipe-create-hubspot-contact-from-typeform-submission)

## Vault export payloads

When IntegrationManager pushes secrets from Vault, the workflow expects one of the following Script Properties to contain a JSON export:

- `__VAULT_EXPORTS__`
- `VAULT_EXPORTS_JSON`
- `VAULT_EXPORTS`

The JSON should be a flat object whose keys mirror the Script Property names, or an object with a top-level `secrets` field containing that mapping. Example:

```json
{
  "secrets": {
    "SLACK_BOT_TOKEN": "xoxb-***",
    "SLACK_WEBHOOK_URL": "https://hooks.slack.com/services/...",
    "SALESFORCE_ACCESS_TOKEN": "00D...",
    "SALESFORCE_INSTANCE_URL": "https://acme.my.salesforce.com",
    "TWILIO_ACCOUNT_SID": "AC...",
    "TWILIO_AUTH_TOKEN": "secret"
  }
}
```

or simply:

```json
{
  "SLACK_BOT_TOKEN": "xoxb-***",
  "TWILIO_AUTH_TOKEN": "secret"
}
```

During execution, `getSecret` parses the Vault export once and treats it as another credential source. Any parsing errors raise a `vault_exports_parse_failed` warning and fall back to Script Properties.
## Short-lived sealed credentials

Apps Script deployments now prefer sealed credential blobs generated by the server. Each blob packages the connector payload, the expiration metadata, and the rotation identifiers into a Base64 string with the prefix `AS1.`. The server derives the blob from the active envelope encryption key, issues a per-connector shared key, and signs the payload so Apps Script can reject tampering before decrypting the contents.

Sealed tokens expire after a short window (5 minutes by default) and should be refreshed during each deployment run. When a token is expired `getSecret` throws an error similar to `Credential token for connector:slack has expired.` so workflows fail fast rather than running with stale credentials.

### CLI helper

Use the new CLI to seal connector payloads into a deployment bundle:

```bash
ts-node scripts/apps-script-seal-credentials.ts \
  --input production/examples/workflows/apps-script-secrets.json \
  --bundle production/deployment-bundles/apps-script-sealed-credentials.json \
  --ttl 900
```

The input file maps connector identifiers to Script Property payloads:

```json
{
  "slack": {
    "SLACK_BOT_TOKEN": "xoxb-***",
    "SLACK_WEBHOOK_URL": "https://hooks.slack.com/services/..."
  },
  "salesforce": {
    "SALESFORCE_ACCESS_TOKEN": "00D...",
    "SALESFORCE_INSTANCE_URL": "https://acme.my.salesforce.com"
  }
}
```

Running the helper writes a bundle resembling:

```json
{
  "generatedAt": "2024-04-10T18:04:00.000Z",
  "ttlSeconds": 900,
  "connectorCount": 2,
  "connectors": {
    "slack": {
      "token": "AS1.EyJ2ZXJzaW9uIjoxLCJ...",
      "issuedAt": "2024-04-10T18:04:00.000Z",
      "expiresAt": "2024-04-10T18:19:00.000Z",
      "keyId": "kms-record",
      "secretCount": 2,
      "purpose": "connector:slack"
    }
  }
}
```

Deployers should copy the `token` string into the Script Properties store (for example `apps_script__slack__sealed_credentials`). Tokens are safe to version-control inside deployment artifacts; the shared key is embedded in the payload and only remains valid until the expiry timestamp.

### Rotation and expiry

Because each sealed token is derived from the active envelope key, rotating KMS keys automatically invalidates future tokens. Existing tokens remain decryptable until their `expiresAt` timestamp, after which the Apps Script runtime rejects them. To avoid noisy rollouts, generate fresh tokens immediately after rotations and push the new bundle before the previous set expires.

When tokens are missing or expired `getSecret` emits structured errors:

- `Credential token for connector:<id> has expired.`
- `Credential token integrity check failed for connector:<id>.` (tampering or corruption)

These events appear alongside the existing `secret_missing` log entries.

### How `getSecret` handles sealed tokens

The helper automatically detects values with the `AS1.` prefix and performs the following steps before returning the credential:

1. Base64-decodes the blob and parses the JSON metadata.
2. Validates the token expiry timestamp, purpose, and checksum using the embedded shared key.
3. Reconstructs the keystream, decrypts the sealed payload, and verifies the metadata embedded inside the ciphertext.
4. Emits a `sealed_secret_validated` log (when `logResolved` is enabled) and returns the decrypted credential value.

No changes are required in workflow code—existing calls to `getSecret` seamlessly handle both plain Script Properties and sealed bundles. Workflows should continue to provide friendly defaults via `defaultValue` when a secret is optional, but critical secrets should rely on the built-in errors to surface misconfigurations quickly.


## Error handling and logging

If a credential cannot be resolved from Script Properties, Vault exports, or provided defaults, the helper logs a structured `secret_missing` event (including the connector key and the list of keys it attempted) and throws `Missing required secret "<PROPERTY>"`. This ensures misconfigurations surface immediately during runtime and keeps connector logging consistent across all `REAL_OPS` snippets.
