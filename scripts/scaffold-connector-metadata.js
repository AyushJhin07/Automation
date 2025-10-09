import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const connectorsDir = path.join(rootDir, 'connectors');

const DEFAULT_SCHEMA = Object.freeze({
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  properties: {
    success: {
      type: 'boolean',
      description: 'Indicates whether the operation succeeded.'
    }
  },
  required: ['success'],
  additionalProperties: true
});

const DEFAULT_SAMPLE = Object.freeze({
  success: true
});

const DEFAULT_RUNTIMES = Object.freeze(['appsScript']);

const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

const clone = (value) => JSON.parse(JSON.stringify(value));

const ensureOutputSchema = (entry) => {
  if (!('outputSchema' in entry) || !isRecord(entry.outputSchema)) {
    entry.outputSchema = clone(DEFAULT_SCHEMA);
    return true;
  }

  const schema = entry.outputSchema;
  if (!('$schema' in schema)) {
    schema.$schema = DEFAULT_SCHEMA.$schema;
    return true;
  }

  return false;
};

const ensureSample = (entry) => {
  if (!('sample' in entry) || typeof entry.sample === 'undefined') {
    entry.sample = clone(DEFAULT_SAMPLE);
    return true;
  }

  return false;
};

const ensureRuntimes = (entry) => {
  if (!('runtimes' in entry)) {
    entry.runtimes = [...DEFAULT_RUNTIMES];
    return true;
  }

  const { runtimes } = entry;
  if (!Array.isArray(runtimes) || runtimes.length === 0) {
    entry.runtimes = [...DEFAULT_RUNTIMES];
    return true;
  }

  return false;
};

const ensureFallback = (entry) => {
  if (!('fallback' in entry)) {
    entry.fallback = null;
    return true;
  }

  return false;
};

const ensureDedupe = (entry) => {
  if (!('dedupe' in entry)) {
    entry.dedupe = null;
    return true;
  }

  return false;
};

const processCollection = (collection, { isTrigger }) => {
  if (!collection) {
    return false;
  }

  let changed = false;

  if (Array.isArray(collection)) {
    for (const entry of collection) {
      if (!isRecord(entry)) continue;
      if (ensureRuntimes(entry)) changed = true;
      if (ensureFallback(entry)) changed = true;
      if (ensureOutputSchema(entry)) changed = true;
      if (ensureSample(entry)) changed = true;
      if (isTrigger && ensureDedupe(entry)) changed = true;
    }
    return changed;
  }

  if (isRecord(collection)) {
    for (const entry of Object.values(collection)) {
      if (!isRecord(entry)) continue;
      if (ensureRuntimes(entry)) changed = true;
      if (ensureFallback(entry)) changed = true;
      if (ensureOutputSchema(entry)) changed = true;
      if (ensureSample(entry)) changed = true;
      if (isTrigger && ensureDedupe(entry)) changed = true;
    }
    return changed;
  }

  return changed;
};

async function processDefinition(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  const definition = JSON.parse(raw);
  let mutated = false;

  if (!('schemaVersion' in definition)) {
    definition.schemaVersion = '1.0';
    mutated = true;
  }

  if (processCollection(definition.actions, { isTrigger: false })) {
    mutated = true;
  }

  if (processCollection(definition.triggers, { isTrigger: true })) {
    mutated = true;
  }

  const nextSerialized = `${JSON.stringify(definition, null, 2)}\n`;
  if (nextSerialized !== raw) {
    await fs.writeFile(filePath, nextSerialized, 'utf8');
    mutated = true;
  }

  return mutated;
}

async function main() {
  const entries = await fs.readdir(connectorsDir, { withFileTypes: true });
  let updates = 0;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const definitionPath = path.join(connectorsDir, entry.name, 'definition.json');

    try {
      const stat = await fs.stat(definitionPath);
      if (!stat.isFile()) continue;
    } catch {
      continue;
    }

    const changed = await processDefinition(definitionPath);
    if (changed) {
      updates += 1;
      console.log(`Updated ${entry.name}`);
    }
  }

  console.log(`Processed ${entries.length} directories, updated ${updates} definitions.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
