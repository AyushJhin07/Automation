import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

type ActionDefinition = {
  id?: string;
  runtimes?: unknown;
  fallback?: unknown;
  dedupe?: unknown;
  [key: string]: unknown;
};

type ActionBucket = ActionDefinition[] | Record<string, ActionDefinition>;

type ConnectorDefinition = {
  actions?: ActionBucket | null;
};

type FunctionDefaults = {
  runtimes?: string[] | null;
  fallback?: unknown;
  dedupe?: unknown;
};

type ConnectorActionOverrides = {
  /** Skip processing this connector entirely. */
  skip?: boolean;
  /** Defaults applied to every action before falling back to the global defaults. */
  defaults?: FunctionDefaults;
  /** Per-action overrides keyed by action id (or dictionary key). */
  actions?: Record<string, FunctionDefaults>;
};

const GLOBAL_ACTION_DEFAULTS: Required<FunctionDefaults> = Object.freeze({
  runtimes: ['node'],
  fallback: null,
  dedupe: null,
});

const CONNECTOR_ACTION_OVERRIDES: Record<string, ConnectorActionOverrides> = {
  // Add connector specific overrides here as needed.
  // Example:
  // 'salesforce-enhanced': {
  //   defaults: { runtimes: ['node', 'python'] },
  //   actions: {
  //     query: { fallback: { strategy: 'generic' } },
  //   },
  // },
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const connectorsDir = path.join(repoRoot, 'connectors');

async function findDefinitionFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await findDefinitionFiles(fullPath)));
    } else if (entry.isFile() && entry.name === 'definition.json') {
      files.push(fullPath);
    }
  }

  return files;
}

function mergeDefaults(base: FunctionDefaults, source?: FunctionDefaults): FunctionDefaults {
  if (!source) {
    return base;
  }

  const merged: FunctionDefaults = { ...base };

  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined) {
      (merged as Record<string, unknown>)[key] = value as unknown;
    }
  }

  return merged;
}

function buildActionDefaults(connectorId: string, actionId?: string): FunctionDefaults {
  const connectorConfig = CONNECTOR_ACTION_OVERRIDES[connectorId];
  const base = mergeDefaults(GLOBAL_ACTION_DEFAULTS, connectorConfig?.defaults);

  if (!actionId || !connectorConfig?.actions) {
    return base;
  }

  const actionOverride = connectorConfig.actions[actionId];
  if (!actionOverride) {
    return base;
  }

  return mergeDefaults(base, actionOverride);
}

function cloneValue<T>(value: T): T {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function resolveActionId(action: ActionDefinition, fallbackId?: string): string | undefined {
  if (typeof action.id === 'string' && action.id.length > 0) {
    return action.id;
  }
  if (fallbackId) {
    return fallbackId;
  }
  return undefined;
}

function ensureActionDefaults(
  action: ActionDefinition,
  connectorId: string,
  fallbackId?: string,
): boolean {
  const connectorConfig = CONNECTOR_ACTION_OVERRIDES[connectorId];
  if (connectorConfig?.skip) {
    return false;
  }

  const actionId = resolveActionId(action, fallbackId);
  const defaults = buildActionDefaults(connectorId, actionId);

  let changed = false;

  if (defaults.runtimes !== undefined) {
    const runtimes = action.runtimes;
    if (!Array.isArray(runtimes) || runtimes.length === 0 || !runtimes.every(item => typeof item === 'string')) {
      action.runtimes = defaults.runtimes === null ? null : cloneValue(defaults.runtimes);
      changed = true;
    }
  }

  if (defaults.fallback !== undefined) {
    if (!Object.prototype.hasOwnProperty.call(action, 'fallback') || action.fallback === undefined) {
      action.fallback = cloneValue(defaults.fallback);
      changed = true;
    }
  }

  if (defaults.dedupe !== undefined) {
    if (!Object.prototype.hasOwnProperty.call(action, 'dedupe') || action.dedupe === undefined) {
      action.dedupe = cloneValue(defaults.dedupe);
      changed = true;
    }
  }

  return changed;
}

function applyDefaults(definition: ConnectorDefinition, connectorId: string): boolean {
  const actions = definition.actions;

  if (!actions) {
    return false;
  }

  const connectorConfig = CONNECTOR_ACTION_OVERRIDES[connectorId];
  if (connectorConfig?.skip) {
    return false;
  }

  let changed = false;

  if (Array.isArray(actions)) {
    for (const action of actions) {
      if (action && typeof action === 'object' && ensureActionDefaults(action, connectorId)) {
        changed = true;
      }
    }
    return changed;
  }

  if (typeof actions === 'object') {
    for (const [key, action] of Object.entries(actions)) {
      if (action && typeof action === 'object' && ensureActionDefaults(action, connectorId, key)) {
        changed = true;
      }
    }
  }

  return changed;
}

function getConnectorId(definitionPath: string): string {
  const relative = path.relative(connectorsDir, definitionPath);
  const [connectorId] = relative.split(path.sep);
  return connectorId;
}

async function processDefinition(file: string): Promise<boolean> {
  const raw = await fs.readFile(file, 'utf8');
  let definition: ConnectorDefinition;

  try {
    definition = JSON.parse(raw) as ConnectorDefinition;
  } catch (error) {
    throw new Error(`Failed to parse ${file}: ${error instanceof Error ? error.message : String(error)}`);
  }

  const connectorId = getConnectorId(file);

  if (!applyDefaults(definition, connectorId)) {
    return false;
  }

  const formatted = `${JSON.stringify(definition, null, 2)}\n`;
  await fs.writeFile(file, formatted, 'utf8');
  return true;
}

async function main(): Promise<void> {
  try {
    await fs.access(connectorsDir);
  } catch {
    console.error('connectors directory not found');
    process.exit(1);
    return;
  }

  const files = await findDefinitionFiles(connectorsDir);
  let updated = 0;

  for (const file of files) {
    if (await processDefinition(file)) {
      updated += 1;
      console.log(`Updated ${path.relative(repoRoot, file)}`);
    }
  }

  if (updated === 0) {
    console.log('No connector action defaults required changes.');
  } else {
    console.log(`Updated ${updated} connector definition${updated === 1 ? '' : 's'} with action defaults.`);
  }
}

await main();
