import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { CONNECTOR_RUNTIME_OVERRIDES, type TriggerRuntimeOverride } from './runtime-defaults.config.ts';

const DEFAULT_TRIGGER_RUNTIMES = Object.freeze(['node'] as const);
const DEFAULT_TRIGGER_FALLBACK: null = null;
const DEFAULT_TRIGGER_DEDUPE = Object.freeze({
  strategy: 'cursor',
  cursor: {
    path: 'cursor',
  },
});

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

type TriggerDefinition = Record<string, any>;

type ConnectorDefinition = {
  id?: string;
  triggers?: unknown;
};

function cloneValue<T>(value: T): T {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  return JSON.parse(JSON.stringify(value));
}

function getTriggerOverride(appId: string, triggerId?: string): TriggerRuntimeOverride | undefined {
  const override = CONNECTOR_RUNTIME_OVERRIDES[appId]?.triggers;
  if (!override) {
    return undefined;
  }

  const resolved: TriggerRuntimeOverride = {};
  if (override.all) {
    Object.assign(resolved, override.all);
  }
  if (triggerId && override.byId?.[triggerId]) {
    Object.assign(resolved, override.byId[triggerId]);
  }

  return Object.keys(resolved).length > 0 ? resolved : undefined;
}

function ensureTriggerDefaults(appId: string, triggerId: string | undefined, trigger: TriggerDefinition): boolean {
  let changed = false;

  const override = getTriggerOverride(appId, triggerId);
  const runtimes = override?.runtimes ?? DEFAULT_TRIGGER_RUNTIMES;
  if (!Array.isArray(trigger.runtimes) || trigger.runtimes.length === 0) {
    trigger.runtimes = [...runtimes];
    changed = true;
  }

  const fallback = override?.fallback ?? DEFAULT_TRIGGER_FALLBACK;
  const hasFallbackKey = Object.prototype.hasOwnProperty.call(trigger, 'fallback');
  if (!hasFallbackKey || trigger.fallback === undefined) {
    trigger.fallback = cloneValue(fallback);
    changed = true;
  } else if (trigger.fallback === null && override?.fallback !== undefined && override.fallback !== null) {
    trigger.fallback = cloneValue(override.fallback);
    changed = true;
  }

  const dedupeOverride = override?.dedupe ?? DEFAULT_TRIGGER_DEDUPE;
  if (!trigger.dedupe || typeof trigger.dedupe !== 'object') {
    trigger.dedupe = cloneValue(dedupeOverride);
    changed = true;
  }

  return changed;
}

function applyDefaults(definition: ConnectorDefinition, appId: string): boolean {
  const triggers = definition.triggers;

  if (!triggers) {
    return false;
  }

  let changed = false;

  if (Array.isArray(triggers)) {
    for (const trigger of triggers) {
      if (trigger && typeof trigger === 'object') {
        const triggerId = typeof trigger.id === 'string' ? trigger.id : undefined;
        if (ensureTriggerDefaults(appId, triggerId, trigger)) {
          changed = true;
        }
      }
    }
    return changed;
  }

  if (typeof triggers === 'object') {
    for (const [key, rawTrigger] of Object.entries(triggers as Record<string, unknown>)) {
      if (rawTrigger && typeof rawTrigger === 'object') {
        const trigger = rawTrigger as TriggerDefinition;
        const triggerId = typeof trigger.id === 'string' ? trigger.id : key;
        if (ensureTriggerDefaults(appId, triggerId, trigger)) {
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
    console.log('No connector trigger defaults required changes.');
  } else {
    console.log(`Updated ${updated} connector definition${updated === 1 ? '' : 's'} with trigger defaults.`);
  }
}

await main();
