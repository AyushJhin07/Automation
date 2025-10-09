import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { CONNECTOR_RUNTIME_OVERRIDES, type ActionRuntimeOverride } from './runtime-defaults.config.ts';

const DEFAULT_ACTION_RUNTIMES = Object.freeze(['node'] as const);
const DEFAULT_FALLBACK: null = null;

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

type ActionDefinition = Record<string, any>;

type ConnectorDefinition = {
  id?: string;
  actions?: unknown;
};

function cloneValue<T>(value: T): T {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  return JSON.parse(JSON.stringify(value));
}

function getActionOverride(appId: string, actionId?: string): ActionRuntimeOverride | undefined {
  const override = CONNECTOR_RUNTIME_OVERRIDES[appId]?.actions;
  if (!override) {
    return undefined;
  }

  const resolved: ActionRuntimeOverride = {};
  if (override.all) {
    Object.assign(resolved, override.all);
  }
  if (actionId && override.byId?.[actionId]) {
    Object.assign(resolved, override.byId[actionId]);
  }

  return Object.keys(resolved).length > 0 ? resolved : undefined;
}

function ensureActionDefaults(appId: string, actionId: string | undefined, action: ActionDefinition): boolean {
  let changed = false;

  const override = getActionOverride(appId, actionId);
  const runtimes = override?.runtimes ?? DEFAULT_ACTION_RUNTIMES;
  if (!Array.isArray(action.runtimes) || action.runtimes.length === 0) {
    action.runtimes = [...runtimes];
    changed = true;
  }

  const fallback = override?.fallback ?? DEFAULT_FALLBACK;
  const hasFallbackKey = Object.prototype.hasOwnProperty.call(action, 'fallback');
  if (!hasFallbackKey || action.fallback === undefined) {
    action.fallback = cloneValue(fallback);
    changed = true;
  } else if (action.fallback === null && override?.fallback !== undefined && override.fallback !== null) {
    action.fallback = cloneValue(override.fallback);
    changed = true;
  }

  return changed;
}

function applyDefaults(definition: ConnectorDefinition, appId: string): boolean {
  const actions = definition.actions;

  if (!actions) {
    return false;
  }

  let changed = false;

  if (Array.isArray(actions)) {
    for (const action of actions) {
      if (action && typeof action === 'object') {
        const actionId = typeof action.id === 'string' ? action.id : undefined;
        if (ensureActionDefaults(appId, actionId, action)) {
          changed = true;
        }
      }
    }
    return changed;
  }

  if (typeof actions === 'object') {
    for (const [key, rawAction] of Object.entries(actions as Record<string, unknown>)) {
      if (rawAction && typeof rawAction === 'object') {
        const action = rawAction as ActionDefinition;
        const actionId = typeof action.id === 'string' ? action.id : key;
        if (ensureActionDefaults(appId, actionId, action)) {
          changed = true;
        }
      }
    }
  }

  return changed;
}

function getConnectorId(file: string): string | null {
  const relative = path.relative(connectorsDir, file);
  if (relative.startsWith('..')) {
    return null;
  }
  const [connectorId] = relative.split(path.sep);
  return connectorId ?? null;
}

async function processDefinition(file: string): Promise<{ updated: boolean; connectorId: string | null }> {
  const connectorId = getConnectorId(file);
  if (!connectorId) {
    return { updated: false, connectorId: null };
  }

  const raw = await fs.readFile(file, 'utf8');
  let definition: ConnectorDefinition;

  try {
    definition = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Failed to parse ${file}: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!applyDefaults(definition, connectorId)) {
    return { updated: false, connectorId };
  }

  const formatted = `${JSON.stringify(definition, null, 2)}\n`;
  await fs.writeFile(file, formatted, 'utf8');
  return { updated: true, connectorId };
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
    const { updated: fileUpdated, connectorId } = await processDefinition(file);
    if (fileUpdated) {
      updated += 1;
      const displayId = connectorId ? `${connectorId}/definition.json` : path.relative(repoRoot, file);
      console.log(`Updated ${displayId}`);
    }
  }

  if (updated === 0) {
    console.log('No connector action defaults required changes.');
  } else {
    console.log(`Updated ${updated} connector definition${updated === 1 ? '' : 's'} with action defaults.`);
  }
}

await main();
