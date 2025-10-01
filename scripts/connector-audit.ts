import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ConnectorRegistry, connectorRegistry } from '../server/ConnectorRegistry';
import ts from 'typescript';

type ConnectorStatus = 'stable' | 'experimental' | 'disabled';

interface ClientAnalysisResult {
  appId: string;
  filePath?: string;
  issues: string[];
  actionCount: number;
  triggerCount: number;
  expectedHandlers: number;
  registeredHandlers: number;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const INTEGRATIONS_DIR = join(__dirname, '..', 'server', 'integrations');

type RegistryEntry = ReturnType<ConnectorRegistry['getAllConnectors']>[number];

function toPascalCase(id: string): string {
  return id
    .split(/[-_]/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

async function locateClientFile(appId: string): Promise<string | undefined> {
  const pascal = toPascalCase(appId);
  const candidates = [
    `${pascal}APIClient.ts`,
    `${pascal}APIClient.js`,
    `${pascal}EnhancedAPIClient.ts`,
    `${pascal}EnhancedAPIClient.js`
  ];

  for (const candidate of candidates) {
    const fullPath = join(INTEGRATIONS_DIR, candidate);
    try {
      await fs.access(fullPath);
      return fullPath;
    } catch {
      // ignore missing files
    }
  }

  return undefined;
}

function getCallName(expression: ts.Expression): string | undefined {
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }

  if (ts.isPropertyAccessExpression(expression)) {
    return expression.name.text;
  }

  return undefined;
}

function extractRegisteredHandlers(sourceFile: ts.SourceFile): Set<string> {
  const handlers = new Set<string>();

  function recordHandlerName(name: ts.PropertyName | ts.Expression | undefined): void {
    if (!name) {
      return;
    }

    if (ts.isIdentifier(name)) {
      handlers.add(name.text);
      return;
    }

    if (ts.isStringLiteralLike(name)) {
      handlers.add(name.text);
      return;
    }

    if (ts.isPropertyAccessExpression(name)) {
      handlers.add(name.name.text);
    }
  }

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      const callName = getCallName(node.expression);
      if (callName === 'registerHandler' && node.arguments.length >= 1) {
        const firstArg = node.arguments[0];
        if (ts.isStringLiteralLike(firstArg)) {
          handlers.add(firstArg.text);
        }
      }

      if (callName === 'registerHandlers' && node.arguments.length >= 1) {
        const firstArg = node.arguments[0];
        if (ts.isObjectLiteralExpression(firstArg)) {
          for (const prop of firstArg.properties) {
            if (ts.isPropertyAssignment(prop)) {
              recordHandlerName(prop.name);
            } else if (ts.isMethodDeclaration(prop) || ts.isShorthandPropertyAssignment(prop)) {
              recordHandlerName(prop.name);
            }
          }
        } else if (ts.isCallExpression(firstArg) && firstArg.arguments.length >= 1) {
          // registerHandlers(buildHandlers({ ... })) – fall back to string literal extraction
          for (const arg of firstArg.arguments) {
            if (ts.isObjectLiteralExpression(arg)) {
              for (const prop of arg.properties) {
                if (ts.isPropertyAssignment(prop)) {
                  recordHandlerName(prop.name);
                }
              }
            }
          }
        }
      }

      if (callName === 'registerAliasHandlers' && node.arguments.length >= 1) {
        const firstArg = node.arguments[0];
        if (ts.isObjectLiteralExpression(firstArg)) {
          for (const prop of firstArg.properties) {
            if (ts.isPropertyAssignment(prop)) {
              recordHandlerName(prop.name);
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

function inspectTestConnection(sourceFile: ts.SourceFile): { exists: boolean; returnsAPIResponse: boolean } {
  let exists = false;
  let returnsAPIResponse = false;

  function visit(node: ts.Node): void {
    if (ts.isMethodDeclaration(node) || ts.isPropertyDeclaration(node)) {
      const name = node.name;
      if (name && ts.isIdentifier(name) && name.text === 'testConnection') {
        exists = true;

        if (node.type && node.type.getText(sourceFile).includes('APIResponse')) {
          returnsAPIResponse = true;
        } else if (ts.isMethodDeclaration(node) && node.body) {
          for (const stmt of node.body.statements) {
            if (ts.isReturnStatement(stmt) && stmt.expression && ts.isCallExpression(stmt.expression)) {
              returnsAPIResponse = true;
              break;
            }
          }
        } else if (ts.isPropertyDeclaration(node) && node.initializer && ts.isArrowFunction(node.initializer)) {
          const body = node.initializer.body;
          if (ts.isCallExpression(body)) {
            returnsAPIResponse = true;
          } else if (ts.isBlock(body)) {
            for (const stmt of body.statements) {
              if (ts.isReturnStatement(stmt) && stmt.expression && ts.isCallExpression(stmt.expression)) {
                returnsAPIResponse = true;
                break;
              }
            }
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return { exists, returnsAPIResponse };
}

function analyseClientSource(
  appId: string,
  source: string,
  filePath: string,
  actionCount: number,
  triggerCount: number
): ClientAnalysisResult {
  const issues: string[] = [];
  const sourceFile = ts.createSourceFile(`${appId}.ts`, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  if (/super\s*\(\s*\)/.test(source)) {
    issues.push('constructor calls super() with no base URL or credentials');
  }

  if (/api\.example\.com/i.test(source) || /api-placeholder/i.test(source)) {
    issues.push('placeholder base URL detected (api.example.com)');
  }

  if (/\/api\/create_record/.test(source) || /\/api\/update_record/.test(source)) {
    issues.push('placeholder REST endpoint detected (/api/create_record, /api/update_record, etc.)');
  }

  if (/\bparams\b/.test(source) && !/params\s*[:=]/.test(source)) {
    issues.push('uses params variable without a local definition');
  }

  const handlers = extractRegisteredHandlers(sourceFile);
  const expectedHandlers = actionCount + triggerCount;

  if (expectedHandlers > 0) {
    if (handlers.size === 0) {
      issues.push('no registerHandler/registerHandlers call found');
    } else if (handlers.size < expectedHandlers) {
      issues.push(`only ${handlers.size} of ${expectedHandlers} catalog actions/triggers appear to be registered`);
    }
  }

  const testConnectionStatus = inspectTestConnection(sourceFile);
  if (!testConnectionStatus.exists) {
    issues.push('missing testConnection implementation');
  } else if (!testConnectionStatus.returnsAPIResponse) {
    issues.push('testConnection does not declare an APIResponse return');
  }

  return {
    appId,
    filePath,
    issues,
    actionCount,
    triggerCount,
    expectedHandlers,
    registeredHandlers: handlers.size
  };
}

async function analyseClient(entry: RegistryEntry): Promise<ClientAnalysisResult> {
  const { definition, hasImplementation } = entry;
  const filePath = await locateClientFile(definition.id);
  const actionCount = definition.actions?.length ?? 0;
  const triggerCount = definition.triggers?.length ?? 0;

  if (!filePath) {
    return {
      appId: definition.id,
      issues: ['no API client file found in server/integrations'],
      actionCount,
      triggerCount,
      expectedHandlers: actionCount + triggerCount,
      registeredHandlers: 0
    };
  }

  const source = await fs.readFile(filePath, 'utf-8');
  const analysis = analyseClientSource(definition.id, source, filePath, actionCount, triggerCount);

  if (!hasImplementation) {
    analysis.issues.unshift('not registered in ConnectorRegistry.initializeAPIClients (availability remains experimental)');
  }

  return analysis;
}

async function main(): Promise<void> {
  const registry = connectorRegistry;
  const connectors = registry.getAllConnectors({ includeExperimental: true, includeDisabled: true });

  const totals = {
    stable: 0,
    experimental: 0,
    disabled: 0,
    withImplementations: 0
  } satisfies Record<ConnectorStatus | 'withImplementations', number>;

  const experimentalFindings: ClientAnalysisResult[] = [];
  const aggregates = {
    missingClientFile: new Set<string>(),
    missingRegistration: new Set<string>(),
    placeholderBaseUrl: new Set<string>(),
    placeholderEndpoint: new Set<string>(),
    missingHandlers: new Set<string>(),
    insufficientHandlers: new Set<string>(),
    missingTestConnection: new Set<string>(),
    missingApiResponse: new Set<string>(),
    superWithoutConfig: new Set<string>(),
    paramsUsage: new Set<string>()
  };

  for (const entry of connectors) {
    const availability = entry.availability as ConnectorStatus;
    totals[availability] += 1;
    if (entry.hasImplementation) {
      totals.withImplementations += 1;
      continue;
    }

    if (availability === 'stable') {
      // A stable connector without implementation indicates data drift.
      experimentalFindings.push({
        appId: entry.definition.id,
        issues: ['marked stable but connectorRegistry.hasImplementation returned false']
      });
      continue;
    }

    const analysis = await analyseClient(entry);
    experimentalFindings.push(analysis);

    for (const issue of analysis.issues) {
      if (issue.includes('no API client file')) {
        aggregates.missingClientFile.add(analysis.appId);
      }
      if (issue.includes('not registered in ConnectorRegistry.initializeAPIClients')) {
        aggregates.missingRegistration.add(analysis.appId);
      }
      if (issue.includes('constructor calls super() with no base URL')) {
        aggregates.superWithoutConfig.add(analysis.appId);
      }
      if (issue.includes('placeholder base URL detected')) {
        aggregates.placeholderBaseUrl.add(analysis.appId);
      }
      if (issue.includes('placeholder REST endpoint')) {
        aggregates.placeholderEndpoint.add(analysis.appId);
      }
      if (issue.includes('no registerHandler/registerHandlers')) {
        aggregates.missingHandlers.add(analysis.appId);
      }
      if (issue.includes('only') && issue.includes('catalog actions/triggers')) {
        aggregates.insufficientHandlers.add(analysis.appId);
      }
      if (issue.includes('missing testConnection')) {
        aggregates.missingTestConnection.add(analysis.appId);
      }
      if (issue.includes('does not declare an APIResponse')) {
        aggregates.missingApiResponse.add(analysis.appId);
      }
      if (issue.includes('uses params variable without a local definition')) {
        aggregates.paramsUsage.add(analysis.appId);
      }
    }
  }

  const lines: string[] = [];
  lines.push('=== Connector Inventory Summary ===');
  lines.push(`Stable connectors: ${totals.stable}`);
  lines.push(`Experimental connectors: ${totals.experimental}`);
  lines.push(`Disabled connectors: ${totals.disabled}`);
  lines.push(`Fully wired implementations: ${totals.withImplementations}`);
  lines.push('');

  if (experimentalFindings.length) {
    lines.push('=== Connectors Requiring Attention ===');
    for (const finding of experimentalFindings.sort((a, b) => a.appId.localeCompare(b.appId))) {
      lines.push(`• ${finding.appId}`);
      if (finding.filePath) {
        lines.push(`  API client: ${finding.filePath.replace(process.cwd() + '/', '')}`);
      }
      for (const issue of finding.issues) {
        lines.push(`  - ${issue}`);
      }
      if (finding.expectedHandlers > 0) {
        lines.push(`  Catalog operations: ${finding.actionCount} actions, ${finding.triggerCount} triggers`);
        lines.push(`  Registered handlers detected: ${finding.registeredHandlers}/${finding.expectedHandlers}`);
      }
      lines.push('');
    }
  } else {
    lines.push('All connectors are fully wired.');
  }

  if (experimentalFindings.length) {
    lines.push('');
    lines.push('=== Issue Summary ===');
    lines.push(`Missing API client file: ${aggregates.missingClientFile.size}`);
    lines.push(`Not registered in ConnectorRegistry: ${aggregates.missingRegistration.size}`);
    lines.push(`Constructors without base URL credentials: ${aggregates.superWithoutConfig.size}`);
    lines.push(`Placeholder base URLs detected: ${aggregates.placeholderBaseUrl.size}`);
    lines.push(`Placeholder REST endpoints detected: ${aggregates.placeholderEndpoint.size}`);
    lines.push(`No handler registration detected: ${aggregates.missingHandlers.size}`);
    lines.push(`Partial handler registration detected: ${aggregates.insufficientHandlers.size}`);
    lines.push(`Missing testConnection implementation: ${aggregates.missingTestConnection.size}`);
    lines.push(`testConnection without APIResponse return: ${aggregates.missingApiResponse.size}`);
    lines.push(`Uses undefined params variable: ${aggregates.paramsUsage.size}`);
  }

  console.log(lines.join('\n'));
}

main().catch(error => {
  console.error('Connector audit failed:', error);
  process.exitCode = 1;
});

