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

`IntegrationManager` now builds and caches modules for every connected
application. Modules are created by combining definition metadata from the
`ConnectorRegistry` with the handler registrations exposed by the concrete
client. Parameters are validated against the module's operation schemas using an
AJV instance before delegating to the underlying client. Failed schema
compilation is logged as a warning but does not block execution. When an unknown
operation is requested the manager falls back to the generic executor (when
enabled).【F:server/integrations/IntegrationManager.ts†L360-L458】【F:server/integrations/IntegrationManager.ts†L618-L833】

## Tooling support

The connector CLI generator now scaffolds module exports alongside the legacy
API client class. Generated clients import the shared contract types and expose
`<ConnectorName>Module`, returning the wrapped module via `toConnectorModule`
with the connector's authentication metadata baked in. This ensures new
connectors automatically participate in the contract without hand-written glue
code.【F:scripts/generateAPIClients.ts†L63-L118】

## Migration guidance

Existing clients do not need manual rewrites—the Integration Manager constructs
modules automatically and attaches them to each connection at initialization.
However, bespoke clients can opt-in to richer metadata (custom schemas, extra
operation metadata) by passing overrides into `toConnectorModule`. Tooling and
feature work should prefer the module contract over ad-hoc handler lookups going
forward.
