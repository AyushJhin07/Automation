import { readdirSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';

/**
 * @typedef {{
 *   key: string;
 *   type: 'action' | 'trigger';
 *   id: string;
 * }} OperationSummary
 *
 * @typedef {{
 *   connectorId: string;
 *   connectorName: string;
 *   totalOperations: number;
 *   coveredOperations: number;
 *   missingOperations: string[];
 *   coverageRatio: number;
 *   operations: OperationSummary[];
 * }} ConnectorCoverage
 *
 * @typedef {{
 *   generatedAt: string;
 *   target: number;
 *   totals: {
 *     operations: number;
 *     covered: number;
 *     missing: number;
 *     ratio: number;
 *     connectors: number;
 *     fullCoverage: number;
 *     partialCoverage: number;
 *     noCoverage: number;
 *   };
 *   connectors: ConnectorCoverage[];
 * }} CoverageReport
 */

const DEFAULT_JSON_PATH = 'production/reports/apps-script-real-ops-coverage.json';
const DEFAULT_CSV_PATH = 'production/reports/apps-script-real-ops-coverage.csv';
const DEFAULT_TARGET = 0;

const isNonEmptyString = value => typeof value === 'string' && value.trim().length > 0;

const parseTarget = rawTarget => {
  if (rawTarget === undefined || rawTarget === null || String(rawTarget).trim() === '') {
    return DEFAULT_TARGET;
  }

  const value = Number.parseFloat(String(rawTarget));
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`Invalid Apps Script REAL_OPS coverage target: "${rawTarget}".`);
  }

  return value;
};

const parseCliOptions = argv => {
  const { values } = parseArgs({
    args: argv,
    options: {
      csv: { type: 'string' },
      json: { type: 'string' },
      target: { type: 'string' },
    },
  });

  const target =
    typeof values.target === 'string'
      ? parseTarget(values.target)
      : parseTarget(process.env.APPS_SCRIPT_REAL_OPS_TARGET);

  return {
    csvPath:
      typeof values.csv === 'string' && values.csv.trim() !== ''
        ? values.csv
        : DEFAULT_CSV_PATH,
    jsonPath:
      typeof values.json === 'string' && values.json.trim() !== ''
        ? values.json
        : DEFAULT_JSON_PATH,
    target,
  };
};

const ensureDirectory = async filePath => {
  const directory = path.dirname(filePath);
  await mkdir(directory, { recursive: true });
};

const toPercentage = ratio => `${(ratio * 100).toFixed(2)}%`;

const buildOperationKey = (connectorId, type, operationId) => `${type}.${connectorId}:${operationId}`;

const extractObjectBlock = (source, variableName) => {
  const anchor = `const ${variableName}`;
  const startIndex = source.indexOf(anchor);
  if (startIndex === -1) {
    return '';
  }

  const braceIndex = source.indexOf('{', startIndex);
  if (braceIndex === -1) {
    return '';
  }

  let depth = 0;
  for (let i = braceIndex; i < source.length; i += 1) {
    const char = source[i];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(braceIndex + 1, i);
      }
    } else if (char === '"' || char === "'" || char === '`') {
      const quote = char;
      i += 1;
      while (i < source.length) {
        const current = source[i];
        if (current === '\\') {
          i += 2;
          continue;
        }
        if (current === quote) {
          break;
        }
        i += 1;
      }
    }
  }

  return '';
};

const parseOperationKeysFromSource = (source, variableName) => {
  const block = extractObjectBlock(source, variableName);
  if (!block) {
    return [];
  }

  const keys = new Set();
  const pattern = /'([^']+)'\s*:/g;
  let match;
  while ((match = pattern.exec(block))) {
    keys.add(match[1]);
  }
  return Array.from(keys);
};

const loadRealOpsKeys = repoRoot => {
  const compilePath = path.join(repoRoot, 'server', 'workflow', 'compile-to-appsscript.ts');
  const generatedPath = path.join(repoRoot, 'server', 'workflow', 'realOps.generated.ts');

  const compileSource = readFileSync(compilePath, 'utf8');
  const generatedSource = readFileSync(generatedPath, 'utf8');

  const compileKeys = parseOperationKeysFromSource(compileSource, 'REAL_OPS');
  const generatedKeys = parseOperationKeysFromSource(generatedSource, 'GENERATED_REAL_OPS');

  const allKeys = new Set([...compileKeys, ...generatedKeys]);
  return new Set(allKeys);
};

