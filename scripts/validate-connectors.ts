import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const connectorsDir = path.join(repoRoot, 'connectors');

type ConnectorDefinition = {
  id?: string;
  actions?: Record<string, ConnectorOperation>;
  triggers?: Record<string, ConnectorOperation>;
};

type ConnectorOperation = {
  name?: string;
  outputSchema?: {
    $schema?: string;
    [key: string]: unknown;
  } | null;
  sample?: unknown;
  [key: string]: unknown;
};

function hasSchemaField(outputSchema: ConnectorOperation['outputSchema']): boolean {
  if (!outputSchema || typeof outputSchema !== 'object') {
    return false;
  }

  const schema = (outputSchema as { $schema?: unknown }).$schema;
  return typeof schema === 'string' && schema.trim().length > 0;
}

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

function checkOperation(
  type: 'action' | 'trigger',
  connectorId: string,
  key: string,
  operation: ConnectorOperation | undefined,
  errors: string[],
) {
  if (!operation) {
    errors.push(`${connectorId}: ${type} "${key}" is undefined`);
    return;
  }

  const identifier = `${connectorId} ${type} "${key}"`;

  if (!operation.outputSchema || typeof operation.outputSchema !== 'object') {
    errors.push(`${identifier} is missing an outputSchema object`);
  } else if (!hasSchemaField(operation.outputSchema)) {
    errors.push(`${identifier} is missing outputSchema.$schema`);
  }

  if (operation.sample === undefined) {
    errors.push(`${identifier} is missing a sample`);
  }
}

async function validateDefinition(file: string, errors: string[]) {
  const raw = await fs.readFile(file, 'utf8');

  let definition: ConnectorDefinition;
  try {
    definition = JSON.parse(raw);
  } catch (error) {
    errors.push(`${path.relative(repoRoot, file)} is not valid JSON: ${(error as Error).message}`);
    return;
  }

  const connectorId = definition.id ?? path.basename(path.dirname(file));

  const entries: Array<['action' | 'trigger', Record<string, ConnectorOperation> | undefined]> = [
    ['action', definition.actions],
    ['trigger', definition.triggers],
  ];

  for (const [type, collection] of entries) {
    if (!collection) {
      continue;
    }

    for (const [key, operation] of Object.entries(collection)) {
      checkOperation(type, connectorId, key, operation, errors);
    }
  }
}

async function main() {
  try {
    await fs.access(connectorsDir);
  } catch {
    console.error('connectors directory not found');
    process.exit(1);
    return;
  }

  const definitionFiles = await findDefinitionFiles(connectorsDir);
  const errors: string[] = [];

  await Promise.all(definitionFiles.map((file) => validateDefinition(file, errors)));

  if (errors.length > 0) {
    console.error('Connector validation failed:');
    for (const message of errors) {
      console.error(` - ${message}`);
    }
    process.exit(1);
  } else {
    console.log(`Validated ${definitionFiles.length} connector definition${definitionFiles.length === 1 ? '' : 's'} successfully.`);
  }
}

await main();
