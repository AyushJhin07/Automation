import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const connectorsDir = path.join(rootDir, 'connectors');

const DEFAULT_SCHEMA = {
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
};

const DEFAULT_SAMPLE = {
  success: true
};

const clone = (value) => JSON.parse(JSON.stringify(value));

const ensureOutputArtifacts = (entry) => {
  if (!('outputSchema' in entry) || entry.outputSchema === undefined) {
    entry.outputSchema = clone(DEFAULT_SCHEMA);
  }

  if (!('sample' in entry) || entry.sample === undefined) {
    entry.sample = clone(DEFAULT_SAMPLE);
  }
};

async function processManifest(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  const manifest = JSON.parse(raw);

  let mutated = false;

  if (!manifest.schemaVersion) {
    manifest.schemaVersion = '1.0';
    mutated = true;
  }

  const collections = [
    Array.isArray(manifest.actions) ? manifest.actions : undefined,
    Array.isArray(manifest.triggers) ? manifest.triggers : undefined
  ];

  for (const collection of collections) {
    if (!collection) continue;

    for (const entry of collection) {
      const beforeSchema = JSON.stringify(entry.outputSchema);
      const beforeSample = JSON.stringify(entry.sample);

      ensureOutputArtifacts(entry);

      if (JSON.stringify(entry.outputSchema) !== beforeSchema) {
        mutated = true;
      }

      if (JSON.stringify(entry.sample) !== beforeSample) {
        mutated = true;
      }
    }
  }

  const serialized = JSON.stringify(manifest, null, 2) + '\n';

  if (serialized !== raw) {
    await fs.writeFile(filePath, serialized, 'utf8');
    mutated = true;
  }

  return mutated;
}

async function main() {
  const entries = await fs.readdir(connectorsDir, { withFileTypes: true });
  let updatedCount = 0;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(connectorsDir, entry.name, 'definition.json');

    try {
      const stat = await fs.stat(manifestPath);
      if (!stat.isFile()) continue;
    } catch {
      continue;
    }

    const changed = await processManifest(manifestPath);
    if (changed) {
      updatedCount += 1;
      console.log(`Updated ${entry.name}`);
    }
  }

  console.log(`Processed ${entries.length} connector directories. Updated ${updatedCount} manifests.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
