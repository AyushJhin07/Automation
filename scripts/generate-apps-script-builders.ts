import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');

const CONNECTOR_MANIFEST_PATH = resolve(projectRoot, 'server', 'connector-manifest.json');
const OUTPUT_PATH = resolve(projectRoot, 'server', 'workflow', 'realOps.generated.ts');
const BACKLOG_REFERENCE = 'docs/apps-script-rollout/backlog.md';

interface ManifestConnectorEntry {
  id?: string;
  normalizedId?: string;
  definitionPath?: string;
}

interface ConnectorDefinition {
  actions?: Array<{ id?: string | null }>;
  triggers?: Array<{ id?: string | null }>;
}

type OperationType = 'action' | 'trigger';

export interface GeneratedOperation {
  key: string;
  connectorId: string;
  operationId: string;
  type: OperationType;
  code: string;
}

function sanitizeConnectorId(rawId: string | undefined): string {
  return (rawId ?? '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/_/g, '-')
    .toLowerCase();
}

function sanitizeOperationId(rawId: string | null | undefined): string {
  return (rawId ?? '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function encodeSingleQuoted(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function buildOperationKey(type: OperationType, connectorId: string, operationId: string): string {
  return `${type}.${connectorId}:${operationId}`;
}

function buildFunctionName(type: OperationType, connectorId: string, operationId: string): string {
  const prefix = type === 'trigger' ? 'trigger' : 'step';
  const raw = `${type}_${connectorId}_${operationId}`
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  return `${prefix}_${raw}`;
}

function buildOperationStub(
  type: OperationType,
  connectorId: string,
  operationId: string
): GeneratedOperation {
  const key = buildOperationKey(type, connectorId, operationId);
  const functionName = buildFunctionName(type, connectorId, operationId);
  const backlogTag = `APPS_SCRIPT_BACKLOG#${connectorId}`;
  const lines = [
    `function ${functionName}(ctx) {`,
    `  // TODO(${backlogTag}): Implement ${key} Apps Script handler.`,
    `  logWarn('apps_script_builder_todo', { connector: '${encodeSingleQuoted(connectorId)}', operation: '${encodeSingleQuoted(key)}' });`,
    `  throw new Error('TODO[apps-script-backlog]: Implement ${key}. See ${BACKLOG_REFERENCE}.');`,
    `}`,
  ];

  return {
    key,
    connectorId,
    operationId,
    type,
    code: lines.join('\n'),
  };
}

async function loadConnectorDefinitions(): Promise<GeneratedOperation[]> {
  const manifestRaw = await readFile(CONNECTOR_MANIFEST_PATH, 'utf-8');
  const manifestJson = JSON.parse(manifestRaw) as { connectors?: ManifestConnectorEntry[] };
  const connectors = Array.isArray(manifestJson.connectors) ? manifestJson.connectors : [];

  const operations: GeneratedOperation[] = [];
  const seenKeys = new Set<string>();
  const duplicateKeys = new Set<string>();

  for (const entry of connectors) {
    const connectorId = sanitizeConnectorId(entry.normalizedId ?? entry.id);
    const definitionPath = entry.definitionPath ? entry.definitionPath.trim() : '';

    if (!connectorId || !definitionPath) {
      continue;
    }

    const resolvedDefinitionPath = resolve(projectRoot, definitionPath);
    const rawDefinition = await readFile(resolvedDefinitionPath, 'utf-8');
    const parsed = JSON.parse(rawDefinition) as ConnectorDefinition;

    const actionDefs = Array.isArray(parsed.actions) ? parsed.actions : [];
    const triggerDefs = Array.isArray(parsed.triggers) ? parsed.triggers : [];

    for (const action of actionDefs) {
      const operationId = sanitizeOperationId(action?.id);
      if (!operationId) {
        continue;
      }
      const stub = buildOperationStub('action', connectorId, operationId);
      if (seenKeys.has(stub.key)) {
        duplicateKeys.add(stub.key);
        continue;
      }
      operations.push(stub);
      seenKeys.add(stub.key);
    }

    for (const trigger of triggerDefs) {
      const operationId = sanitizeOperationId(trigger?.id);
      if (!operationId) {
        continue;
      }
      const stub = buildOperationStub('trigger', connectorId, operationId);
      if (seenKeys.has(stub.key)) {
        duplicateKeys.add(stub.key);
        continue;
      }
      operations.push(stub);
      seenKeys.add(stub.key);
    }
  }

  operations.sort((a, b) => a.key.localeCompare(b.key));

  if (duplicateKeys.size > 0) {
    console.warn('⚠️ Skipped duplicate Apps Script builder keys:');
    for (const key of Array.from(duplicateKeys).sort()) {
      console.warn(`   • ${key}`);
    }
  }

  return operations;
}

function buildFileContent(operations: GeneratedOperation[]): string {
  const header = `/**\n * THIS FILE IS AUTO-GENERATED.\n * Generated by scripts/generate-apps-script-builders.ts\n * Do not edit this file directly.\n */\n\n`;
  const entries = operations
    .map(op => {
      const encodedKey = encodeSingleQuoted(op.key);
      return `  '${encodedKey}': (_config) => \`\n${op.code}\n\``;
    })
    .join(',\n\n');

  return `${header}export const GENERATED_REAL_OPS: Record<string, (config: any) => string> = {\n${entries}\n};\n`;
}

export async function buildGeneratedRealOps(): Promise<{ operations: GeneratedOperation[]; content: string }> {
  const operations = await loadConnectorDefinitions();
  const content = buildFileContent(operations);
  return { operations, content };
}

export interface GenerateOptions {
  check?: boolean;
}

export async function generateAppsScriptBuilders(options: GenerateOptions = {}): Promise<void> {
  const { check = false } = options;
  const { content, operations } = await buildGeneratedRealOps();

  if (check) {
    try {
      const existing = await readFile(OUTPUT_PATH, 'utf-8');
      if (existing.trim() !== content.trim()) {
        console.error('❌ Apps Script REAL_OPS builders are out of date.');
        console.error('Run "npm run build:apps-script" to regenerate realOps.generated.ts.');
        process.exitCode = 1;
      } else {
        console.log('✅ Apps Script REAL_OPS builders are up to date.');
      }
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err && err.code === 'ENOENT') {
        console.error('❌ Apps Script builder output is missing.');
        console.error('Run "npm run build:apps-script" to create server/workflow/realOps.generated.ts.');
      } else {
        console.error('❌ Failed to load existing realOps.generated.ts during check.');
        console.error(error);
      }
      process.exitCode = 1;
    }
    return;
  }

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, content, 'utf-8');
  console.log(`✅ Wrote ${operations.length} Apps Script builder stubs to ${OUTPUT_PATH}`);
}

if (import.meta.url === `file://${__filename}`) {
  const check = process.argv.includes('--check');
  generateAppsScriptBuilders({ check }).catch(error => {
    console.error('❌ Failed to generate Apps Script builders.');
    console.error(error);
    process.exitCode = 1;
  });
}
