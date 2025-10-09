# Runtime Environment and Fallback Guide

This guide consolidates the configuration flags, worker commands, metadata expectations, and troubleshooting workflows that govern runtime execution. Pair it with the connector authoring checklist when enabling new runtimes or reviewing fallback behaviour.

## Runtime environment variables

| Variable | Purpose |
| --- | --- |
| `GENERIC_EXECUTOR_ENABLED` | Enables the Generic Executor so connector calls can fall back to the HTTP runtime when bespoke handlers are missing or fail. The flag is exposed via `env.GENERIC_EXECUTOR_ENABLED` and the exported `FLAGS` helper so other services can gate behaviour consistently.【F:server/env.ts†L141-L190】 |
| `SANDBOX_EXECUTOR` | Forces the sandbox implementation. Set to `worker` (worker threads) or `process` (child processes); otherwise the runtime auto-selects based on `WORKER_SANDBOX_ENABLED`.【F:server/runtime/NodeSandbox.ts†L170-L186】 |
| `WORKER_SANDBOX_ENABLED` | When `true`, the runtime prefers the worker-thread executor. Leave unset to run sandboxes in isolated Node processes (safer for debugging or when worker threads are unstable).【F:server/runtime/NodeSandbox.ts†L170-L186】 |
| Resource guard rails | Use `SANDBOX_MAX_CPU_MS`, `SANDBOX_CPU_QUOTA_MS`, `SANDBOX_MAX_MEMORY_MB`, `SANDBOX_CGROUP_ROOT`, `SANDBOX_HEARTBEAT_INTERVAL_MS`, and `SANDBOX_HEARTBEAT_TIMEOUT_MS` to bound sandbox executions and avoid noisy neighbours. The Node sandbox reads these values on boot before running user code.【F:server/runtime/NodeSandbox.ts†L43-L99】 |

Adjust these knobs per environment—CI typically keeps short timeouts while production raises the limits but pins the executor mode.

## Worker lifecycle commands

The quickest way to boot the stack relies on the packaged scripts. Use these during local work or when verifying worker health:

| Command | Purpose |
| --- | --- |
| `npm run dev:api` | Starts the API (and inline worker when `ENABLE_INLINE_WORKER` resolves to `true`). |
| `npm run dev:worker` | Launches the dedicated execution worker that pulls jobs off BullMQ. |
| `npm run dev:scheduler` | Boots the polling scheduler that enqueues trigger-based jobs. |
| `npm run dev:stack` | Supervises the API, worker, scheduler, timers, and encryption rotation processes together, enforcing queue consistency before declaring readiness. |

Use the `start:*` variants in production (`npm run start:worker`, etc.) when running the compiled `dist/` bundle.【F:package.json†L30-L34】 For setup steps and environment prerequisites, see the [Local Development guide](./local-development.md#4-next-steps).【F:docs/local-development.md†L61-L108】

## Planning runtime metadata

Runtime coverage comes from the connector manifest. `IntegrationManager` first routes calls to bespoke handlers and falls back to the Generic Executor only when the feature flag is enabled and the bespoke path errors.【F:server/integrations/IntegrationManager.ts†L332-L459】 `WorkflowRuntime` records which executor actually satisfied the node and preserves the fallback error in metadata so operators can audit the reason later.【F:server/core/WorkflowRuntime.ts†L680-L747】 The runtime registry exposes the merged capabilities map so the client can highlight supported operations in the editor.【F:server/runtime/registry.ts†L100-L309】【F:client/src/services/runtimeCapabilitiesService.ts†L1-L416】

To keep that surface area predictable:

1. **List every runtime-capable operation.** Include a `runtimes` array for each action and trigger so reviewers and tooling can audit which operations are safe to execute. The Slack connector demonstrates the pattern by enumerating supported runtimes alongside the HTTP metadata.【F:connectors/slack/definition.json†L92-L104】
2. **Describe the fallback shape.** Even when you do not have a bespoke fallback implementation yet, explicitly set `fallback` to `null`. Automation scripts enforce this on actions and triggers so manifests cannot omit the key entirely.【F:scripts/default-actions-to-node.ts†L35-L49】【F:scripts/seed-trigger-fallbacks.ts†L41-L59】 When you do define an HTTP fallback plan, summarise the endpoint, method, and error contract inside the `fallback` object so runtime reviewers understand the risk envelope.
3. **Seed defaults consistently.** Run the backfill utilities (`tsx scripts/default-actions-to-node.ts`, `tsx scripts/seed-trigger-fallbacks.ts`) in order when bulk-updating the catalog to avoid churn across pull requests.【F:scripts/default-actions-to-node.ts†L35-L75】【F:scripts/seed-trigger-fallbacks.ts†L41-L80】

## Example manifest snippets

### Action with explicit runtime coverage

```jsonc
{
  "id": "send_message",
  "endpoint": "/chat.postMessage",
  "method": "POST",
  "runtimes": ["node", "appsScript"],
  "fallback": null
}
```

The Slack connector publishes this shape so the registry can mark `send_message` as runtime-ready in both Node.js and Apps Script sandboxes.【F:connectors/slack/definition.json†L92-L104】

### Trigger fallback outline

```jsonc
{
  "id": "ticket_created",
  "endpoint": "/v2/tickets",
  "method": "GET",
  "runtimes": ["node"],
  "fallback": {
    "cursor": "next_page_token",
    "dedupe": {
      "strategy": "cursor",
      "cursor": { "path": "id" }
    },
    "notes": "Polling fallback until webhook is available."
  }
}
```

When introducing a fallback object, match the fields to what the runtime needs for pagination and deduplication so operators can translate the plan directly into Generic Executor behaviour. Use the defaults from the seeding scripts as a baseline and expand them with connector-specific context.【F:scripts/seed-trigger-fallbacks.ts†L1-L66】

## Troubleshooting runtime availability

- **Understanding UI badges.** The workflow editor tags each operation with a badge that reflects the merged runtime capabilities index. A green “Runtime ready” badge indicates native coverage, amber “Fallback” badges show the runtime that will execute via the Generic Executor, and red “Unavailable” badges block dragging altogether.【F:client/src/components/workflow/ProfessionalGraphEditor.tsx†L1680-L1736】 The right-hand inspector surfaces the same status and explains whether the limitation is a fallback or a gap in runtime support.【F:client/src/components/workflow/RightInspectorPanel.tsx†L188-L226】
- **Interpreting fallback logs.** When an execution falls back, `WorkflowRuntime` logs the failure reason and stamps `metadata.integrationFallbackReason` on the node so the inspector and run history show why the fallback path triggered.【F:server/core/WorkflowRuntime.ts†L680-L747】 Pair that with the connector manifest’s `fallback` notes to confirm the runtime behaved as planned.

Armed with these signals, you can validate runtime coverage before rollout, triage unexpected fallbacks quickly, and coordinate manifest updates with environment flag changes.
