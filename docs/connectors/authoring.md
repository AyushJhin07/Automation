# Connector Authoring Checklist

Use this guide when shipping or updating connector definitions so runtime coverage, fallback semantics, and schema metadata remain consistent. Pair it with the runtime reference for environment details.

## Required runtime metadata (`runtimes` and `fallback`)

Every action and trigger definition must declare a `runtimes` array plus a `fallback` key so the runtime registry, Generic Executor, and debugging surfaces stay in sync. The catalog automation scripts enforce those fields when seeding defaults, but new contributions should include them up front to avoid churn in follow-up passes.【F:scripts/default-actions-to-node.ts†L35-L75】【F:scripts/seed-trigger-fallbacks.ts†L41-L80】 When you add bespoke fallback handling, document the HTTP behaviour directly in the manifest and cross-link the [Runtime Environment and Fallback Guide](../runtimes-and-fallbacks.md) for reviewers who need environment context.

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

Every action and trigger must include an `outputSchema` with a `$schema` pointer and at least one `sample` payload. The `npm run check:connectors` lint step fails when either field is missing.【F:scripts/validate-connectors.ts†L16-L135】 Good samples make reviews faster—see the Google Calendar trigger for an example that pairs a schema with a lightweight sample.【F:connectors/google-calendar/definition.json†L824-L864】

## Configure trigger deduplication (`dedupe`)

Triggers also require a `dedupe` object so the platform can suppress repeats. The validator enforces that triggers provide a structured dedupe configuration, and the Google Calendar definition demonstrates the expected `strategy`/`path` pattern.【F:scripts/validate-connectors.ts†L52-L81】【F:connectors/google-calendar/definition.json†L857-L863】 Reuse existing strategies where possible so downstream persistence components can keep working without changes.

## Run the connector lint suite

Before opening a pull request, run the local validator:

```bash
npm run check:connectors
```

The command is also part of `npm run lint`, so catching issues locally keeps CI green.【F:package.json†L39-L59】 Add any new guidance or known exceptions to this document so future authors inherit the same guard rails.
