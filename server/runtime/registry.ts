import { buildOperationKeyCandidates, getRuntimeOpHandlers } from '../workflow/compiler/op-map.js';

export interface RuntimeAppOperations {
  actions: Record<string, unknown>;
  triggers: Record<string, unknown>;
}

export interface RuntimeCapabilitySummary {
  app: string;
  actions: string[];
  triggers: string[];
}

const BUILTIN_RUNTIME_OPERATIONS: Array<{
  type: 'action' | 'trigger';
  app: string;
  operation: string;
}> = [
  { type: 'action', app: 'http', operation: 'request' },
  { type: 'action', app: 'llm', operation: 'generate' },
  { type: 'action', app: 'llm', operation: 'extract' },
  { type: 'action', app: 'llm', operation: 'classify' },
  { type: 'action', app: 'llm', operation: 'tool_call' },
  { type: 'trigger', app: 'webhook', operation: 'inbound' },
  { type: 'trigger', app: 'time', operation: 'cron' },
  { type: 'trigger', app: 'time', operation: 'manual' },
];

function buildRegistry(): Record<string, RuntimeAppOperations> {
  const handlers = getRuntimeOpHandlers();
  const registry: Record<string, RuntimeAppOperations> = {};

  for (const [key, handler] of Object.entries(handlers)) {
    const match = key.match(/^(action|trigger)\.([^:.]+)[:.](.+)$/);
    if (!match) {
      continue;
    }

    const [, category, app, operation] = match;
    const bucket = (registry[app] ||= { actions: {}, triggers: {} });

    if (category === 'trigger') {
      bucket.triggers[operation] = handler;
    } else {
      bucket.actions[operation] = handler;
    }
  }

  return registry;
}

const RUNTIME_HANDLERS = getRuntimeOpHandlers();
const RUNTIME_HANDLER_KEYS = new Set(Object.keys(RUNTIME_HANDLERS));

function injectBuiltinRuntimeEntries(
  registry: Record<string, RuntimeAppOperations>,
  handlerKeySet: Set<string>,
): void {
  for (const builtin of BUILTIN_RUNTIME_OPERATIONS) {
    const bucket = (registry[builtin.app] ||= { actions: {}, triggers: {} });
    if (builtin.type === 'action') {
      bucket.actions[builtin.operation] = true;
    } else {
      bucket.triggers[builtin.operation] = true;
    }

    const candidates = buildOperationKeyCandidates(builtin.app, builtin.operation, builtin.type);
    for (const candidate of candidates) {
      handlerKeySet.add(candidate);
    }
  }
}

const runtimeRegistry = buildRegistry();
injectBuiltinRuntimeEntries(runtimeRegistry, RUNTIME_HANDLER_KEYS);

export const RUNTIME_REGISTRY: Record<string, RuntimeAppOperations> = runtimeRegistry;

export function getRuntimeCapabilities(): RuntimeCapabilitySummary[] {
  return Object.entries(RUNTIME_REGISTRY)
    .map(([app, ops]) => ({
      app,
      actions: Object.keys(ops.actions).sort(),
      triggers: Object.keys(ops.triggers).sort(),
    }))
    .sort((a, b) => a.app.localeCompare(b.app));
}

export function hasRuntimeImplementation(
  type: 'action' | 'trigger',
  app: string,
  operation: string,
): boolean {
  if (!app || !operation) {
    return false;
  }

  const candidates = buildOperationKeyCandidates(app, operation, type);
  return candidates.some(candidate => RUNTIME_HANDLER_KEYS.has(candidate));
}
