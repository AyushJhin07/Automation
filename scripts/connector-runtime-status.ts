import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';

import { connectorRegistry } from '../server/ConnectorRegistry.js';
import {
  getRuntimeCapabilities,
  type RuntimeCapabilityOperationSummary,
  type RuntimeCapabilitySummary,
} from '../server/runtime/registry.js';

type RuntimeTotals = {
  operations: number;
  nodeSupported: number;
  appsScriptSupported: number;
  bothRuntimes: number;
  neitherRuntime: number;
  nodeDisabled: number;
  appsScriptDisabled: number;
};

type RuntimeSupportCategory = 'both' | 'node' | 'appsScript' | 'neither';

type RuntimeSupportSummary = {
  summary: string;
  category: RuntimeSupportCategory;
  nodeAvailable: boolean;
  nodeEnabled: boolean;
  appsScriptAvailable: boolean;
  appsScriptEnabled: boolean;
};

type ConnectorSummaryCounts = {
  totalOperations: number;
  appsScriptAvailable: number;
  appsScriptEnabled: number;
  appsScriptDisabled: number;
};

type OperationReport = {
  detail: RuntimeCapabilityOperationSummary;
  evaluation: RuntimeSupportSummary;
};

type ConnectorReport = {
  app: string;
  normalizedAppId: string;
  operations: OperationReport[];
  summary: ConnectorSummaryCounts;
};

export type CoverageReport = {
  csv: string;
  rows: string[][];
  totals: RuntimeTotals;
  apps: ConnectorReport[];
};

const DEFAULT_OUTPUT_PATH = 'production/reports/apps-script-runtime-coverage.csv';

const CSV_HEADERS = [
  'type',
  'connector',
  'normalized_connector',
  'operation',
  'normalized_operation',
  'kind',
  'node_available',
  'node_enabled',
  'apps_script_available',
  'apps_script_enabled',
  'apps_script_disabled',
  'total_operations',
  'apps_script_available_count',
  'apps_script_enabled_count',
  'apps_script_disabled_count',
];

const createEmptyTotals = (): RuntimeTotals => ({
  operations: 0,
  nodeSupported: 0,
  appsScriptSupported: 0,
  bothRuntimes: 0,
  neitherRuntime: 0,
  nodeDisabled: 0,
  appsScriptDisabled: 0,
});

const formatBoolean = (value: boolean): string => (value ? 'TRUE' : 'FALSE');

