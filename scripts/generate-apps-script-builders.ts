import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  pollingTriggerTemplate,
  restPostActionTemplate,
  retryableFetchActionTemplate,
  todoTemplate,
  webhookReplyTemplate,
  type PollingTriggerTemplateMetadata,
  type RestPostTemplateMetadata,
  type RetryableFetchTemplateMetadata,
  type TodoTemplateMetadata,
  type WebhookReplyTemplateMetadata,
} from '../server/workflow/apps-script-templates.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');

const CONNECTOR_MANIFEST_PATH = resolve(projectRoot, 'server', 'connector-manifest.json');
const OUTPUT_PATH = resolve(projectRoot, 'server', 'workflow', 'realOps.generated.ts');

interface ManifestConnectorEntry {
  id?: string;
  normalizedId?: string;
  definitionPath?: string;
}

interface ConnectorAuthentication {
  type?: string | null;
}

interface ConnectorActionDefinition {
  id?: string | null;
  method?: string | null;
  endpoint?: string | null;
  parameters?: { properties?: Record<string, any> } | null;
  outputSchema?: Record<string, any> | null;
  sample?: Record<string, any> | null;
}

interface ConnectorTriggerDefinition {
  id?: string | null;
  type?: string | null;
  method?: string | null;
  endpoint?: string | null;
  dedupe?: { cursor?: string | null } | null;
  parameters?: { properties?: Record<string, any> } | null;
  outputSchema?: Record<string, any> | null;
  sample?: Record<string, any> | null;
}

