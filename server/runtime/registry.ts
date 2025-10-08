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

export const RUNTIME_REGISTRY: Record<string, RuntimeAppOperations> = buildRegistry();

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
