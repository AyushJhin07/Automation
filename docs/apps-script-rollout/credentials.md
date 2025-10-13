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
| Google Admin | `GOOGLE_ADMIN_ACCESS_TOKEN` or (`GOOGLE_ADMIN_SERVICE_ACCOUNT` + `GOOGLE_ADMIN_DELEGATED_EMAIL`), optional `GOOGLE_ADMIN_CUSTOMER_ID` (defaults to `my_customer`) |
| DocuSign | `DOCUSIGN_ACCESS_TOKEN`, `DOCUSIGN_ACCOUNT_ID`, optional `DOCUSIGN_BASE_URI` |

The helper automatically infers connector keys from the property prefix, so additional overrides can be added to `SECRET_HELPER_OVERRIDES.connectors` when bespoke aliases are required.

### Tier-0 and Tier-1 connector reference

Tier-0/Tier-1 connectors ship in the first rollout batches and must have their Script Properties documented with consistent aliases. Use the tables below when wiring Apps Script properties, populating Vault exports, or configuring `SECRET_HELPER_OVERRIDES`. Each table lists the canonical property requested by generated workflows and the `apps_script__` alias that keeps Script Properties namespaced. Run `tsx scripts/verify-apps-script-properties.ts --write` whenever connector handlers change so this reference, the generated JSON report, and the lint rules remain synchronized. Connector-specific runbooks called out below should also be updated when property requirements evolve.

The Apps Script runtime now seeds these aliases as defaults, so deployments can rely on the `apps_script__<connector>__...` property names without declaring custom overrides. When preferring namespaced properties, declare overrides similar to:

```js
var SECRET_HELPER_OVERRIDES = {
  connectors: {
    hubspot: {
      HUBSPOT_ACCESS_TOKEN: {
        aliases: ['apps_script__hubspot__access_token', 'HUBSPOT_API_KEY', 'apps_script__hubspot__api_key']
      }
    }
  }
};
```

This keeps connector code unchanged while letting the helper resolve prefixed properties or sealed credential bundles (for example `apps_script__hubspot__sealed_credentials`) transparently.

#### Airtable

| Script property | Required? | Purpose | Preferred aliases |
| --- | --- | --- | --- |
| `AIRTABLE_API_KEY` | Yes | Personal access token for REST calls | `apps_script__airtable__api_key` |
| `AIRTABLE_BASE_ID` | Yes | Default base identifier used by triggers/actions | `apps_script__airtable__base_id` |

- **OAuth/API scopes:** Airtable personal access tokens must include the base(s) the workflow touches plus the required tables.
- **Refresh strategy:** Tokens do not expire automatically, but rotate quarterly and revoke unused keys inside Airtable admin.
- **API key naming:** Store the canonical value as `AIRTABLE_API_KEY`; the helper resolves namespaced `apps_script__airtable__api_key` automatically.
- **Runbook:** [Troubleshooting Playbook](../troubleshooting-playbook.md)

#### Asana

| Script property | Required? | Purpose | Preferred aliases |
| --- | --- | --- | --- |
| `ASANA_ACCESS_TOKEN` | Yes | Personal access token used for task automation | `apps_script__asana__access_token` |

- **OAuth/API scopes:** Generate PATs with at least `default` and `tasks:write` scopes so handlers can create/update work.
- **Refresh strategy:** PATs behave like long-lived tokens; recreate them when team members change or permissions shift.
- **API key naming:** Keep the canonical key as `ASANA_ACCESS_TOKEN`; `apps_script__asana__access_token` resolves automatically.
- **Runbook:** [Troubleshooting Playbook](../troubleshooting-playbook.md)

#### Box

| Script property | Required? | Purpose | Preferred aliases |
| --- | --- | --- | --- |
| `BOX_ACCESS_TOKEN` | Yes | OAuth access token for Box API requests | `apps_script__box__access_token` |

- **OAuth scopes:** Include `item_upload`, `item_read`, and retention scopes for workflows that archive or move files.
- **Refresh strategy:** OAuth Manager issues one-hour tokens—schedule a backend job to refresh and push updated values daily.
- **API key naming:** Always write the refreshed token back to `BOX_ACCESS_TOKEN`; the namespaced alias resolves automatically.
- **Runbook:** [Troubleshooting Playbook](../troubleshooting-playbook.md)

