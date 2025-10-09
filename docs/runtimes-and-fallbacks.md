# Runtime Runtimes and Fallback Reference

This guide consolidates the environment toggles, worker processes, and fallback behaviour that govern the runtime executors. Use it alongside the connector authoring checklist when enabling new runtimes or reviewing fallback expectations.

## Runtime environment variables

- **`GENERIC_EXECUTOR_ENABLED`** – enables the Generic Executor so connector calls can fall back to the HTTP runtime when bespoke handlers are missing or fail. The flag is exposed both through `env.GENERIC_EXECUTOR_ENABLED` and the exported `FLAGS` helper so other services can gate behaviour consistently.【F:server/env.ts†L141-L190】
- **`SANDBOX_EXECUTOR`** – forces the sandbox implementation. Set to `worker` (worker threads) or `process` (child processes) to pin a strategy; otherwise the runtime auto-selects based on the `WORKER_SANDBOX_ENABLED` flag.【F:server/runtime/NodeSandbox.ts†L170-L186】
- **`WORKER_SANDBOX_ENABLED`** – when `true`, the runtime prefers the worker-thread executor. Leave unset to run sandboxes in isolated Node processes (safer for debugging or when worker threads are unstable).【F:server/runtime/NodeSandbox.ts†L170-L186】
- **Resource guard rails** – use `SANDBOX_MAX_CPU_MS`, `SANDBOX_CPU_QUOTA_MS`, `SANDBOX_MAX_MEMORY_MB`, `SANDBOX_CGROUP_ROOT`, `SANDBOX_HEARTBEAT_INTERVAL_MS`, and `SANDBOX_HEARTBEAT_TIMEOUT_MS` to bound sandbox executions and avoid noisy neighbours. The Node sandbox reads these values on boot before running user code.【F:server/runtime/NodeSandbox.ts†L43-L99】

Adjust these knobs per environment. For example, CI can keep short timeouts while production raises the limits but pins the executor mode.

## Worker command matrix

The fastest path to booting the stack locally relies on the packaged scripts. The local-development guide summarises the core commands you should know when switching runtime modes or verifying workers are healthy.【F:docs/local-development.md†L63-L118】

| Command | Purpose |
| --- | --- |
| `npm run dev:api` | Starts the API (and inline worker when `ENABLE_INLINE_WORKER` resolves to `true`). |
| `npm run dev:worker` | Launches the dedicated execution worker that pulls jobs off BullMQ. |
| `npm run dev:scheduler` | Boots the polling scheduler that enqueues trigger-based jobs. |
| `npm run dev:stack` | Supervises the API, worker, scheduler, timers, and encryption rotation processes together, enforcing queue consistency before declaring readiness. |

Use the `start:*` variants in production (`npm run start:worker`, etc.) when running the compiled `dist/` bundle.【F:package.json†L30-L34】

## Fallback resolution flow

1. **Runtime dispatch** – `WorkflowRuntime` resolves connector metadata, executes bespoke handlers through `IntegrationManager`, and records timing/credential context. When the bespoke path fails and the generic executor is enabled, it falls back to `GenericExecutor` and captures the failure reason in node metadata so observers know why a fallback occurred.【F:server/core/WorkflowRuntime.ts†L680-L747】
2. **Integration Manager guardrails** – the manager normalises app identifiers, builds connector modules, and routes requests to bespoke handlers. It tries the generic executor automatically when a connector is unsupported or when a bespoke handler throws a "Function …" error under the feature flag.【F:server/integrations/IntegrationManager.ts†L235-L458】
3. **Runtime registry** – the registry exposes built-in operations and augments them with connector HTTP metadata (`endpoint`/`method`) when `GENERIC_EXECUTOR_ENABLED` is on. The merged registry powers `/api/registry/capabilities`, which lists runtime-ready actions and triggers per app.【F:server/runtime/registry.ts†L100-L309】
4. **Client capability checks** – the frontend caches the capabilities map, providing fallback entries for built-in runtimes and warning users when an operation lacks runtime coverage.【F:client/src/services/runtimeCapabilitiesService.ts†L1-L160】 Runtime unit tests confirm that connectors such as Slack only appear when the generic executor flag is enabled, preventing accidental exposure when bespoke coverage is required.【F:server/runtime/__tests__/registry.capabilities.test.ts†L1-L41】

When adding a new connector or expanding coverage, ensure its definition includes the HTTP metadata needed for the registry to derive fallback routes. Combined with the environment flags above, this keeps runtime behaviour predictable across development, staging, and production.

## Backfilling connector defaults

When we backfill runtime metadata across the catalog, run the automation scripts in order so the generated patches stay repeatable:

1. `tsx scripts/default-actions-to-node.ts` – fills in missing `runtimes: ['node']` and `fallback: null` on every action definition.
2. `tsx scripts/seed-trigger-fallbacks.ts` – adds conservative cursor-based defaults (`runtimes`, `fallback`, and `dedupe`) anywhere a trigger omits them.
3. Review the highest-traffic connectors by hand to tighten the cursor paths, dedupe keys, or runtime overrides before landing the change set.

Recording the sequence keeps contributors aligned on how the defaults were produced and makes it easier to iterate on the seeded values without conflicting local edits.
