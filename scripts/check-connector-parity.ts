import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

type ConnectorAvailability = 'stable' | 'experimental' | 'disabled' | null;

type ManifestConnector = {
  id: string;
  normalizedId: string;
  definitionPath: string;
  availability: ConnectorAvailability;
};

type IntegrationInfo = {
  canonicalId: string;
  rawName: string;
  filePath: string;
  handlers: Set<string>;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT_DIR, 'server', 'connector-manifest.json');
const INTEGRATIONS_DIR = path.join(ROOT_DIR, 'server', 'integrations');

const IGNORED_CLIENT_BASENAMES = new Set([
  'BaseAPIClient',
  'GenericAPIClient',
  'GenericExecutor',
  'IntegrationManager',
  'LocalCoreAPIClients',
  'Normalizers',
  'RateLimiter',
  'RequestValidator',
  'SchemaRegistry',
]);

function canonicalize(value: string): string {
  return value.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

async function loadManifestConnectors(): Promise<ManifestConnector[]> {
  const rawContent = await fs.readFile(MANIFEST_PATH, 'utf8');
  const manifest = JSON.parse(rawContent) as { connectors?: Array<{ id: string; normalizedId?: string; definitionPath: string }>; };

  if (!manifest.connectors || !Array.isArray(manifest.connectors)) {
    throw new Error('connector-manifest.json is missing a "connectors" array');
  }

  const results: ManifestConnector[] = [];

  for (const entry of manifest.connectors) {
    if (!entry || typeof entry !== 'object') {
      throw new Error('connector-manifest.json contains an invalid entry');
    }

    const id = entry.id;
    const normalizedId = entry.normalizedId ?? entry.id;
    const definitionPath = path.resolve(ROOT_DIR, entry.definitionPath);

    let availability: ConnectorAvailability = null;
    try {
      const definitionRaw = await fs.readFile(definitionPath, 'utf8');
      const definition = JSON.parse(definitionRaw) as { availability?: string | null };
      const declared = definition?.availability ?? null;
      if (declared === 'stable' || declared === 'experimental' || declared === 'disabled') {
        availability = declared;
      }
    } catch (error) {
      throw new Error(`Failed to load connector definition for ${id} at ${definitionPath}: ${error instanceof Error ? error.message : String(error)}`);
    }

    results.push({
      id,
      normalizedId,
      definitionPath,
      availability,
    });
  }

  return results;
}

function toScriptKind(filePath: string): ts.ScriptKind {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.ts':
      return ts.ScriptKind.TS;
    case '.tsx':
      return ts.ScriptKind.TSX;
    case '.mts':
      return ts.ScriptKind.MTS;
    case '.cts':
      return ts.ScriptKind.CTS;
    case '.js':
      return ts.ScriptKind.JS;
    case '.mjs':
      return ts.ScriptKind.JS;
    case '.cjs':
      return ts.ScriptKind.JS;
    default:
      return ts.ScriptKind.TS;
  }
}

function getCallIdentifier(expression: ts.Expression): string | undefined {
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }

  if (ts.isPropertyAccessExpression(expression)) {
    return expression.name.text;
  }

  return undefined;
}

function recordPropertyName(target: Set<string>, name: ts.PropertyName | ts.Expression | undefined): void {
  if (!name) {
    return;
  }

  if (ts.isIdentifier(name)) {
    target.add(name.text);
    return;
  }

  if (ts.isStringLiteralLike(name)) {
    target.add(name.text);
    return;
  }

  if (ts.isPropertyAccessExpression(name)) {
    target.add(name.name.text);
  }
}

