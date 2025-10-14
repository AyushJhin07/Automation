import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

function extractObjectBlock(source, variableName) {
  const anchor = `const ${variableName}`;
  const startIndex = source.indexOf(anchor);
  if (startIndex === -1) {
    throw new Error(`Unable to find ${variableName} declaration.`);
  }
  const braceIndex = source.indexOf('{', startIndex);
  if (braceIndex === -1) {
    throw new Error(`Unable to find opening brace for ${variableName}.`);
  }

  let depth = 0;
  for (let i = braceIndex; i < source.length; i++) {
    const char = source[i];
    if (char === '{') {
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0) {
        return source.slice(braceIndex + 1, i);
      }
    } else if (char === '"' || char === "'" || char === '`') {
      const quote = char;
      i++;
      while (i < source.length) {
        const current = source[i];
        if (current === '\\') {
          i += 2;
          continue;
        }
        if (current === quote) {
          break;
        }
        i++;
      }
    }
  }
  throw new Error(`Unable to extract object block for ${variableName}.`);
}

function collectPropertiesFromText(text) {
  const map = new Map();

  const secretPattern = /getSecret\(\s*['\"]([A-Z0-9_]+)['\"]\s*(?:,\s*\{([\s\S]*?)\})?\)/g;
  let match;
  while ((match = secretPattern.exec(text))) {
    const name = match[1];
    const options = match[2] || '';
    const entry = map.get(name) || { name, optional: false, defaultValue: undefined, contexts: new Set() };
    const defaultMatch = options.match(/defaultValue\s*:\s*['\"]([^'\"]+)['\"]/);
    if (defaultMatch) {
      entry.optional = true;
      if (!entry.defaultValue) {
        entry.defaultValue = defaultMatch[1];
      }
    }
    entry.contexts.add('getSecret');
    map.set(name, entry);
  }

  const propertyPattern = /(?:getProperty|setProperty|deleteProperty)\(\s*['\"]([A-Z0-9_]+)['\"]\s*\)/g;
  while ((match = propertyPattern.exec(text))) {
    const name = match[1];
    const entry = map.get(name) || { name, optional: false, defaultValue: undefined, contexts: new Set() };
    entry.contexts.add('propertyAccess');
    map.set(name, entry);
  }

  const setPropsPattern = /setProperties\(\s*\{([\s\S]*?)\}\s*\)/g;
  while ((match = setPropsPattern.exec(text))) {
    const objectContent = match[1];
    const keyPattern = /['\"]([A-Z0-9_]+)['\"]\s*:/g;
    let keyMatch;
    while ((keyMatch = keyPattern.exec(objectContent))) {
      const name = keyMatch[1];
      const entry = map.get(name) || { name, optional: false, defaultValue: undefined, contexts: new Set() };
      entry.contexts.add('propertyAccess');
      map.set(name, entry);
    }
  }

  return Array.from(map.values()).map(entry => ({
    name: entry.name,
    optional: entry.optional,
    defaultValue: entry.defaultValue,
    contexts: Array.from(entry.contexts)
  }));
}

function parseOperationsFromSource(source, variableName, origin) {
  const block = extractObjectBlock(source, variableName);
  const pattern = /'([^']+)':\s*(?:\([^)]*\)\s*=>\s*`([\s\S]*?)`|function\s*\([^)]*\)\s*\{\s*return\s*`([\s\S]*?)`;?\s*\})/g;
  const results = [];
  let match;
  while ((match = pattern.exec(block))) {
    const operation = match[1];
    const body = match[2] || match[3] || '';
    const connector = operation.split(':')[0].split('.')[1] || 'unknown';
    const properties = collectPropertiesFromText(body);
    if (properties.length > 0) {
      results.push({ operation, connector, properties, source: origin });
    }
  }
  return results;
}

function gatherConnectorManifests(connectorsDir) {
  const summaries = new Map();
  const entries = readdirSync(connectorsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const connectorId = entry.name;
    const basePath = path.join(connectorsDir, connectorId);
    const definitionPath = path.join(basePath, 'definition.json');
    const manifestPath = path.join(basePath, 'manifest.json');
    let data = null;
    if (existsSync(definitionPath)) {
      data = JSON.parse(readFileSync(definitionPath, 'utf8'));
    } else if (existsSync(manifestPath)) {
      data = JSON.parse(readFileSync(manifestPath, 'utf8'));
    }
    if (!data) continue;

    const id = data.id || connectorId;
    const name = data.name || id;
    const actions = Array.isArray(data.actions) ? data.actions : [];
    const triggers = Array.isArray(data.triggers) ? data.triggers : [];

    const appsScriptOperations = [];
    for (const action of actions) {
      if (action && Array.isArray(action.runtimes) && action.runtimes.includes('appsScript') && action.id) {
        appsScriptOperations.push(`action.${id}:${action.id}`);
      }
    }

    const appsScriptTriggers = [];
    for (const trigger of triggers) {
      if (trigger && Array.isArray(trigger.runtimes) && trigger.runtimes.includes('appsScript') && trigger.id) {
        appsScriptTriggers.push(`trigger.${id}:${trigger.id}`);
      }
    }

    summaries.set(id, {
      id,
      name,
      appsScriptOperations: appsScriptOperations.sort(),
      appsScriptTriggers: appsScriptTriggers.sort()
    });
  }
  return summaries;
}

function ensureConnectorSummary(connectors, id) {
  if (!connectors.has(id)) {
    connectors.set(id, {
      id,
      name: id,
      operations: [],
      triggers: [],
      properties: [],
      environmentProperties: [],
      _propertyIndex: new Map()
    });
  }
  return connectors.get(id);
}

function mergeOperations(operations) {
  const connectors = new Map();
  for (const op of operations) {
    const summary = ensureConnectorSummary(connectors, op.connector);
    if (!summary.operations.includes(op.operation)) {
      summary.operations.push(op.operation);
    }
    for (const property of op.properties) {
      const index = summary._propertyIndex;
      let propertySummary = index.get(property.name);
      if (!propertySummary) {
        propertySummary = {
          name: property.name,
          optional: property.optional,
          defaultValue: property.defaultValue,
          operations: [op.operation],
          contexts: [...property.contexts]
        };
        summary.properties.push(propertySummary);
        index.set(property.name, propertySummary);
      } else {
        if (!propertySummary.operations.includes(op.operation)) {
          propertySummary.operations.push(op.operation);
        }
        propertySummary.optional = propertySummary.optional || property.optional;
        if (!propertySummary.defaultValue && property.defaultValue) {
          propertySummary.defaultValue = property.defaultValue;
        }
        for (const ctx of property.contexts) {
          if (!propertySummary.contexts.includes(ctx)) {
            propertySummary.contexts.push(ctx);
          }
        }
      }
    }
  }
  for (const summary of connectors.values()) {
    summary.operations.sort();
    summary.properties.sort((a, b) => a.name.localeCompare(b.name));
  }
  return connectors;
}

function applyManifestMetadata(connectors, manifests) {
  for (const [id, manifest] of manifests) {
    const summary = ensureConnectorSummary(connectors, id);
    summary.name = manifest.name;
    for (const op of manifest.appsScriptOperations) {
      if (!summary.operations.includes(op)) {
        summary.operations.push(op);
      }
    }
    for (const trigger of manifest.appsScriptTriggers) {
      if (!summary.triggers.includes(trigger)) {
        summary.triggers.push(trigger);
      }
    }
    summary.operations.sort();
    summary.triggers.sort();
  }
}

function applyPropertyShadows(connectors) {
  for (const [targetId, sourceId] of CONNECTOR_PROPERTY_SHADOWS) {
    const source = connectors.get(sourceId);
    if (!source) continue;
    const target = ensureConnectorSummary(connectors, targetId);
    const targetIndex = target._propertyIndex;
    for (const prop of source.properties) {
      let shadow = targetIndex.get(prop.name);
      if (!shadow) {
        shadow = {
          name: prop.name,
          optional: prop.optional,
          defaultValue: prop.defaultValue,
          operations: [],
          contexts: [...prop.contexts]
        };
        target.properties.push(shadow);
        targetIndex.set(prop.name, shadow);
      } else {
        shadow.optional = shadow.optional || prop.optional;
        if (!shadow.defaultValue && prop.defaultValue) {
          shadow.defaultValue = prop.defaultValue;
        }
        for (const ctx of prop.contexts) {
          if (!shadow.contexts.includes(ctx)) {
            shadow.contexts.push(ctx);
          }
        }
      }
      for (const op of target.operations) {
        if (!shadow.operations.includes(op)) {
          shadow.operations.push(op);
        }
      }
    }
    target.properties.sort((a, b) => a.name.localeCompare(b.name));
  }
}

function detectEnvironmentProperties(summary) {
  const envPattern = /(?:ENVIRONMENT|SANDBOX|SERVER_URL|BASE_URL|REGION|INSTANCE_URL|DOMAIN)$/;
  summary.environmentProperties = summary.properties
    .filter(prop => envPattern.test(prop.name))
    .map(prop => prop.name)
    .sort();
}

function normaliseConnectorId(connectorId) {
  return connectorId.replace(/[^a-z0-9]/gi, '_').toUpperCase();
}

const GLOBAL_PROPERTY_ALLOWLIST = new Set([
  'ERROR_NOTIFICATION_EMAIL',
  'WORKFLOW_LOGS',
  '__VAULT_EXPORTS__',
  'VAULT_EXPORTS',
  'VAULT_EXPORTS_JSON'
]);

const CONNECTOR_PREFIX_OVERRIDES = new Map([
  ['microsoft-teams', ['TEAMS']],
  ['google-analytics', ['GA']],
  ['new-relic', ['NEWRELIC']],
  ['salesforce-commerce', ['SFCC']],
  ['aws-s3', ['AWS']],
  ['aws-codepipeline', ['AWS']],
  ['aws-cloudformation', ['AWS']],
  ['google-cloud-storage', ['GCS']],
  ['adobe-acrobat', ['ADOBE_PDF']],
  ['microsoft-todo', ['OUTLOOK', 'MICROSOFT_TODO']],
  ['microsoft-onedrive', ['ONEDRIVE']],
  ['microsoft-excel', ['MICROSOFT_EXCEL']],
  ['microsoft-powerpoint', ['MICROSOFT_POWERPOINT']],
  ['microsoft-word', ['MICROSOFT_WORD']],
  ['microsoft-outlook', ['OUTLOOK']],
  ['google-admin', ['GOOGLE_ADMIN']],
  ['sheets', ['GOOGLE_SHEETS']],
  ['google-sheets-enhanced', ['GOOGLE_SHEETS']]
]);

const CONNECTOR_PROPERTY_SHADOWS = new Map([
  ['google-sheets-enhanced', 'sheets']
]);

function hasValidPrefix(connectorId, propertyName) {
  const prefixes = [normaliseConnectorId(connectorId), ...(CONNECTOR_PREFIX_OVERRIDES.get(connectorId) || [])];
  return prefixes.some(prefix => propertyName.startsWith(`${prefix}_`));
}

function validatePropertyNames(connectors) {
  const issues = [];
  for (const summary of connectors.values()) {
    for (const prop of summary.properties) {
      if (GLOBAL_PROPERTY_ALLOWLIST.has(prop.name)) continue;
      if (!hasValidPrefix(summary.id, prop.name)) {
        const expected = normaliseConnectorId(summary.id);
        issues.push({ connector: summary.id, property: prop.name, reason: `Property should start with "${expected}_"` });
      }
      const segmentCount = prop.name.split('_').length;
      if (segmentCount < 2) {
        issues.push({ connector: summary.id, property: prop.name, reason: 'Property must include a connector prefix and at least one resource segment' });
      }
    }
  }
  return issues;
}

function serialiseConnector(summary) {
  return {
    id: summary.id,
    name: summary.name,
    operations: summary.operations,
    triggers: summary.triggers,
    properties: summary.properties.map(prop => ({
      name: prop.name,
      optional: prop.optional,
      defaultValue: prop.defaultValue,
      operations: prop.operations.sort(),
      contexts: prop.contexts.sort()
    })),
    environmentProperties: summary.environmentProperties
  };
}

function generateReport(connectors) {
  const sorted = Array.from(connectors.values()).sort((a, b) => a.id.localeCompare(b.id));
  return {
    version: 1,
    connectors: sorted.map(serialiseConnector)
  };
}

function loadExistingReport(reportPath) {
  if (!existsSync(reportPath)) {
    return null;
  }
  return JSON.parse(readFileSync(reportPath, 'utf8'));
}

function reportsEqual(current, next) {
  return JSON.stringify(current, null, 2) === JSON.stringify(next, null, 2);
}

function generateMarkdown(connectors) {
  const rows = ['| Connector | Required properties | Optional properties | Environment notes |', '| --- | --- | --- | --- |'];
  const sorted = Array.from(connectors.values())
    .filter(connector => connector.properties.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const connector of sorted) {
    const required = connector.properties.filter(p => !p.optional).map(p => `\`${p.name}\``).join('<br>') || '—';
    const optional = connector.properties.filter(p => p.optional).map(p => {
      const defaultSuffix = p.defaultValue ? ` (defaults to \`${p.defaultValue}\`)` : '';
      return `\`${p.name}\`${defaultSuffix}`;
    }).join('<br>') || '—';
    const envNotes = connector.environmentProperties.length > 0 ? connector.environmentProperties.map(name => `\`${name}\``).join(', ') : '—';
    rows.push(`| ${connector.name} | ${required} | ${optional} | ${envNotes} |`);
  }
  return rows.join('\n');
}

function updateDocumentation(docPath, table) {
  const markerStart = '<!-- BEGIN GENERATED APPS SCRIPT PROPERTIES -->';
  const markerEnd = '<!-- END GENERATED APPS SCRIPT PROPERTIES -->';
  const doc = existsSync(docPath) ? readFileSync(docPath, 'utf8') : '';
  const startIndex = doc.indexOf(markerStart);
  const endIndex = doc.indexOf(markerEnd);
  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    throw new Error(`Documentation at ${docPath} is missing generation markers.`);
  }
  const before = doc.slice(0, startIndex + markerStart.length);
  const after = doc.slice(endIndex);
  const updated = `${before}\n\n${table}\n\n${after}`;
  return { updated, changed: updated !== doc };
}

function stripRuntimeFields(connectors) {
  for (const summary of connectors.values()) {
    delete summary._propertyIndex;
  }
}

function main() {
  const args = process.argv.slice(2);
  const writeMode = args.includes('--write');
  const connectorsDir = path.join(REPO_ROOT, 'connectors');
  const docPath = path.join(REPO_ROOT, 'docs', 'apps-script-rollout', 'script-properties.md');
  const reportPath = path.join(REPO_ROOT, 'production', 'reports', 'apps-script-properties.json');

  const compileSource = readFileSync(path.join(REPO_ROOT, 'server', 'workflow', 'compile-to-appsscript.ts'), 'utf8');
  const generatedSource = readFileSync(path.join(REPO_ROOT, 'server', 'workflow', 'realOps.generated.ts'), 'utf8');

  const compileOps = parseOperationsFromSource(compileSource, 'REAL_OPS', 'compile');
  const generatedOps = parseOperationsFromSource(generatedSource, 'GENERATED_REAL_OPS', 'generated');
  const manifests = gatherConnectorManifests(connectorsDir);

  const connectors = mergeOperations([...compileOps, ...generatedOps]);
  applyManifestMetadata(connectors, manifests);
  applyPropertyShadows(connectors);
  for (const summary of connectors.values()) {
    detectEnvironmentProperties(summary);
  }

  const validationIssues = validatePropertyNames(connectors);
  if (validationIssues.length > 0) {
    const details = validationIssues.map(issue => `- ${issue.connector}: ${issue.property} (${issue.reason})`).join('\n');
    throw new Error(`Invalid Apps Script property names detected:\n${details}`);
  }

  stripRuntimeFields(connectors);

  const report = generateReport(connectors);
  const existingReport = loadExistingReport(reportPath);
  const table = generateMarkdown(connectors);

  if (writeMode) {
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    const docUpdate = updateDocumentation(docPath, table);
    if (docUpdate.changed) {
      writeFileSync(docPath, docUpdate.updated);
    }
    console.log('✅ Apps Script properties report updated.');
    return;
  }

  if (!existingReport) {
    throw new Error('Apps Script properties report is missing. Run with --write to generate it.');
  }

  if (!reportsEqual(existingReport, report)) {
    throw new Error('Apps Script properties report is stale. Run scripts/verify-apps-script-properties.js --write');
  }

  const docUpdate = updateDocumentation(docPath, table);
  if (docUpdate.changed) {
    throw new Error('Apps Script properties guide is out of date. Run scripts/verify-apps-script-properties.js --write');
  }

  console.log('✅ Apps Script properties verified.');
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
