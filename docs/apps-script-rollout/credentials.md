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

## Script Properties expectations

Before deploying a workflow, populate Script Properties with the credentials required by the connectors in use. Property names are uppercase with underscores and match the service being called. Common examples include:

| Connector | Script Properties |
| --- | --- |
| Slack | `SLACK_BOT_TOKEN`, `SLACK_WEBHOOK_URL` |
| Salesforce | `SALESFORCE_ACCESS_TOKEN`, `SALESFORCE_INSTANCE_URL` |
| Twilio | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` |
| Shopify | `SHOPIFY_API_KEY`, `SHOPIFY_SHOP_DOMAIN` |
| Square | `SQUARE_ACCESS_TOKEN`, `SQUARE_APPLICATION_ID`, optional `SQUARE_ENVIRONMENT` (`sandbox` by default) |
| Google Admin | `GOOGLE_ADMIN_ACCESS_TOKEN`, optional `GOOGLE_ADMIN_CUSTOMER_ID` (defaults to `my_customer`) |
| DocuSign | `DOCUSIGN_ACCESS_TOKEN`, `DOCUSIGN_ACCOUNT_ID`, optional `DOCUSIGN_BASE_URI` |

The helper automatically infers connector keys from the property prefix, so additional overrides can be added to `SECRET_HELPER_OVERRIDES.connectors` when bespoke aliases are required.

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

## Error handling and logging

If a credential cannot be resolved from Script Properties, Vault exports, or provided defaults, the helper logs a structured `secret_missing` event (including the connector key and the list of keys it attempted) and throws `Missing required secret "<PROPERTY>"`. This ensures misconfigurations surface immediately during runtime and keeps connector logging consistent across all `REAL_OPS` snippets.
