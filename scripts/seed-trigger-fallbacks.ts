import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

type TriggerDefinition = {
  id?: string;
  runtimes?: unknown;
  fallback?: unknown;
  dedupe?: unknown;
  [key: string]: unknown;
};

type TriggerBucket = TriggerDefinition[] | Record<string, TriggerDefinition>;

type ConnectorDefinition = {
  triggers?: TriggerBucket | null;
};

type TriggerDefaults = {
  runtimes?: string[] | null;
  fallback?: unknown;
  dedupe?: unknown;
};

type ConnectorTriggerOverrides = {
  skip?: boolean;
  defaults?: TriggerDefaults;
  triggers?: Record<string, TriggerDefaults>;
};

const DEFAULT_TRIGGER_DEDUPE = Object.freeze({
  strategy: 'cursor',
  cursor: {
    path: 'cursor',
  },
});

const GLOBAL_TRIGGER_DEFAULTS: Required<TriggerDefaults> = Object.freeze({
  runtimes: ['node'],
  fallback: null,
  dedupe: DEFAULT_TRIGGER_DEDUPE,
});

const CONNECTOR_TRIGGER_OVERRIDES: Record<string, ConnectorTriggerOverrides> = {
  // Add connector specific overrides here as needed.
  // Example:
  // 'hubspot-enhanced': {
  //   defaults: { dedupe: { strategy: 'id', path: 'id' } },
  //   triggers: {
  //     contact_updated: { dedupe: { strategy: 'cursor', cursor: { path: 'occurredAt' } } },
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

function mergeDefaults(base: TriggerDefaults, source?: TriggerDefaults): TriggerDefaults {
  if (!source) {
    return base;
  }

  const merged: TriggerDefaults = { ...base };

  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined) {
      (merged as Record<string, unknown>)[key] = value as unknown;
    }
  }

  return merged;
}

function buildTriggerDefaults(connectorId: string, triggerId?: string): TriggerDefaults {
  const connectorConfig = CONNECTOR_TRIGGER_OVERRIDES[connectorId];
  const base = mergeDefaults(GLOBAL_TRIGGER_DEFAULTS, connectorConfig?.defaults);

  if (!triggerId || !connectorConfig?.triggers) {
    return base;
  }

  const triggerOverride = connectorConfig.triggers[triggerId];
  if (!triggerOverride) {
    return base;
  }

  return mergeDefaults(base, triggerOverride);
}

function cloneValue<T>(value: T): T {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function resolveTriggerId(trigger: TriggerDefinition, fallbackId?: string): string | undefined {
  if (typeof trigger.id === 'string' && trigger.id.length > 0) {
    return trigger.id;
  }
  if (fallbackId) {
    return fallbackId;
  }
  return undefined;
}

function ensureTriggerDefaults(
  trigger: TriggerDefinition,
  connectorId: string,
  fallbackId?: string,
): boolean {
  const connectorConfig = CONNECTOR_TRIGGER_OVERRIDES[connectorId];
  if (connectorConfig?.skip) {
    return false;
  }

  const triggerId = resolveTriggerId(trigger, fallbackId);
  const defaults = buildTriggerDefaults(connectorId, triggerId);

  let changed = false;

  if (defaults.runtimes !== undefined) {
    const runtimes = trigger.runtimes;
    if (!Array.isArray(runtimes) || runtimes.length === 0 || !runtimes.every(item => typeof item === 'string')) {
      trigger.runtimes = defaults.runtimes === null ? null : cloneValue(defaults.runtimes);
      changed = true;
    }
  }

  if (defaults.fallback !== undefined) {
    if (!Object.prototype.hasOwnProperty.call(trigger, 'fallback') || trigger.fallback === undefined) {
      trigger.fallback = cloneValue(defaults.fallback);
      changed = true;
    }
  }

  if (defaults.dedupe !== undefined) {
    const dedupe = trigger.dedupe;
    if (
      !Object.prototype.hasOwnProperty.call(trigger, 'dedupe') ||
      dedupe === undefined ||
      dedupe === null ||
      typeof dedupe !== 'object' ||
      Array.isArray(dedupe)
    ) {
      trigger.dedupe = cloneValue(defaults.dedupe);
      changed = true;
    }
  }

  return changed;
}

function applyDefaults(definition: ConnectorDefinition, connectorId: string): boolean {
  const triggers = definition.triggers;

  if (!triggers) {
    return false;
  }

  const connectorConfig = CONNECTOR_TRIGGER_OVERRIDES[connectorId];
  if (connectorConfig?.skip) {
    return false;
  }

  let changed = false;

  if (Array.isArray(triggers)) {
    for (const trigger of triggers) {
      if (trigger && typeof trigger === 'object' && ensureTriggerDefaults(trigger, connectorId)) {
        changed = true;
      }
    }
    return changed;
  }

  if (typeof triggers === 'object') {
    for (const [key, trigger] of Object.entries(triggers)) {
      if (trigger && typeof trigger === 'object' && ensureTriggerDefaults(trigger, connectorId, key)) {
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
    console.log('No connector trigger defaults required changes.');
  } else {
    console.log(`Updated ${updated} connector definition${updated === 1 ? '' : 's'} with trigger defaults.`);
  }
}

await main();
