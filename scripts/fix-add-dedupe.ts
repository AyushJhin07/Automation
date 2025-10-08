import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const DEFAULT_DEDUPE = Object.freeze({
  strategy: 'id',
  path: 'id',
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const connectorsDir = path.join(repoRoot, 'connectors');

async function findDefinitionFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

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

function ensureDedupe(trigger) {
  if (!trigger || typeof trigger !== 'object') {
    return false;
  }

  if (trigger.dedupe && typeof trigger.dedupe === 'object') {
    return false;
  }

  trigger.dedupe = { ...DEFAULT_DEDUPE };
  return true;
}

async function processDefinitionFile(file) {
  const raw = await fs.readFile(file, 'utf8');
  let definition;

  try {
    definition = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Failed to parse ${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const triggers = definition?.triggers;
  let changed = false;

  if (!triggers || typeof triggers !== 'object') {
    return false;
  }

  for (const trigger of Object.values(triggers)) {
    if (ensureDedupe(trigger)) {
      changed = true;
    }
  }

  if (changed) {
    const formatted = `${JSON.stringify(definition, null, 2)}\n`;
    await fs.writeFile(file, formatted, 'utf8');
  }

  return changed;
}

async function main() {
  try {
    await fs.access(connectorsDir);
  } catch {
    console.error('connectors directory not found');
    process.exit(1);
  }

  const definitionFiles = await findDefinitionFiles(connectorsDir);
  let updatedCount = 0;

  for (const file of definitionFiles) {
    if (await processDefinitionFile(file)) {
      updatedCount += 1;
      console.log(`Updated ${path.relative(repoRoot, file)}`);
    }
  }

  if (updatedCount === 0) {
    console.log('No connector definitions required updates.');
  } else {
    console.log(`Updated ${updatedCount} connector definition${updatedCount === 1 ? '' : 's'}.`);
  }
}

await main();