const escapeCsvValue = (value: string): string => {
  if (value === '') {
    return '';
  }
  const needsQuoting = /[",\n]/u.test(value);
  if (!needsQuoting) {
    return value;
  }
  return `"${value.replace(/"/gu, '""')}"`;
};

const serializeCoverageRows = (rows: string[][]): string => {
  const lines = [CSV_HEADERS, ...rows].map(columns =>
    columns.map(column => escapeCsvValue(column)).join(','),
  );
  return `${lines.join('\n')}\n`;
};

const describeRuntimeSupport = (
  detail: RuntimeCapabilityOperationSummary,
  totals: RuntimeTotals,
): RuntimeSupportSummary => {
  const includesRuntime = (runtime: 'node' | 'appsScript'): boolean =>
    detail.nativeRuntimes.includes(runtime) || detail.fallbackRuntimes.includes(runtime);

  const runtimeEnabled = (runtime: 'node' | 'appsScript'): boolean =>
    detail.enabledNativeRuntimes.includes(runtime) ||
    detail.enabledFallbackRuntimes.includes(runtime);

  const nodeEnabled = runtimeEnabled('node');
  const appsScriptEnabled = runtimeEnabled('appsScript');
  const nodeAvailable = includesRuntime('node');
  const appsScriptAvailable = includesRuntime('appsScript');

  const parts: string[] = [];

  if (nodeEnabled) {
    parts.push('Node.js ✅');
  } else if (nodeAvailable) {
    parts.push('Node.js (disabled)');
  } else {
    parts.push('Node.js ❌');
  }

  if (appsScriptEnabled) {
    parts.push('Apps Script ✅');
  } else if (appsScriptAvailable) {
    parts.push('Apps Script (disabled)');
  } else {
    parts.push('Apps Script ❌');
  }

  let category: RuntimeSupportCategory = 'neither';
  if (nodeEnabled && appsScriptEnabled) {
    category = 'both';
  } else if (nodeEnabled) {
    category = 'node';
  } else if (appsScriptEnabled) {
    category = 'appsScript';
  }

  if (!nodeEnabled && nodeAvailable) {
    totals.nodeDisabled += 1;
  }
  if (!appsScriptEnabled && appsScriptAvailable) {
    totals.appsScriptDisabled += 1;
  }

  if (nodeEnabled) {
    totals.nodeSupported += 1;
  }
  if (appsScriptEnabled) {
    totals.appsScriptSupported += 1;
  }

  switch (category) {
    case 'both':
      totals.bothRuntimes += 1;
      break;
    case 'node':
    case 'appsScript':
      // handled via per-runtime counters
      break;
    case 'neither':
      totals.neitherRuntime += 1;
      break;
  }

  return {
    summary: parts.join(' | '),
    category,
    nodeAvailable,
    nodeEnabled,
    appsScriptAvailable,
    appsScriptEnabled,
  };
};

const buildConnectorReport = (
  capabilities: RuntimeCapabilitySummary[],
): { rows: string[][]; totals: RuntimeTotals; apps: ConnectorReport[] } => {
  const totals = createEmptyTotals();
  const rows: string[][] = [];
  const apps: ConnectorReport[] = [];

  for (const app of capabilities) {
    const operations: RuntimeCapabilityOperationSummary[] = [
      ...Object.values(app.actionDetails),
      ...Object.values(app.triggerDetails),
    ].sort((a, b) => {
      if (a.kind !== b.kind) {
        return a.kind.localeCompare(b.kind);
      }
      return a.id.localeCompare(b.id);
    });

    if (operations.length === 0) {
      continue;
    }

    const connectorSummary: ConnectorSummaryCounts = {
      totalOperations: operations.length,
      appsScriptAvailable: 0,
      appsScriptEnabled: 0,
      appsScriptDisabled: 0,
    };

    const operationReports: OperationReport[] = [];

    for (const op of operations) {
      totals.operations += 1;
      const evaluation = describeRuntimeSupport(op, totals);
      operationReports.push({ detail: op, evaluation });

      if (evaluation.appsScriptAvailable) {
        connectorSummary.appsScriptAvailable += 1;
      }
      if (evaluation.appsScriptEnabled) {
        connectorSummary.appsScriptEnabled += 1;
      } else if (evaluation.appsScriptAvailable) {
        connectorSummary.appsScriptDisabled += 1;
      }

      rows.push([
        'operation',
        app.app,
        app.normalizedAppId,
        op.id,
        op.normalizedId,
        op.kind,
        formatBoolean(evaluation.nodeAvailable),
        formatBoolean(evaluation.nodeEnabled),
        formatBoolean(evaluation.appsScriptAvailable),
        formatBoolean(evaluation.appsScriptEnabled),
        formatBoolean(evaluation.appsScriptAvailable && !evaluation.appsScriptEnabled),
        '',
        '',
        '',
        '',
      ]);
    }

    rows.push([
      'connector_summary',
      app.app,
      app.normalizedAppId,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      String(connectorSummary.totalOperations),
      String(connectorSummary.appsScriptAvailable),
      String(connectorSummary.appsScriptEnabled),
      String(connectorSummary.appsScriptDisabled),
    ]);

    apps.push({
      app: app.app,
      normalizedAppId: app.normalizedAppId,
      operations: operationReports,
      summary: connectorSummary,
    });
  }

  return { rows, totals, apps };
};

export const buildCoverageReport = (capabilities: RuntimeCapabilitySummary[]): CoverageReport => {
  const { rows, totals, apps } = buildConnectorReport(capabilities);
  const csv = serializeCoverageRows(rows);
  return { csv, rows, totals, apps };
};

type CliOptions = {
  output: string;
};

const parseCliOptions = (argv: string[]): CliOptions => {
  const { values } = parseArgs({
    args: argv,
    options: {
      output: { type: 'string', short: 'o' },
    },
  });

  return {
    output: typeof values.output === 'string' && values.output.trim() !== ''
      ? values.output
      : DEFAULT_OUTPUT_PATH,
  };
};

const ensureDirectory = async (filePath: string): Promise<void> => {
  const directory = dirname(filePath);
  await mkdir(directory, { recursive: true });
};

const run = async (): Promise<void> => {
  process.env.NODE_ENV ??= 'development';

  const options = parseCliOptions(process.argv.slice(2));

  await connectorRegistry.init();

  const capabilities = getRuntimeCapabilities();
  const report = buildCoverageReport(capabilities);

  console.log('🔌 Connector Runtime Support Report');
  console.log('===================================');

  for (const appReport of report.apps) {
    console.log(`\n${appReport.app} (${appReport.summary.totalOperations} operations)`);
    for (const operation of appReport.operations) {
      console.log(`  [${operation.detail.kind}] ${operation.detail.id}: ${operation.evaluation.summary}`);
    }
  }

  console.log('\nSummary');
  console.log('-------');
  console.log(`Total operations: ${report.totals.operations}`);
  console.log(`Node.js enabled: ${report.totals.nodeSupported}`);
  console.log(`Apps Script enabled: ${report.totals.appsScriptSupported}`);
  console.log(`Both runtimes enabled: ${report.totals.bothRuntimes}`);
  console.log(`Neither runtime enabled: ${report.totals.neitherRuntime}`);
  if (report.totals.nodeDisabled > 0 || report.totals.appsScriptDisabled > 0) {
    console.log('\nRuntimes available but disabled by flag:');
    if (report.totals.nodeDisabled > 0) {
      console.log(`  Node.js disabled operations: ${report.totals.nodeDisabled}`);
    }
    if (report.totals.appsScriptDisabled > 0) {
      console.log(`  Apps Script disabled operations: ${report.totals.appsScriptDisabled}`);
    }
  }

  await ensureDirectory(options.output);
  await writeFile(options.output, report.csv, 'utf8');
  console.log(`\nSaved Apps Script runtime coverage CSV to ${options.output}`);
};

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch(error => {
    console.error('Failed to generate runtime support report.');
    console.error(error);
    process.exitCode = 1;
  });
}