interface ConnectorDefinition {
  baseUrl?: string | null;
  authentication?: ConnectorAuthentication | null;
  actions?: ConnectorActionDefinition[];
  triggers?: ConnectorTriggerDefinition[];
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

const PAGINATION_PARAM_HINTS = [
  'cursor',
  'page',
  'page_size',
  'pagesize',
  'page_number',
  'page_token',
  'pagetoken',
  'next_token',
  'nexttoken',
  'offset',
  'starting_after',
  'ending_before',
  'limit',
];

function deriveBaseUrl(connector: ConnectorDefinition): string | null {
  const candidateKeys = ['baseUrl', 'baseURL', 'apiUrl', 'apiURL', 'restUrl'];
  for (const key of candidateKeys) {
    const value = (connector as Record<string, any>)[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function normalizeMethod(method: string | null | undefined): string | null {
  if (!method || typeof method !== 'string') {
    return null;
  }
  const normalized = method.trim().toUpperCase();
  return normalized.length > 0 ? normalized : null;
}

function collectKeys(source: unknown, depth = 0, target: Set<string> = new Set()): Set<string> {
  if (!source || depth > 4) {
    return target;
  }
  if (Array.isArray(source)) {
    source.forEach(entry => collectKeys(entry, depth + 1, target));
    return target;
  }
  if (typeof source !== 'object') {
    return target;
  }
  for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
    target.add(key);
    collectKeys(value, depth + 1, target);
  }
  return target;
}

function detectPaginationParam(definition: ConnectorActionDefinition | ConnectorTriggerDefinition): string | null {
  const parameterKeys = Object.keys(definition?.parameters?.properties ?? {});
  for (const key of parameterKeys) {
    const normalized = key.toLowerCase();
    if (PAGINATION_PARAM_HINTS.includes(normalized)) {
      return key;
    }
  }

  const outputKeys = collectKeys(definition?.outputSchema ?? {});
  const sampleKeys = collectKeys(definition?.sample ?? {});
  const combined = new Set<string>([...outputKeys, ...sampleKeys]);
  for (const key of combined) {
    const normalized = key.toLowerCase();
    if (normalized.includes('next_cursor')) {
      return 'cursor';
    }
    if (normalized.includes('nextpagetoken') || normalized.includes('next_page_token')) {
      return 'pageToken';
    }
    if (normalized.includes('nexttoken') || normalized.includes('next_token')) {
      return 'nextToken';
    }
    if (normalized.includes('offset')) {
      return 'offset';
    }
  }

  return null;
}

function buildTodoOperation(
  type: OperationType,
  connectorId: string,
  operationId: string
): GeneratedOperation {
  const key = buildOperationKey(type, connectorId, operationId);
  const functionName = buildFunctionName(type, connectorId, operationId);
  const backlogTag = `APPS_SCRIPT_BACKLOG#${connectorId}`;
  const metadata: TodoTemplateMetadata = {
    key,
    functionName,
    connectorId,
    operationId,
    backlogTag,
  };

  return {
    key,
    connectorId,
    operationId,
    type,
    code: todoTemplate(metadata),
  };
}

function buildActionOperation(
  connectorId: string,
  operationId: string,
  connector: ConnectorDefinition,
  action: ConnectorActionDefinition
): GeneratedOperation {
  const key = buildOperationKey('action', connectorId, operationId);
  const functionName = buildFunctionName('action', connectorId, operationId);
  const method = normalizeMethod(action?.method) ?? 'GET';
  const endpoint = typeof action?.endpoint === 'string' ? action.endpoint.trim() : '';
  const baseUrl = deriveBaseUrl(connector);
  const authType = connector.authentication?.type ?? null;
  const paginationParam = detectPaginationParam(action);

  if (endpoint && baseUrl && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const metadata: RestPostTemplateMetadata = {
      key,
      functionName,
      connectorId,
      operationId,
      method,
      baseUrl,
      endpoint,
      authType,
      hasPagination: false,
    };
    return {
      key,
      connectorId,
      operationId,
      type: 'action',
      code: restPostActionTemplate(metadata),
    };
  }

  if (endpoint && baseUrl) {
    const metadata: RetryableFetchTemplateMetadata = {
      key,
      functionName,
      connectorId,
      operationId,
      method,
      baseUrl,
      endpoint,
      authType,
      paginationParam,
      hasPagination: Boolean(paginationParam),
    };
    return {
      key,
      connectorId,
      operationId,
      type: 'action',
      code: retryableFetchActionTemplate(metadata),
    };
  }

  return buildTodoOperation('action', connectorId, operationId);
}

function buildTriggerOperation(
  connectorId: string,
  operationId: string,
  connector: ConnectorDefinition,
  trigger: ConnectorTriggerDefinition
): GeneratedOperation {
  const key = buildOperationKey('trigger', connectorId, operationId);
  const functionName = buildFunctionName('trigger', connectorId, operationId);
  const triggerType = (trigger?.type ?? '').toLowerCase();

  if (triggerType === 'webhook') {
    const metadata: WebhookReplyTemplateMetadata = {
      key,
      functionName,
      connectorId,
      operationId,
    };
    return {
      key,
      connectorId,
      operationId,
      type: 'trigger',
      code: webhookReplyTemplate(metadata),
    };
  }

  if (triggerType === 'polling') {
    const endpoint = typeof trigger?.endpoint === 'string' ? trigger.endpoint.trim() : '';
    const baseUrl = deriveBaseUrl(connector);
    if (endpoint && baseUrl) {
      const authType = connector.authentication?.type ?? null;
      const paginationParam = detectPaginationParam(trigger);
      const metadata: PollingTriggerTemplateMetadata = {
        key,
        functionName,
        connectorId,
        operationId,
        method: normalizeMethod(trigger?.method) ?? 'GET',
        baseUrl,
        endpoint,
        authType,
        paginationParam,
        hasPagination: Boolean(paginationParam),
        cursorProperty: trigger?.dedupe?.cursor ?? null,
      };
      return {
        key,
        connectorId,
        operationId,
        type: 'trigger',
        code: pollingTriggerTemplate(metadata),
      };
    }
  }

  return buildTodoOperation('trigger', connectorId, operationId);
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
      const generated = buildActionOperation(connectorId, operationId, parsed, action);
      if (seenKeys.has(generated.key)) {
        duplicateKeys.add(generated.key);
        continue;
      }
      operations.push(generated);
      seenKeys.add(generated.key);
    }

    for (const trigger of triggerDefs) {
      const operationId = sanitizeOperationId(trigger?.id);
      if (!operationId) {
        continue;
      }
      const generated = buildTriggerOperation(connectorId, operationId, parsed, trigger);
      if (seenKeys.has(generated.key)) {
        duplicateKeys.add(generated.key);
        continue;
      }
      operations.push(generated);
      seenKeys.add(generated.key);
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