#### DocuSign

| Script property | Required? | Purpose | Preferred aliases |
| --- | --- | --- | --- |
| `DOCUSIGN_ACCESS_TOKEN` | Yes | OAuth/JWT token for envelope lifecycle APIs | `apps_script__docusign__access_token` |
| `DOCUSIGN_ACCOUNT_ID` | Yes | Target account GUID used in REST endpoints | `apps_script__docusign__account_id` |
| `DOCUSIGN_BASE_URI` | Optional | Override base URI when routing outside the default shard | `apps_script__docusign__base_uri` |

- **OAuth scopes:** Grant `signature`, `impersonation`, and any product-specific scopes the workflow exercises.
- **Refresh strategy:** JWT tokens expire quickly—rotate them on each deployment or persist refresh tokens in the Vault bundle.
- **API key naming:** Keep Script Properties in canonical casing; aliases allow `apps_script__docusign__…` overrides.
- **Runbook:** Keep the DocuSign section of the [Troubleshooting Playbook](../troubleshooting-playbook.md) aligned with these properties.

#### Dropbox

| Script property | Required? | Purpose | Preferred aliases |
| --- | --- | --- | --- |
| `DROPBOX_ACCESS_TOKEN` | Yes | OAuth access token for Dropbox file operations | `apps_script__dropbox__access_token` |

- **OAuth scopes:** Provision tokens with `files.content.write` and `files.content.read` for uploads, downloads, and metadata.
- **Refresh strategy:** Dropbox short-lived tokens last four hours—schedule refreshes that overwrite Script Properties hourly.
- **API key naming:** Store the value under `DROPBOX_ACCESS_TOKEN`; the helper reads the namespaced alias without overrides.
- **Runbook:** [Troubleshooting Playbook](../troubleshooting-playbook.md)

#### GitHub

| Script property | Required? | Purpose | Preferred aliases |
| --- | --- | --- | --- |
| `GITHUB_ACCESS_TOKEN` | Yes | Personal access token or GitHub App installation token | `apps_script__github__access_token` |

