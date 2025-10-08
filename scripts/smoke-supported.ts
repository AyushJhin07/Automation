#!/usr/bin/env tsx
import { promises as fs } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

type JsonSchema = {
  type?: string | string[];
  const?: any;
  enum?: any[];
  default?: any;
  examples?: any[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema | JsonSchema[];
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  allOf?: JsonSchema[];
  format?: string;
  minimum?: number;
  exclusiveMinimum?: number;
  maximum?: number;
  exclusiveMaximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  pattern?: string;
  additionalProperties?: boolean | JsonSchema;
  description?: string;
};

type ConnectorAction = {
  id: string;
  name?: string;
  description?: string;
  parameters?: JsonSchema;
};

type ConnectorTrigger = {
  id: string;
  name?: string;
  description?: string;
  parameters?: JsonSchema;
};

type ConnectorDefinition = {
  id: string;
  name?: string;
  authentication?: Record<string, any> | null;
  actions?: ConnectorAction[] | Record<string, ConnectorAction>;
  triggers?: ConnectorTrigger[] | Record<string, ConnectorTrigger>;
};

type RuntimeCapability = {
  app: string;
  actions: string[];
  triggers: string[];
};

type SmokeStatus = 'OK' | 'SKIP' | 'FAIL';

type SmokeResult = {
  app: string;
  functionId: string;
  type: 'action' | 'trigger';
  status: SmokeStatus;
  message?: string;
  fallback?: boolean;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, '..');
const CONNECTORS_DIR = join(ROOT_DIR, 'connectors');

const TOKEN =
  process.env.SMOKE_AUTH_TOKEN ??
  process.env.AUTH_TOKEN ??
  process.env.API_TOKEN ??
  process.env.BEARER_TOKEN;

const ORGANIZATION_ID =
  process.env.SMOKE_ORGANIZATION_ID ??
  process.env.ORGANIZATION_ID ??
  process.env.ORG_ID ??
  process.env.X_ORGANIZATION_ID;

const USER_ID = process.env.SMOKE_USER_ID ?? process.env.USER_ID;

const BASE_URL =
  process.env.SMOKE_BASE_URL ??
  process.env.API_BASE_URL ??
  (process.env.HOST && process.env.PORT
    ? `http://${process.env.HOST}:${process.env.PORT}`
    : `http://127.0.0.1:${process.env.PORT ?? '3000'}`);

const GENERIC_EXECUTOR_ENABLED = process.env.GENERIC_EXECUTOR_ENABLED === 'true';

if (!TOKEN) {
  console.error('❌ Missing auth token. Set SMOKE_AUTH_TOKEN (or AUTH_TOKEN/API_TOKEN).');
  process.exit(1);
}

if (!ORGANIZATION_ID) {
  console.error('❌ Missing organization id. Set SMOKE_ORGANIZATION_ID (or ORGANIZATION_ID).');
  process.exit(1);
}

if (!GENERIC_EXECUTOR_ENABLED) {
  console.warn('⚠️ GENERIC_EXECUTOR_ENABLED is not true. Generic executions may be rejected.');
}

async function fetchCapabilities(): Promise<RuntimeCapability[]> {
  const response = await fetch(`${BASE_URL}/api/registry/capabilities`, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'x-organization-id': ORGANIZATION_ID,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to load capabilities (${response.status}): ${text}`);
  }

  const payload = await response.json();
  if (!payload?.success || !Array.isArray(payload.capabilities)) {
    throw new Error('Invalid capabilities response.');
  }

  return payload.capabilities as RuntimeCapability[];
}

async function loadConnectorDefinition(appId: string): Promise<ConnectorDefinition | null> {
  try {
    const definitionPath = join(CONNECTORS_DIR, appId, 'definition.json');
    const raw = await fs.readFile(definitionPath, 'utf-8');
    return JSON.parse(raw) as ConnectorDefinition;
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function selectSchema(schema?: JsonSchema | null, depth = 0): JsonSchema | undefined {
  if (!schema) {
    return undefined;
  }

  if (schema.anyOf?.length) {
    return selectSchema(schema.anyOf[0], depth + 1);
  }
  if (schema.oneOf?.length) {
    return selectSchema(schema.oneOf[0], depth + 1);
  }
  if (schema.allOf?.length) {
    return schema.allOf.reduce<JsonSchema | undefined>((acc, part) => {
      if (!acc) {
        return selectSchema(part, depth + 1);
      }
      const next = selectSchema(part, depth + 1) ?? {};
      return { ...acc, ...next } as JsonSchema;
    }, undefined);
  }

  return schema;
}

function sampleValue(schema?: JsonSchema, depth = 0): any {
  const resolved = selectSchema(schema, depth);
  if (!resolved) {
    return undefined;
  }

  if (Object.prototype.hasOwnProperty.call(resolved, 'const')) {
    return resolved.const;
  }
  if (resolved.enum && resolved.enum.length > 0) {
    return resolved.enum[0];
  }
  if (Object.prototype.hasOwnProperty.call(resolved, 'default')) {
    return resolved.default;
  }
  if (resolved.examples && resolved.examples.length > 0) {
    return resolved.examples[0];
  }

  const schemaType = Array.isArray(resolved.type) ? resolved.type[0] : resolved.type;

  switch (schemaType) {
    case 'string': {
      if (resolved.format === 'date-time') {
        return new Date().toISOString();
      }
      if (resolved.format === 'date') {
        return new Date().toISOString().slice(0, 10);
      }
      if (resolved.format === 'email') {
        return 'example@example.com';
      }
      if (resolved.format === 'uri' || resolved.format === 'url') {
        return 'https://example.com/resource';
      }
      if (resolved.format === 'uuid') {
        return '00000000-0000-4000-8000-000000000000';
      }
      if (resolved.pattern) {
        return resolved.pattern.replace(/[^a-z0-9]/gi, '') || 'sample';
      }
      const length = resolved.minLength ?? 0;
      const base = 'sample-value';
      if (length > base.length) {
        return base.padEnd(length, 'x');
      }
      return base;
    }
    case 'number':
    case 'integer': {
      const min = resolved.minimum ?? resolved.exclusiveMinimum ?? 1;
      const max = resolved.maximum ?? resolved.exclusiveMaximum ?? min;
      if (Number.isFinite(min)) {
        return min;
      }
      if (Number.isFinite(max)) {
        return max;
      }
      return 1;
    }
    case 'boolean': {
      return true;
    }
    case 'array': {
      if (depth > 5) {
        return [];
      }
      const minItems = Math.max(0, resolved.minItems ?? 0);
      const targetLength = Math.min(Math.max(minItems, 1), 3);
      const itemsSchema = Array.isArray(resolved.items) ? resolved.items[0] : resolved.items;
      const itemValue = sampleValue(itemsSchema, depth + 1);
      if (itemValue === undefined) {
        return [];
      }
      return Array.from({ length: targetLength }, () => itemValue);
    }
    case 'object':
    case undefined: {
      const props = resolved.properties ?? {};
      const required = Array.isArray(resolved.required) ? resolved.required : [];
      const result: Record<string, any> = {};
      for (const key of required) {
        const value = sampleValue(props[key], depth + 1);
        if (value !== undefined) {
          result[key] = value;
        }
      }
      if (required.length === 0) {
        const entries = Object.entries(props);
        if (entries.length > 0) {
          const [key, valueSchema] = entries[0];
          const value = sampleValue(valueSchema, depth + 1);
          if (value !== undefined) {
            result[key] = value;
          }
        }
      }
      if (Object.keys(result).length === 0 && resolved.additionalProperties && typeof resolved.additionalProperties === 'object') {
        result['key'] = sampleValue(resolved.additionalProperties, depth + 1) ?? 'sample-value';
      }
      return result;
    }
    default:
      return null;
  }
}

function normalizeActionsBucket(bucket?: ConnectorDefinition['actions']): ConnectorAction[] {
  if (!bucket) {
    return [];
  }
  if (Array.isArray(bucket)) {
    return bucket;
  }
  return Object.values(bucket);
}

function normalizeTriggersBucket(bucket?: ConnectorDefinition['triggers']): ConnectorTrigger[] {
  if (!bucket) {
    return [];
  }
  if (Array.isArray(bucket)) {
    return bucket;
  }
  return Object.values(bucket);
}

function buildCredentials(definition: ConnectorDefinition | null): Record<string, any> {
  const base: Record<string, any> = {
    accessToken: 'test-access-token',
    refreshToken: 'test-refresh-token',
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    apiKey: 'test-api-key',
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    username: 'test-user',
    password: 'test-password',
    accountId: 'test-account-id',
    subdomain: 'example',
    domain: 'example.com',
    region: 'us',
    tenantId: 'test-tenant-id',
  };

  if (!definition?.authentication) {
    return base;
  }

  const auth: any = definition.authentication;
  const type = String(auth.type ?? '').toLowerCase();

  if (type === 'api_key' || type === 'apikey') {
    return {
      ...base,
      apiKey: 'test-api-key',
    };
  }

  if (type === 'basic') {
    return {
      ...base,
      username: 'demo-user',
      password: 'demo-password',
    };
  }

  if (type === 'oauth2' || type === 'oauth') {
    return {
      ...base,
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
    };
  }

  if (auth.schema && typeof auth.schema === 'object') {
    const schemaValue = sampleValue(auth.schema as JsonSchema, 0);
    if (schemaValue && typeof schemaValue === 'object') {
      return { ...base, ...schemaValue };
    }
  }

  if (Array.isArray(auth.fields)) {
    const extras: Record<string, any> = {};
    for (const field of auth.fields) {
      if (!field?.name) {
        continue;
      }
      extras[field.name] = 'sample-value';
    }
    return { ...base, ...extras };
  }

  return base;
}

function buildParameters(action: ConnectorAction | ConnectorTrigger | null | undefined): Record<string, any> {
  if (!action?.parameters) {
    return {};
  }

  const value = sampleValue(action.parameters, 0);
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }

  return {};
}

type WorkflowNode = {
  id: string;
  type: string;
  label?: string;
  data: Record<string, any>;
  params?: Record<string, any>;
};

type WorkflowGraph = {
  id: string;
  name: string;
  description?: string;
  nodes: WorkflowNode[];
  edges: Array<{ id: string; from: string; to: string }>;
  metadata?: Record<string, any>;
};

function sanitizeId(value: string): string {
  return value.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toLowerCase();
}

function buildWorkflowGraph(
  appId: string,
  functionId: string,
  parameters: Record<string, any>,
  credentials: Record<string, any>,
  action: ConnectorAction | null,
): { workflowId: string; graph: WorkflowGraph; nodeId: string } {
  const workflowId = `smoke_${sanitizeId(appId)}_${sanitizeId(functionId)}`;
  const nodeId = `action_${sanitizeId(functionId) || 'primary'}`;
  const node: WorkflowNode = {
    id: nodeId,
    type: `action.${appId}.${functionId}`,
    label: action?.name || `${appId}.${functionId}`,
    data: {
      app: appId,
      function: functionId,
      label: action?.name || `${appId}.${functionId}`,
      description: action?.description ?? undefined,
      parameters,
      credentials,
      metadata: { preview: true, source: 'smoke-supported' },
    },
    params: {
      ...parameters,
      credentials,
    },
  };

  const graph: WorkflowGraph = {
    id: workflowId,
    name: `Smoke ${appId}.${functionId}`,
    description: action?.description ?? `Smoke execution for ${appId}.${functionId}`,
    nodes: [node],
    edges: [],
    metadata: { preview: true, mode: 'preview', runMode: 'preview', executionMode: 'preview' },
  };

  return { workflowId, graph, nodeId };
}

function detectFallback(nodeResult: any): { fallback: boolean; reason?: string } {
  if (!nodeResult || typeof nodeResult !== 'object') {
    return { fallback: false };
  }

  const diagnostics = nodeResult.result?.diagnostics;
  if (diagnostics && typeof diagnostics.executor === 'string' && diagnostics.executor !== 'integration') {
    return {
      fallback: true,
      reason: `Executor=${diagnostics.executor}`,
    };
  }

  const logs: string[] = [];
  const candidateLogs = nodeResult.result?.logs;
  if (Array.isArray(candidateLogs)) {
    for (const entry of candidateLogs) {
      if (typeof entry === 'string') {
        logs.push(entry);
      }
    }
  }
  if (typeof nodeResult.result?.summary === 'string') {
    logs.push(nodeResult.result.summary);
  }

  const match = logs.find(log => /fallback|generic executor/i.test(log));
  if (match) {
    return { fallback: true, reason: match };
  }

  return { fallback: false };
}

async function executeAction(
  appId: string,
  functionId: string,
  definition: ConnectorDefinition | null,
  action: ConnectorAction | null,
): Promise<SmokeResult> {
  const parameters = buildParameters(action);
  const baseCredentials = buildCredentials(definition);
  const credentials = {
    ...baseCredentials,
    __organizationId: ORGANIZATION_ID,
    __userId: USER_ID ?? 'smoke-runner',
  };
  const { workflowId, graph, nodeId } = buildWorkflowGraph(appId, functionId, parameters, credentials, action);

  try {
    const response = await fetch(`${BASE_URL}/api/executions/dry-run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TOKEN}`,
        'x-organization-id': String(ORGANIZATION_ID),
        'x-execution-mode': 'preview',
      },
      body: JSON.stringify({
        workflowId,
        graph,
        options: {
          stopOnError: true,
          preview: true,
          executionMode: 'preview',
        },
      }),
    });

    const text = await response.text();
    let payload: any;
    try {
      payload = text ? JSON.parse(text) : undefined;
    } catch {
      payload = { success: false, error: 'Invalid JSON response', raw: text };
    }

    if (!response.ok) {
      return {
        app: appId,
        functionId,
        type: 'action',
        status: 'FAIL',
        message: payload?.error || `HTTP ${response.status}`,
      };
    }

    if (!payload?.success || !payload.execution?.nodes) {
      const message = typeof payload?.error === 'string' ? payload.error : 'Dry run response missing node results';
      return {
        app: appId,
        functionId,
        type: 'action',
        status: 'FAIL',
        message,
      };
    }

    const nodeResult = payload.execution.nodes[nodeId];
    if (!nodeResult) {
      return {
        app: appId,
        functionId,
        type: 'action',
        status: 'FAIL',
        message: 'Node result missing from dry run payload',
      };
    }

    if (nodeResult.status !== 'success') {
      const message =
        typeof nodeResult.error?.message === 'string'
          ? nodeResult.error.message
          : typeof nodeResult.error === 'string'
          ? nodeResult.error
          : 'Dry run execution failed';
      return {
        app: appId,
        functionId,
        type: 'action',
        status: 'FAIL',
        message,
      };
    }

    const fallback = detectFallback(nodeResult);
    const summary = typeof nodeResult.result?.summary === 'string' ? nodeResult.result.summary : 'Success';

    return {
      app: appId,
      functionId,
      type: 'action',
      status: 'OK',
      message: fallback.fallback && fallback.reason ? `Fallback: ${fallback.reason}` : summary,
      fallback: fallback.fallback,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      app: appId,
      functionId,
      type: 'action',
      status: 'FAIL',
      message,
    };
  }
}

function findAction(definition: ConnectorDefinition | null, functionId: string): ConnectorAction | null {
  if (!definition) {
    return null;
  }
  const actions = normalizeActionsBucket(definition.actions);
  return actions.find(action => action.id === functionId) ?? null;
}

function findTrigger(definition: ConnectorDefinition | null, functionId: string): ConnectorTrigger | null {
  if (!definition) {
    return null;
  }
  const triggers = normalizeTriggersBucket(definition.triggers);
  return triggers.find(trigger => trigger.id === functionId) ?? null;
}

function formatRow(columns: string[], widths: number[]): string {
  return `| ${columns.map((col, index) => col.padEnd(widths[index], ' ')).join(' | ')} |`;
}

function printSummary(results: SmokeResult[]): void {
  const headers = ['App', 'Function', 'Type', 'Status', 'Fallback', 'Message'];
  const widths = headers.map((header, index) =>
    Math.max(
      header.length,
      ...results.map(result => {
        const value =
          index === 0
            ? result.app
            : index === 1
            ? result.functionId
            : index === 2
            ? result.type
            : index === 3
            ? result.status
            : index === 4
            ? (result.fallback ? 'yes' : '')
            : result.message ?? '';
        return value?.length ?? 0;
      }),
    ),
  );

  console.log('\nRuntime capability smoke summary');
  console.log('-'.repeat(widths.reduce((acc, width) => acc + width + 3, 1)));
  console.log(formatRow(headers, widths));
  console.log(formatRow(widths.map(width => '-'.repeat(width)), widths));

  for (const result of results) {
    const message = result.message ?? '';
    console.log(
      formatRow(
        [
          result.app,
          result.functionId,
          result.type,
          result.status,
          result.fallback ? 'yes' : '',
          message,
        ],
        widths,
      ),
    );
  }

  const stats = results.reduce(
    (acc, result) => {
      acc[result.status] += 1;
      return acc;
    },
    { OK: 0, SKIP: 0, FAIL: 0 } as Record<SmokeStatus, number>,
  );

  const fallbackCount = results.filter(result => result.fallback).length;

  console.log('\nTotals:');
  console.log(`  OK:   ${stats.OK}`);
  console.log(`  SKIP: ${stats.SKIP}`);
  console.log(`  FAIL: ${stats.FAIL}`);
  console.log(`  Fallback: ${fallbackCount}`);
}

async function run(): Promise<void> {
  console.log(`🔍 Fetching runtime capabilities from ${BASE_URL}`);
  const capabilities = await fetchCapabilities();

  const results: SmokeResult[] = [];

  for (const capability of capabilities) {
    const definition = await loadConnectorDefinition(capability.app);
    if (!definition) {
      console.warn(`⚠️ No connector definition found for ${capability.app}; marking actions as skipped.`);
    }

    for (const actionId of capability.actions) {
      console.log(`🚀 Executing ${capability.app}.${actionId}`);
      const actionDefinition = findAction(definition, actionId);
      if (!actionDefinition) {
        results.push({
          app: capability.app,
          functionId: actionId,
          type: 'action',
          status: 'SKIP',
          message: 'Definition not found',
        });
        continue;
      }

      const result = await executeAction(capability.app, actionId, definition, actionDefinition);
      results.push(result);
    }

    for (const triggerId of capability.triggers) {
      const triggerDefinition = findTrigger(definition, triggerId);
      const reason = triggerDefinition ? 'Trigger execution not supported' : 'Definition not found';
      results.push({
        app: capability.app,
        functionId: triggerId,
        type: 'trigger',
        status: 'SKIP',
        message: reason,
      });
    }
  }

  printSummary(results);

  const hasFailure = results.some(result => result.status === 'FAIL');
  if (hasFailure) {
    process.exit(1);
  }
}

run().catch(error => {
  console.error('❌ smoke-supported failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
