import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const connectorsDir = path.join(repoRoot, 'connectors');
const TARGET_SCHEMA = 'http://json-schema.org/draft-07/schema#';

type ConnectorDefinition = {
  actions?: Record<string, ConnectorOperation>;
  triggers?: Record<string, ConnectorOperation>;
  [key: string]: unknown;
};

type ConnectorOperation = {
  outputSchema?: { $schema?: string; [key: string]: unknown };
  [key: string]: unknown;
};

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

function ensureSchema(operation: ConnectorOperation | undefined): boolean {
  if (!operation || !operation.outputSchema || typeof operation.outputSchema !== 'object') {
    return false;
  }

  const schemaValue = operation.outputSchema.$schema;
  if (typeof schemaValue === 'string' && schemaValue.trim().length > 0) {
    return false;
  }

  operation.outputSchema.$schema = TARGET_SCHEMA;
  return true;
}

async function processDefinitionFile(file: string): Promise<boolean> {
  const raw = await fs.readFile(file, 'utf8');
  const definition: ConnectorDefinition = JSON.parse(raw);
  let changed = false;

  const groups: Array<Record<string, ConnectorOperation> | undefined> = [
    definition.actions,
    definition.triggers,
  ];

  for (const group of groups) {
    if (!group) continue;

    for (const operation of Object.values(group)) {
      if (ensureSchema(operation)) {
        changed = true;
      }
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