const gatherConnectorCoverage = (connectorsDir, realOpsKeys) => {
  const entries = readdirSync(connectorsDir, { withFileTypes: true });
  const connectors = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const connectorId = entry.name;
    const definitionPath = path.join(connectorsDir, connectorId, 'definition.json');
    let definitionRaw;

    try {
      definitionRaw = readFileSync(definitionPath, 'utf8');
    } catch (error) {
      console.warn(
        `⚠️ Skipping ${connectorId}: unable to read definition.json (${error instanceof Error ? error.message : error})`
      );
      continue;
    }

    let definition;
    try {
      definition = JSON.parse(definitionRaw);
    } catch (error) {
      console.warn(
        `⚠️ Skipping ${connectorId}: invalid JSON in definition.json (${error instanceof Error ? error.message : error})`
      );
      continue;
    }

    const normalizedId = isNonEmptyString(definition?.id) ? definition.id.trim() : connectorId;
    const connectorName = isNonEmptyString(definition?.name) ? definition.name.trim() : normalizedId;

    /** @type {OperationSummary[]} */
    const operations = [];

    if (Array.isArray(definition?.actions)) {
      for (const action of definition.actions) {
        if (!action || !isNonEmptyString(action.id)) continue;
        const runtimes = Array.isArray(action.runtimes) ? action.runtimes.map(String) : [];
        if (!runtimes.includes('appsScript')) continue;
        const opId = action.id.trim();
        operations.push({
          key: buildOperationKey(normalizedId, 'action', opId),
          type: 'action',
          id: opId,
        });
      }
    }

    if (Array.isArray(definition?.triggers)) {
      for (const trigger of definition.triggers) {
        if (!trigger || !isNonEmptyString(trigger.id)) continue;
        const runtimes = Array.isArray(trigger.runtimes) ? trigger.runtimes.map(String) : [];
        if (!runtimes.includes('appsScript')) continue;
        const opId = trigger.id.trim();
        operations.push({
          key: buildOperationKey(normalizedId, 'trigger', opId),
          type: 'trigger',
          id: opId,
        });
      }
    }

    operations.sort((a, b) => a.key.localeCompare(b.key));

    let covered = 0;
    const missing = [];

    for (const operation of operations) {
      if (realOpsKeys.has(operation.key)) {
        covered += 1;
      } else {
        missing.push(operation.key);
      }
    }

    const total = operations.length;
    const ratio = total === 0 ? 1 : covered / total;

    connectors.push({
      connectorId: normalizedId,
      connectorName,
      totalOperations: total,
      coveredOperations: covered,
      missingOperations: missing,
      coverageRatio: ratio,
      operations,
    });
  }

  return connectors.sort((a, b) => a.connectorId.localeCompare(b.connectorId));
};

const buildCsv = report => {
  const header = 'connector_id,connector_name,total_operations,covered_operations,coverage_ratio,missing_operations';
  const rows = report.connectors.map(connector => {
    const missing = connector.missingOperations.join(';');
    return [
      connector.connectorId,
      connector.connectorName.replace(/"/g, '""'),
      String(connector.totalOperations),
      String(connector.coveredOperations),
      connector.coverageRatio.toFixed(4),
      missing.replace(/"/g, '""'),
    ]
      .map(value => `"${value}"`)
      .join(',');
  });

  return [header, ...rows].join('\n') + '\n';
};

const buildReport = (connectors, target) => {
  let totalOperations = 0;
  let coveredOperations = 0;
  let fullCoverage = 0;
  let partialCoverage = 0;
  let noCoverage = 0;

  for (const connector of connectors) {
    totalOperations += connector.totalOperations;
    coveredOperations += connector.coveredOperations;

    if (connector.totalOperations === 0) {
      fullCoverage += 1;
    } else if (connector.coveredOperations === 0) {
      noCoverage += 1;
    } else if (connector.coveredOperations === connector.totalOperations) {
      fullCoverage += 1;
    } else {
      partialCoverage += 1;
    }
  }

  const missingOperations = Math.max(totalOperations - coveredOperations, 0);
  const ratio = totalOperations === 0 ? 1 : coveredOperations / totalOperations;

  return {
    generatedAt: new Date().toISOString(),
    target,
    totals: {
      operations: totalOperations,
      covered: coveredOperations,
      missing: missingOperations,
      ratio,
      connectors: connectors.length,
      fullCoverage,
      partialCoverage,
      noCoverage,
    },
    connectors,
  };
};

const logSummary = report => {
  const totals = report.totals;
  console.log('📊 Apps Script REAL_OPS Coverage');
  console.log('--------------------------------');
  console.log(`Operations: ${totals.covered}/${totals.operations} (${toPercentage(totals.ratio)})`);
  console.log(`Connectors with full coverage: ${totals.fullCoverage}/${totals.connectors}`);

  const connectorsMissing = report.connectors.filter(connector => connector.missingOperations.length > 0);
  if (connectorsMissing.length > 0) {
    console.log('\nConnectors missing REAL_OPS implementations:');
    for (const connector of connectorsMissing) {
      console.log(
        `  • ${connector.connectorId}: missing ${connector.missingOperations.length}/${connector.totalOperations} operation(s)`
      );
    }
  } else {
    console.log('\nAll Apps Script operations have corresponding REAL_OPS entries. ✅');
  }
};

const run = async () => {
  process.env.NODE_ENV ??= 'development';

  const options = parseCliOptions(process.argv.slice(2));
  const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const connectorsDir = path.join(repoRoot, 'connectors');

  const realOpsKeys = loadRealOpsKeys(repoRoot);
  const connectorCoverage = gatherConnectorCoverage(connectorsDir, realOpsKeys);
  const report = buildReport(connectorCoverage, options.target);

  logSummary(report);

  await Promise.all([
    (async () => {
      await ensureDirectory(options.jsonPath);
      await writeFile(options.jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    })(),
    (async () => {
      await ensureDirectory(options.csvPath);
      await writeFile(options.csvPath, buildCsv(report), 'utf8');
    })(),
  ]);

  if (report.totals.ratio + Number.EPSILON < options.target) {
    console.error(
      `\n❌ Apps Script REAL_OPS coverage ${toPercentage(report.totals.ratio)} is below the target ${toPercentage(options.target)}.`
    );
    process.exitCode = 1;
    return;
  }

  console.log(`\n✅ Apps Script REAL_OPS coverage meets the target of ${toPercentage(options.target)}.`);
};

run().catch(error => {
  console.error('Failed to generate Apps Script REAL_OPS coverage report.');
  console.error(error);
  process.exitCode = 1;
});