- **OAuth scopes:** Tokens must include `repo` and, when managing issues/projects, the corresponding `project` scopes.
- **Refresh strategy:** PATs rarely expire but should be rotated when org policies change; GitHub App tokens expire hourly—use the server-side signer to refresh and push updated Script Properties during deployment.
- **API key naming:** Never rename the Script Property; the helper resolves `apps_script__github__access_token` automatically for namespaced deployments.
- **Runbooks:** Keep [Troubleshooting Playbook](../troubleshooting-playbook.md) and connector-specific runbooks aligned; update recipes like [GitHub → Slack](../recipes/github-issue-to-slack.md#recipe-github-issue--slack-notification-webhook) when scopes change.

#### Google Admin

| Script property | Required? | Purpose | Preferred aliases |
| --- | --- | --- | --- |
| `GOOGLE_ADMIN_ACCESS_TOKEN` | Optional | OAuth token for Admin Directory APIs when not using service accounts | `apps_script__google_admin__access_token` |
| `GOOGLE_ADMIN_SERVICE_ACCOUNT` | Optional | JSON service-account key used for domain-wide delegation fallback | `apps_script__google_admin__service_account` |
| `GOOGLE_ADMIN_DELEGATED_EMAIL` | Optional | Admin email impersonated when authenticating with a service account | `apps_script__google_admin__delegated_email` |
| `GOOGLE_ADMIN_CUSTOMER_ID` | Optional | Overrides the default `my_customer` tenant | `apps_script__google_admin__customer_id` |

- **OAuth scopes:** Align with the handlers in use (for example `https://www.googleapis.com/auth/admin.directory.user` and `…group` scopes for CRUD actions).
- **Authentication strategy:** Handlers first attempt `requireOAuthToken`. When that fails, they fall back to the service-account JSON and delegated admin email if both are configured.
- **Refresh strategy:** OAuth tokens expire in one hour—refresh centrally and overwrite Script Properties. Rotate service accounts and delegated access on a regular cadence.
- **API key naming:** Maintain the canonical property names; aliases ensure namespaced variants resolve without additional overrides.
- **Runbook:** Document changes in the Google Admin section of the [Troubleshooting Playbook](../troubleshooting-playbook.md).

#### Google Drive

| Script property | Required? | Purpose | Preferred aliases |
| --- | --- | --- | --- |
| `GOOGLE_DRIVE_ACCESS_TOKEN` | Yes (unless service account configured) | OAuth access token resolved by `requireOAuthToken('google-drive')` | `apps_script__google_drive__access_token` |
| `GOOGLE_DRIVE_SERVICE_ACCOUNT` | Optional | JSON service-account key used when OAuth tokens are unavailable | `apps_script__google_drive__service_account` |

- **OAuth scopes:** Use `https://www.googleapis.com/auth/drive.file` (minimum) or broader scopes when managing shared drives.
- **Refresh strategy:** Treat user tokens as one-hour credentials; refresh them automatically and overwrite Script Properties.
- **API key naming:** Service account blobs must remain in `GOOGLE_DRIVE_SERVICE_ACCOUNT` to align with the helper overrides.
- **Runbook:** [OAuth setup — Google](../phases/oauth-setup.md#google-drivecalendar)

#### Google Sheets

| Script property | Required? | Purpose | Preferred aliases |
| --- | --- | --- | --- |
| `GOOGLE_SHEETS_ACCESS_TOKEN` | Yes (unless service account configured) | OAuth token for Sheets API requests | `apps_script__sheets__access_token`, `apps_script__google_sheets__access_token` |
| `GOOGLE_SHEETS_SERVICE_ACCOUNT` | Optional | Service-account JSON used for headless updates | `apps_script__sheets__service_account`, `apps_script__google_sheets__service_account` |
| `GOOGLE_SHEETS_DELEGATED_EMAIL` | Optional | Delegated user email when impersonating via service accounts | `apps_script__sheets__delegated_email`, `apps_script__google_sheets__delegated_email` |

- **OAuth scopes:** Require `https://www.googleapis.com/auth/spreadsheets` for write access (handlers downshift to read-only automatically when possible).
- **Refresh strategy:** User tokens expire hourly—refresh centrally and update Script Properties; service accounts should be rotated quarterly and re-shared with the relevant spreadsheets.
- **API key naming:** Maintain canonical property names; the helper already maps both `apps_script__sheets__…` and `apps_script__google_sheets__…` aliases.
- **Runbook:** Capture scope updates in the Google Sheets rollout checklist within the connector runbook.

#### HubSpot

| Script property | Required? | Purpose | Preferred aliases |
| --- | --- | --- | --- |
| `HUBSPOT_ACCESS_TOKEN` | Yes | OAuth token issued by OAuth Manager or private app | `apps_script__hubspot__access_token`, historical `HUBSPOT_API_KEY`, `apps_script__hubspot__api_key` |

- **OAuth scopes:** Follow the [HubSpot OAuth setup guide](../phases/oauth-setup.md#hubspot); typical flows need the CRM read/write scopes listed there.
- **Refresh strategy:** OAuth Manager refreshes tokens nightly; ensure the rotation job writes the latest token into Script Properties for staging and production.
- **API key naming:** Use `HUBSPOT_ACCESS_TOKEN` going forward. The helper keeps backwards compatibility with `HUBSPOT_API_KEY` via aliases.
- **Runbooks:** Update both the HubSpot OAuth guide and connector runbooks when scopes or property expectations change.

#### Jira

| Script property | Required? | Purpose | Preferred aliases |
| --- | --- | --- | --- |
| `JIRA_API_TOKEN` | Yes | API token created from Atlassian profile | `apps_script__jira__api_token` |
| `JIRA_BASE_URL` | Yes | Cloud site base URL (e.g., `https://acme.atlassian.net`) | `apps_script__jira__base_url` |
| `JIRA_EMAIL` | Yes | Account email paired with the API token | `apps_script__jira__email` |

- **OAuth scopes:** Jira Cloud tokens inherit permissions from the user; ensure the account has project-admin rights when creating issues or managing workflows.
- **Refresh strategy:** Atlassian API tokens do not expire automatically but should be regenerated when admins rotate credentials.
- **API key naming:** Store values under the canonical Script Property names to satisfy the verification script.
- **Runbook:** [Troubleshooting Playbook](../troubleshooting-playbook.md)

#### Notion

| Script property | Required? | Purpose | Preferred aliases |
| --- | --- | --- | --- |
| `NOTION_ACCESS_TOKEN` | Yes | Internal integration token or OAuth access token for Notion API | `apps_script__notion__access_token` |
| `NOTION_DATABASE_ID` | Optional | Default database ID when manifests omit `parent.database_id` | `apps_script__notion__database_id` |
| `NOTION_PAGE_ID` | Optional | Default page ID for page-centric workflows | `apps_script__notion__page_id` |

- **OAuth scopes:** Internal integrations cover the needed scopes automatically; OAuth flows should request `databases.read`, `databases.write`, `pages.read`, and `pages.write` for Tier‑1 workflows.
- **Refresh strategy:** Tokens are long-lived; rotate when the integration owner changes or when a security review triggers new tokens.
- **API key naming:** Document defaults in the runbook whenever `NOTION_DATABASE_ID`/`NOTION_PAGE_ID` change so verify script output stays current.
- **Runbook:** [Troubleshooting Playbook](../troubleshooting-playbook.md)

#### Salesforce

| Script property | Required? | Purpose | Preferred aliases |
| --- | --- | --- | --- |
| `SALESFORCE_ACCESS_TOKEN` | Yes | Short-lived OAuth access token for REST calls | `apps_script__salesforce__access_token` |
| `SALESFORCE_INSTANCE_URL` | Yes | Instance base URL (for example, `https://example.my.salesforce.com`) | `apps_script__salesforce__instance_url` |

- **OAuth scopes:** Request `refresh_token`, `api`, and any object-specific scopes required by the workflow.
- **Refresh strategy:** Access tokens typically expire within 12 hours—use the stored refresh token outside Apps Script to rotate and overwrite `SALESFORCE_ACCESS_TOKEN` before expiry.
- **API key naming:** Keep the canonical Script Property names in sync with `scripts/verify-apps-script-properties.ts`.
- **Runbook:** Update the Salesforce entry in the [Troubleshooting Playbook](../troubleshooting-playbook.md) when scopes or rotation cadences change.

#### Shopify

| Script property | Required? | Purpose | Preferred aliases |
| --- | --- | --- | --- |
| `SHOPIFY_ACCESS_TOKEN` | Yes | Private app or custom storefront access token | `apps_script__shopify__access_token` |
| `SHOPIFY_API_KEY` | Optional | Legacy API key used alongside storefront tokens | `apps_script__shopify__api_key` |
| `SHOPIFY_SHOP_DOMAIN` | Yes | Shop domain used to resolve REST endpoints | `apps_script__shopify__shop_domain` |

- **OAuth scopes:** Ensure tokens cover `write_orders`, `read_orders`, and customer scopes when workflows sync order/customer data.
- **Refresh strategy:** Private app tokens are long-lived; rotate when regenerating credentials or migrating to OAuth.
- **API key naming:** Store domains without protocol (`acme-store`) and keep API keys under the canonical property names to satisfy automation checks.
- **Runbook:** [Troubleshooting Playbook](../troubleshooting-playbook.md)

#### Slack

| Script property | Required? | Purpose | Preferred aliases |
| --- | --- | --- | --- |
| `SLACK_BOT_TOKEN` | Yes | OAuth access token used for `chat.postMessage`, channel management, reactions, file uploads, and history polling | `apps_script__slack__bot_token`, historical `SLACK_ACCESS_TOKEN` |
| `SLACK_WEBHOOK_URL` | No | Fallback incoming webhook URL for legacy automations | `apps_script__slack__webhook_url` |

- **OAuth scopes:** Include `chat:write`, `channels:manage`, `channels:read`, `groups:history`, `mpim:history`, `im:history`, `users:read`, `reactions:write`, and `files:write`.
- **Refresh strategy:** Slack issues bot tokens that remain valid until revoked; coordinate regenerations with the Slack connector runbook and update Script Properties immediately.
- **API key naming:** Migrate away from `SLACK_ACCESS_TOKEN` in configs—the helper keeps it as an alias for backwards compatibility.
- **Runbooks:** Keep [OAuth Setup — Slack](../phases/oauth-setup.md#slack) and troubleshooting guides aligned with the property list.

#### Square

| Script property | Required? | Purpose | Preferred aliases |
| --- | --- | --- | --- |
| `SQUARE_ACCESS_TOKEN` | Yes | OAuth access token for Square REST APIs | `apps_script__square__access_token` |
| `SQUARE_APPLICATION_ID` | Yes | Square application identifier used for webhook signatures | `apps_script__square__application_id` |
| `SQUARE_ENVIRONMENT` | Optional | Overrides between `sandbox` and `production` | `apps_script__square__environment` |

- **OAuth scopes:** Request `PAYMENTS_READ`, `PAYMENTS_WRITE`, and other capability scopes the workflow requires.
- **Refresh strategy:** Tokens expire after 30 days of inactivity—refresh via OAuth Manager and overwrite Script Properties on rotation.
- **API key naming:** Set `SQUARE_ENVIRONMENT` explicitly in staging to avoid sandbox leaks; verification scripts expect the canonical property names.
- **Runbook:** Note Square environment/scope updates inside the [Troubleshooting Playbook](../troubleshooting-playbook.md).

#### Stripe

| Script property | Required? | Purpose | Preferred aliases |
| --- | --- | --- | --- |
| `STRIPE_SECRET_KEY` | Yes | Secret API key for payments, refunds, and subscription automation | `apps_script__stripe__secret_key` |
| `STRIPE_ACCOUNT_OVERRIDE` | Optional | Supplies the `Stripe-Account` header for Connect workflows | `apps_script__stripe__account_override` |

- **OAuth scopes:** Standard secret keys cover the Stripe API; Connect flows may require restricted keys with explicit object permissions.
- **Refresh strategy:** Rotate keys when mandated by Stripe security reviews and immediately update Script Properties (and sealed bundles).
- **API key naming:** Keep keys in canonical properties so `scripts/verify-apps-script-properties.ts` continues to validate deployments.
- **Runbook:** [Troubleshooting Playbook](../troubleshooting-playbook.md)

#### Trello

| Script property | Required? | Purpose | Preferred aliases |
| --- | --- | --- | --- |
| `TRELLO_API_KEY` | Yes | REST API key from Trello developer portal | `apps_script__trello__api_key` |
| `TRELLO_TOKEN` | Yes | OAuth token tied to the API key | `apps_script__trello__token` |

- **OAuth scopes:** Generate tokens with `read`, `write`, and `account` scopes to cover Tier‑1 automations.
- **Refresh strategy:** Tokens can be long-lived when `expiration=never`; audit them quarterly and reissue when membership changes.
- **API key naming:** Keep the canonical property names in sync; the alias removes the need for manual overrides.
- **Runbooks:** [Trello webhook registration](../webhooks-trello.md) and [Troubleshooting Playbook](../troubleshooting-playbook.md)

#### Twilio

| Script property | Required? | Purpose | Preferred aliases |
| --- | --- | --- | --- |
| `TWILIO_ACCOUNT_SID` | Yes | Account identifier for API authentication | `apps_script__twilio__account_sid` |
| `TWILIO_AUTH_TOKEN` | Yes | Secret token for API authentication | `apps_script__twilio__auth_token` |
| `TWILIO_FROM_NUMBER` | Yes | Default sending phone number for outbound messages | `apps_script__twilio__from_number` |

- **OAuth scopes:** Twilio uses basic auth—ensure the API key has `Programmable SMS` permissions for messaging workflows.
- **Refresh strategy:** Rotate auth tokens whenever they are reissued in the Twilio console; update Script Properties immediately to avoid auth failures.
- **API key naming:** Keep the canonical property names for compatibility with verification tooling.
- **Runbook:** [Troubleshooting Playbook](../troubleshooting-playbook.md)

#### Typeform

| Script property | Required? | Purpose | Preferred aliases |
| --- | --- | --- | --- |
| `TYPEFORM_ACCESS_TOKEN` | Yes | Personal token for form management APIs | `apps_script__typeform__access_token` |

- **OAuth scopes:** Generate tokens with `forms:read`, `forms:write`, and `responses:read` scopes to enable trigger + action flows.
- **Refresh strategy:** Tokens are revocable; audit them monthly and rotate if inactivity warnings appear in the Typeform console.
- **API key naming:** Store values in the canonical property name; namespaced aliases resolve automatically during runtime.
- **Runbook:** [Troubleshooting Playbook](../troubleshooting-playbook.md) and [Typeform → HubSpot recipe](../recipes/hubspot-contact-from-typeform.md#recipe-create-hubspot-contact-from-typeform-submission)

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
