import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { ALL_RUNTIMES } from '../shared/runtimes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const connectorsDir = path.join(repoRoot, 'connectors');

type ConnectorDefinition = {
  id?: string;
  actions?: ConnectorOperationCollection;
  triggers?: ConnectorOperationCollection;
};

type ConnectorOperationCollection =
  | ConnectorOperation[]
  | Record<string, ConnectorOperation | undefined>
  | undefined;

type ConnectorOperation = {
  id?: string;
  name?: string;
  outputSchema?: {
    $schema?: string;
    [key: string]: unknown;
  } | null;
  sample?: unknown;
  dedupe?: unknown;
  runtimes?: unknown;
  fallback?: unknown;
  [key: string]: unknown;
};

type NormalizedRuntimeEntry = {
  key: string;
  enabled: boolean;
};

const KNOWN_RUNTIMES = new Set(ALL_RUNTIMES);

function normalizeRuntimeEntry(entry: unknown): NormalizedRuntimeEntry | null {
  if (typeof entry === 'string') {
    return { key: entry, enabled: true };
  }

  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const candidate = entry as { key?: unknown; enabled?: unknown };
  if (typeof candidate.key !== 'string') {
    return null;
  }

  if (
    candidate.enabled !== undefined &&
    typeof candidate.enabled !== 'boolean'
  ) {
    return null;
  }

  return {
    key: candidate.key,
    enabled: candidate.enabled !== undefined ? candidate.enabled : true,
  };
}

function validateRuntimes(
  identifier: string,
  runtimes: ConnectorOperation['runtimes'],
  errors: string[],
): { hasKnownRuntime: boolean; enabledCount: number } {
  if (!Array.isArray(runtimes) || runtimes.length === 0) {
    errors.push(`${identifier} is missing a runtimes array`);
    return { hasKnownRuntime: false, enabledCount: 0 };
  }

  const invalidEntries: unknown[] = [];
  const seen = new Set<string>();
  let enabledCount = 0;

  for (const entry of runtimes) {
    const normalized = normalizeRuntimeEntry(entry);
    if (!normalized) {
      invalidEntries.push(entry);
      continue;
    }

    if (!KNOWN_RUNTIMES.has(normalized.key)) {
      invalidEntries.push(entry);
      continue;
    }

    seen.add(normalized.key);
    if (normalized.enabled) {
      enabledCount += 1;
    }
  }

  if (invalidEntries.length > 0) {
    const list = invalidEntries.map((value) => JSON.stringify(value)).join(', ');
    errors.push(`${identifier} has invalid runtime entries: [${list}]`);
  }

  if (seen.size === 0) {
    errors.push(`${identifier} does not specify any valid runtimes`);
  }

  return { hasKnownRuntime: seen.size > 0, enabledCount };
}

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
  if (!operation || typeof operation !== 'object') {
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

  if (
    type === 'trigger' &&
    (!operation.dedupe || typeof operation.dedupe !== 'object')
  ) {
    errors.push(`${identifier} is missing a dedupe configuration`);
  }

  const { enabledCount } = validateRuntimes(identifier, operation.runtimes, errors);
  const hasFallback = operation.fallback !== undefined && operation.fallback !== null;

  if (enabledCount === 0 && !hasFallback) {
    errors.push(`${identifier} must declare at least one enabled runtime or provide a fallback`);
  }
}

function iterateOperations(
  collection: ConnectorOperationCollection,
  callback: (key: string, operation: ConnectorOperation | undefined) => void,
) {
  if (!collection) {
    return;
  }

  if (Array.isArray(collection)) {
    for (const [index, operation] of collection.entries()) {
      const key =
        operation && typeof operation.id === 'string'
          ? operation.id
          : `index ${index}`;
      callback(key, operation);
    }
    return;
  }

  for (const [key, operation] of Object.entries(collection)) {
    callback(key, operation);
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

  iterateOperations(definition.actions, (key, operation) => {
    checkOperation('action', connectorId, key, operation, errors);
  });

  iterateOperations(definition.triggers, (key, operation) => {
    checkOperation('trigger', connectorId, key, operation, errors);
  });
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
