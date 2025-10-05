# Connector Module Contract

The Integration runtime now loads first-party connectors through a shared module
contract so every client exposes the same metadata surface area. A connector
module is a plain object with four required facets:

- **`auth`** – describes the authentication strategy (`oauth2`, `api_key`, etc.)
  plus any provider-specific metadata such as token URLs or required scopes.
- **`operations`** – map of action/trigger identifiers to metadata (display
  names, descriptions, JSON schemas for inputs/outputs, and optional rate limit
  hints). This powers validation and dynamic UX tooling.
- **`inputSchema`** – JSON schema describing the top-level payload accepted by
  the module. The Integration Manager uses this to enforce preflight validation
  before execution.
- **`execute`** – async function that receives a normalized
  `ConnectorExecuteInput` payload and returns a standardised
  `ConnectorExecuteOutput`.

The shared TypeScript definitions live in
`shared/connectors/module.ts` and are imported by both runtime code and tooling.
Connector API clients can call `BaseAPIClient#toConnectorModule(...)` to wrap
registered handler maps in a contract-compliant module object.【F:shared/connectors/module.ts†L1-L63】【F:server/integrations/BaseAPIClient.ts†L1046-L1097】

## Runtime integration

`IntegrationManager` now asks the `ConnectorFramework` to hydrate a module for
every connected application. The framework merges catalog metadata with the
handlers registered on the concrete client and returns a `ConnectorModule`
object plus normalized rate-limit rules. The manager caches the module per
connection, validates inputs against the module's JSON schemas, and routes every
operation through `module.execute`. Because the executor ultimately delegates to
`BaseAPIClient.execute`, every call automatically benefits from the shared HTTP
transport, retries, and rate-limiting middleware. Unknown operations continue to
fall back to the generic executor when enabled.【F:server/connectors/ConnectorFramework.ts†L320-L430】【F:server/integrations/IntegrationManager.ts†L248-L364】

## Tooling support

The connector CLI generator scaffolds module exports alongside the API client
class so new connectors satisfy the contract immediately. Generated clients
import the shared contract types, register handlers, and expose
`<ConnectorName>Module` via `toConnectorModule`, including authentication
metadata and catalog-derived operations. No additional wiring is required for
IntegrationManager to consume the new connector.【F:scripts/generateAPIClients.ts†L63-L136】

## Migration guidance

Existing clients do not need manual rewrites—the Integration Manager constructs
modules automatically and attaches them to each connection at initialization.
However, bespoke clients can opt-in to richer metadata (custom schemas, extra
operation metadata) by passing overrides into `toConnectorModule`. Tooling and
feature work should prefer the module contract over ad-hoc handler lookups going
forward.