function extractRegisteredHandlers(sourceFile: ts.SourceFile): Set<string> {
  const handlers = new Set<string>();

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      const callName = getCallIdentifier(node.expression);

      if (callName === 'registerHandler' && node.arguments.length >= 1) {
        const first = node.arguments[0];
        if (ts.isStringLiteralLike(first)) {
          handlers.add(first.text);
        }
      }

      if (callName === 'registerHandlers' && node.arguments.length >= 1) {
        const first = node.arguments[0];
        if (ts.isObjectLiteralExpression(first)) {
          for (const prop of first.properties) {
            if (ts.isPropertyAssignment(prop)) {
              recordPropertyName(handlers, prop.name);
            } else if (ts.isShorthandPropertyAssignment(prop) || ts.isMethodDeclaration(prop)) {
              recordPropertyName(handlers, prop.name);
            }
          }
        } else if (ts.isCallExpression(first)) {
          for (const arg of first.arguments) {
            if (ts.isObjectLiteralExpression(arg)) {
              for (const prop of arg.properties) {
                if (ts.isPropertyAssignment(prop)) {
                  recordPropertyName(handlers, prop.name);
                }
              }
            }
          }
        }
      }

      if (callName === 'registerAliasHandlers' && node.arguments.length >= 1) {
        const first = node.arguments[0];
        if (ts.isObjectLiteralExpression(first)) {
          for (const prop of first.properties) {
            if (ts.isPropertyAssignment(prop)) {
              recordPropertyName(handlers, prop.name);
            }
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return handlers;
}

async function loadIntegrationHandlers(): Promise<Map<string, IntegrationInfo>> {
  const dirents = await fs.readdir(INTEGRATIONS_DIR, { withFileTypes: true });
  const integrations = new Map<string, IntegrationInfo>();

  for (const dirent of dirents) {
    if (!dirent.isFile()) {
      continue;
    }

    const ext = path.extname(dirent.name);
    if (!ext) {
      continue;
    }

    const baseName = path.basename(dirent.name, ext);
    if (!/(?:API|Api)Client$/.test(baseName)) {
      continue;
    }

    if (IGNORED_CLIENT_BASENAMES.has(baseName)) {
      continue;
    }

    if (dirent.name.endsWith('.d.ts')) {
      continue;
    }

    const rawName = baseName.replace(/(API|Api)Client$/, '');
    const canonicalId = canonicalize(rawName);
    const filePath = path.join(INTEGRATIONS_DIR, dirent.name);
    const content = await fs.readFile(filePath, 'utf8');
    const sourceFile = ts.createSourceFile(dirent.name, content, ts.ScriptTarget.Latest, true, toScriptKind(filePath));
    const handlers = extractRegisteredHandlers(sourceFile);

    if (integrations.has(canonicalId)) {
      // Prefer TypeScript sources over compiled JavaScript when duplicates exist
      const existing = integrations.get(canonicalId)!;
      const existingIsTs = existing.filePath.endsWith('.ts') || existing.filePath.endsWith('.tsx');
      const currentIsTs = filePath.endsWith('.ts') || filePath.endsWith('.tsx');
      if (!existingIsTs && currentIsTs) {
        integrations.set(canonicalId, { canonicalId, rawName, filePath, handlers });
      }
      continue;
    }

    integrations.set(canonicalId, { canonicalId, rawName, filePath, handlers });
  }

  return integrations;
}

async function main(): Promise<void> {
  const manifestConnectors = await loadManifestConnectors();
  const integrationHandlers = await loadIntegrationHandlers();

  const manifestByCanonical = new Map<string, ManifestConnector>();
  const stableCanonicalIds = new Set<string>();

  for (const connector of manifestConnectors) {
    const canonical = canonicalize(connector.normalizedId);
    manifestByCanonical.set(canonical, connector);
    if (connector.availability === 'stable') {
      stableCanonicalIds.add(canonical);
    }
  }

  const errors: string[] = [];

  for (const canonical of stableCanonicalIds) {
    const connector = manifestByCanonical.get(canonical);
    const integration = integrationHandlers.get(canonical);

    if (!connector) {
      // Should not happen, but guard against inconsistent manifest state
      errors.push(`Stable connector with canonical id "${canonical}" is missing from the manifest map.`);
      continue;
    }

    if (!integration) {
      errors.push(`Stable connector "${connector.normalizedId}" is missing an API client in server/integrations.`);
      continue;
    }

    if (integration.handlers.size === 0) {
      errors.push(`Stable connector "${connector.normalizedId}" (${path.relative(ROOT_DIR, integration.filePath)}) does not register any handlers.`);
    }
  }

  for (const [canonical, integration] of integrationHandlers.entries()) {
    const connector = manifestByCanonical.get(canonical);
    if (!connector) {
      errors.push(`Integration file ${path.relative(ROOT_DIR, integration.filePath)} does not have a corresponding entry in connector-manifest.json.`);
    }
  }

  if (errors.length > 0) {
    console.error('\nConnector parity check failed:');
    for (const message of errors) {
      console.error(`  • ${message}`);
    }
    console.error('\nTo resolve, ensure stable connectors have matching API clients with registered handlers and that manifest entries exist for every integration.');
    process.exitCode = 1;
    return;
  }

  console.log('✅ Connector manifest and integration handlers are in parity.');
}

main().catch(error => {
  console.error('Unexpected error while verifying connector parity:', error);
  process.exitCode = 1;
});
