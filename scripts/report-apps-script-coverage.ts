import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';

import { connectorRegistry } from '../server/ConnectorRegistry.js';
import { getRuntimeCapabilities } from '../server/runtime/registry.js';

import { buildCoverageReport, type CoverageReport } from './connector-runtime-status.js';

type CliOptions = {
  csvPath: string;
  jsonPath: string;
  target: number;
};

type CoverageSummary = {
  generatedAt: string;
  target: number;
  coverage: {
    operations: {
      total: number;
      enabled: number;
      disabled: number;
      ratio: number;
    };
    connectors: {
      total: number;
      full: number;
      partial: number;
      none: number;
      ratio: number;
    };
  };
  gaps: Array<{
    app: string;
    normalizedAppId: string;
    totalOperations: number;
    appsScriptEnabled: number;
    appsScriptDisabled: number;
  }>;
};

const DEFAULT_CSV_PATH = 'production/reports/apps-script-runtime-coverage.csv';
const DEFAULT_JSON_PATH = 'production/reports/apps-script-runtime-coverage.json';
const DEFAULT_TARGET = 1;

const parseTarget = (rawTarget: string | undefined): number => {
  if (rawTarget === undefined || rawTarget === null || rawTarget.trim() === '') {
    return DEFAULT_TARGET;
  }

  const value = Number.parseFloat(rawTarget);
  if (!Number.isFinite(value) || value <= 0 || value > 1) {
    throw new Error(`Invalid Apps Script coverage target: "${rawTarget}".`);
  }

  return value;
};

const parseCliOptions = (argv: string[]): CliOptions => {
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
      : parseTarget(process.env.APPS_SCRIPT_COVERAGE_TARGET);

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

const ensureDirectory = async (filePath: string): Promise<void> => {
  const directory = dirname(filePath);
  await mkdir(directory, { recursive: true });
};

const toPercentage = (ratio: number): string => `${(ratio * 100).toFixed(2)}%`;

const buildSummary = (report: CoverageReport, target: number): CoverageSummary => {
  const operationsTotal = report.totals.operations;
  const operationsEnabled = report.totals.appsScriptSupported;
  const operationsDisabled = Math.max(operationsTotal - operationsEnabled, 0);
  const operationsRatio = operationsTotal === 0 ? 1 : operationsEnabled / operationsTotal;

  let connectorsFull = 0;
  let connectorsPartial = 0;
  let connectorsNone = 0;

  const gaps: CoverageSummary['gaps'] = [];

  for (const connector of report.apps) {
    const { totalOperations, appsScriptEnabled, appsScriptDisabled } = connector.summary;
    if (appsScriptEnabled === totalOperations && totalOperations > 0) {
      connectorsFull += 1;
    } else if (appsScriptEnabled > 0) {
      connectorsPartial += 1;
    } else {
      connectorsNone += 1;
    }

    if (appsScriptDisabled > 0 || appsScriptEnabled < totalOperations) {
      gaps.push({
        app: connector.app,
        normalizedAppId: connector.normalizedAppId,
        totalOperations,
        appsScriptEnabled,
        appsScriptDisabled,
      });
    }
  }

  const connectorsTotal = report.apps.length;
  const connectorsRatio = connectorsTotal === 0 ? 1 : connectorsFull / connectorsTotal;

  return {
    generatedAt: new Date().toISOString(),
    target,
    coverage: {
      operations: {
        total: operationsTotal,
        enabled: operationsEnabled,
        disabled: operationsDisabled,
        ratio: operationsRatio,
      },
      connectors: {
        total: connectorsTotal,
        full: connectorsFull,
        partial: connectorsPartial,
        none: connectorsNone,
        ratio: connectorsRatio,
      },
    },
    gaps,
  };
};

const logSummary = (summary: CoverageSummary): void => {
  const operations = summary.coverage.operations;
  const connectors = summary.coverage.connectors;

  console.log('📊 Apps Script Coverage Summary');
  console.log('-------------------------------');
  console.log(`Operations: ${operations.enabled}/${operations.total} (${toPercentage(operations.ratio)})`);
  console.log(`Connectors (full coverage): ${connectors.full}/${connectors.total} (${toPercentage(connectors.ratio)})`);

  if (summary.gaps.length > 0) {
    console.log('\nConnectors missing full Apps Script coverage:');
    for (const gap of summary.gaps) {
      const enabled = `${gap.appsScriptEnabled}/${gap.totalOperations}`;
      console.log(`  • ${gap.app}: ${enabled} operations enabled`);
    }
  } else {
    console.log('\nAll connectors have full Apps Script coverage. ✅');
  }
};

const run = async (): Promise<void> => {
  process.env.NODE_ENV ??= 'development';

  const options = parseCliOptions(process.argv.slice(2));

  await connectorRegistry.init();

  const capabilities = getRuntimeCapabilities();
  const report = buildCoverageReport(capabilities);
  const summary = buildSummary(report, options.target);

  logSummary(summary);

  await Promise.all([
    (async () => {
      await ensureDirectory(options.csvPath);
      await writeFile(options.csvPath, report.csv, 'utf8');
    })(),
    (async () => {
      await ensureDirectory(options.jsonPath);
      await writeFile(options.jsonPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    })(),
  ]);

  if (summary.coverage.operations.ratio + Number.EPSILON < options.target) {
    console.error(
      `\n❌ Apps Script coverage ${toPercentage(summary.coverage.operations.ratio)} is below the target ${toPercentage(options.target)}.`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(`\n✅ Apps Script coverage meets the target of ${toPercentage(options.target)}.`);
};

run().catch(error => {
  console.error('Failed to generate Apps Script coverage report.');
  console.error(error);
  process.exitCode = 1;
});
