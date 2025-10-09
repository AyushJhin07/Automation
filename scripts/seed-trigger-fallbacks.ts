import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const DEFAULT_RUNTIMES = Object.freeze(['node'] as const);
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
  triggers?: unknown;
};

function ensureTriggerDefaults(trigger: TriggerDefinition): boolean {
  let changed = false;

  if (!Array.isArray(trigger.runtimes) || trigger.runtimes.length === 0) {
    trigger.runtimes = [...DEFAULT_RUNTIMES];
    changed = true;
  }

  if (!Object.prototype.hasOwnProperty.call(trigger, 'fallback') || trigger.fallback === undefined) {
    trigger.fallback = null;
    changed = true;
  }

  if (!trigger.dedupe || typeof trigger.dedupe !== 'object') {
    trigger.dedupe = JSON.parse(JSON.stringify(DEFAULT_TRIGGER_DEDUPE));
    changed = true;
  }

  return changed;
}

function applyDefaults(definition: ConnectorDefinition): boolean {
  const triggers = definition.triggers;

  if (!triggers) {
    return false;
  }

  let changed = false;

  if (Array.isArray(triggers)) {
    for (const trigger of triggers) {
      if (trigger && typeof trigger === 'object' && ensureTriggerDefaults(trigger)) {
        changed = true;
      }
    }
    return changed;
  }

  if (typeof triggers === 'object') {
    for (const trigger of Object.values(triggers as Record<string, unknown>)) {
      if (trigger && typeof trigger === 'object' && ensureTriggerDefaults(trigger as TriggerDefinition)) {
        changed = true;
      }
    }
  }

  return changed;
}

async function processDefinition(file: string): Promise<boolean> {
  const raw = await fs.readFile(file, 'utf8');
  let definition: ConnectorDefinition;

  try {
    definition = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Failed to parse ${file}: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!applyDefaults(definition)) {
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
