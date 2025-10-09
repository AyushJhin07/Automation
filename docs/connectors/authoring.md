# Connector Authoring Checklist

Use this guide when shipping or updating connector definitions so runtime coverage, fallback semantics, and schema metadata remain consistent. Pair it with the runtime reference for environment details.

## Required runtime metadata (`runtimes` and `fallback`)

Every action and trigger definition must declare a `runtimes` array plus a `fallback` key so the runtime registry, Generic Executor, and debugging surfaces stay in sync. The catalog automation scripts enforce those fields when seeding defaults, but new contributions should include them up front to avoid churn in follow-up passes.【F:scripts/default-actions-to-node.ts†L63-L113】【F:scripts/seed-trigger-fallbacks.ts†L69-L125】 When you add bespoke fallback handling, document the HTTP behaviour directly in the manifest and cross-link the [Runtime Environment and Fallback Guide](../runtimes-and-fallbacks.md) for reviewers who need environment context.

The connector validator rejects manifests that omit runtime coverage, reference unknown runtime keys, or rely on disabled runtimes without providing a fallback path.【F:scripts/validate-connectors.ts†L140-L177】 Pair bespoke runtime overrides with accurate metadata so reviewers see the same execution story that production users experience.

## Declare runtime coverage (`runtimes`)

Runtime support is derived from the HTTP metadata in each action or trigger. When an operation includes an `endpoint` and `method`, the runtime registry registers it for the Generic Executor. When `GENERIC_EXECUTOR_ENABLED` is true, those operations are merged into the runtime capability map returned by `/api/registry/capabilities`, which the editor uses to highlight whether a node will run inside the runtime sandbox.【F:server/runtime/registry.ts†L100-L309】【F:client/src/services/runtimeCapabilitiesService.ts†L1-L160】【F:server/runtime/__tests__/registry.capabilities.test.ts†L1-L41】 Include a `runtimes` block in your definition (or generator) that mirrors this information so reviewers and tooling can audit which actions/triggers are safe to execute at runtime.

```jsonc
{
  "runtimes": {
    "actions": ["send_message", "create_ticket"],
    "triggers": ["message_posted"]
  }
}
```

## Document fallback behaviour (`fallback`)

Bespoke handlers always run first. If they are missing or emit a "Function …" error, `IntegrationManager` falls back to the Generic Executor when the feature flag is on.【F:server/integrations/IntegrationManager.ts†L332-L459】 `WorkflowRuntime` records the executor that satisfied the call and preserves the fallback error in node metadata so operators can audit what happened.【F:server/core/WorkflowRuntime.ts†L680-L747】 Use a `fallback` section to summarise the HTTP shape (endpoint, method, error messaging) the runtime should expect. This context helps runtime reviewers understand the consequences of enabling the generic path and gives customer success teams language to use when they encounter `integrationFallbackReason` entries in metadata.

## Provide output schemas and samples

Every action and trigger must include an `outputSchema` with a `$schema` pointer and at least one `sample` payload. The `npm run check:connectors` lint step fails when either field is missing and double-checks that runtime metadata and fallbacks stay consistent.【F:scripts/validate-connectors.ts†L140-L177】 Good samples make reviews faster—see the Google Calendar trigger for an example that pairs a schema with a lightweight sample.【F:connectors/google-calendar/definition.json†L824-L864】

## Configure trigger deduplication (`dedupe`)

Triggers also require a `dedupe` object so the platform can suppress repeats. The validator enforces that triggers provide a structured dedupe configuration, and the Google Calendar definition demonstrates the expected `strategy`/`path` pattern.【F:scripts/validate-connectors.ts†L164-L175】【F:connectors/google-calendar/definition.json†L857-L863】 Reuse existing strategies where possible so downstream persistence components can keep working without changes.

## Seed runtime defaults automatically

Run `npm run scaffold:runtimes` to backfill missing runtime metadata after editing manifests. The helper chains the action and trigger seeders so `runtimes`, `fallback`, and `dedupe` values remain consistent across the catalog.【F:package.json†L52-L56】【F:scripts/default-actions-to-node.ts†L63-L183】【F:scripts/seed-trigger-fallbacks.ts†L69-L195】 When a connector needs a non-Node runtime or bespoke default, add an entry to `CONNECTOR_RUNTIME_OVERRIDES` so future runs respect the override without touching every manifest.【F:scripts/runtime-defaults.config.ts†L1-L61】

## Run the connector lint suite

Before opening a pull request, run the local validator:

```bash
npm run check:connectors
```

The command is also part of `npm run lint` and runs after the end-to-end coverage suite (`npm run test`), so catching issues locally keeps CI green and coverage pipelines fast.【F:package.json†L39-L60】 Add any new guidance or known exceptions to this document so future authors inherit the same guard rails.
