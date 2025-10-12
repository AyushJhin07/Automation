import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConnectorImpactMetric, getConnectorImpactMetrics } from '../analytics/business-intelligence.ts';

interface CliOptions {
  crmExport?: string;
  usageExport?: string;
  supportExport?: string;
  weightUsage: number;
  weightRevenue: number;
  weightSupport: number;
}

interface InventoryPair {
  base: string;
  hasStandard: boolean;
  hasEnhanced: boolean;
}

interface InventoryFile {
  pairs: InventoryPair[];
}

interface ManifestConnector {
  id: string;
  normalizedId: string;
  definitionPath: string;
  manifestPath: string;
}

interface ManifestFile {
  connectors: ManifestConnector[];
}

type AdoptionTrend = 'increasing' | 'stable' | 'decreasing';

interface AggregatedConnector {
  connectorId: string;
  hasStandard: boolean;
  hasEnhanced: boolean;
  variants: string[];
  manifestPaths: string[];
  usage: {
    monthlyExecutions: number;
    activeWorkflows: number;
    activeOrganizations: number;
    adoptionTrend: AdoptionTrend;
  };
  revenue: {
    annualRecurringRevenue: number;
    pipelineInfluence: number;
    expansionOpportunities: number;
  };
  support: {
    monthlyTickets: number;
    escalations: number;
    avgResolutionHours: number;
  };
  notes: string[];
  sources: Set<string>;
}

interface CsvRow {
  [key: string]: string;
}

interface ScoreWeights {
  usage: number;
  revenue: number;
  support: number;
}

interface ScoredConnector extends AggregatedConnector {
  scores: {
    usage: number;
    revenue: number;
    support: number;
    composite: number;
  };
  tier: 0 | 1 | 2;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');

const INVENTORY_PATH = resolve(projectRoot, 'production', 'reports', 'connector-inventory.json');
const MANIFEST_PATH = resolve(projectRoot, 'server', 'connector-manifest.json');
const OUTPUT_PATH = resolve(projectRoot, 'production', 'reports', 'apps-script-prioritization.csv');
const ANALYTICS_INPUTS_DIR = resolve(projectRoot, 'analytics', 'inputs');

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    weightUsage: 1,
    weightRevenue: 1,
    weightSupport: 1
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (!token.startsWith('--')) {
      continue;
    }

    const [rawKey, rawValue] = token.split('=');
    const key = rawKey.slice(2);
    let value = rawValue;

    if (value === undefined) {
      value = argv[i + 1];
      if (value && !value.startsWith('--')) {
        i += 1;
      } else {
        value = undefined;
      }
    }

    switch (key) {
      case 'crm':
        options.crmExport = value;
        break;
      case 'usage':
        options.usageExport = value;
        break;
      case 'support':
        options.supportExport = value;
        break;
      case 'weight-usage':
        options.weightUsage = value ? Number.parseFloat(value) : options.weightUsage;
        break;
      case 'weight-revenue':
        options.weightRevenue = value ? Number.parseFloat(value) : options.weightRevenue;
        break;
      case 'weight-support':
        options.weightSupport = value ? Number.parseFloat(value) : options.weightSupport;
        break;
      default:
        console.warn(`⚠️  Unknown flag: --${key}`);
    }
  }

  return options;
}

function normalizeConnectorId(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/_/g, '-')
    .replace(/-enhanced$/, '')
    .replace(/-standard$/, '');
}

async function storeInputFile(label: string, inputPath?: string): Promise<string | undefined> {
  if (!inputPath) {
    return undefined;
  }

  const resolvedInput = resolve(process.cwd(), inputPath);
  const destinationName = `${label}-${basename(resolvedInput)}`;
  const destinationPath = resolve(ANALYTICS_INPUTS_DIR, destinationName);

  await mkdir(ANALYTICS_INPUTS_DIR, { recursive: true });
  await copyFile(resolvedInput, destinationPath);

  console.log(`📥 Stored ${label.toUpperCase()} export at ${destinationPath}`);

  return destinationPath;
}

function parseCsv(content: string): CsvRow[] {
  const trimmed = content.trim();
  if (!trimmed) {
    return [];
  }

  const rows: CsvRow[] = [];
  const lines = trimmed.split(/\r?\n/);
  const rawHeaders = parseCsvLine(lines[0]);
  const headers = rawHeaders.map(header => header.trim().toLowerCase().replace(/\s+/g, '_'));

  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line || /^\s*$/.test(line)) {
      continue;
    }

    const cells = parseCsvLine(line);
    const row: CsvRow = {};
    headers.forEach((header, index) => {
      row[header] = (cells[index] ?? '').trim();
    });
    rows.push(row);
  }

  return rows;
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ',') {
      values.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current.trim());

  return values;
}

async function loadCsvMap(filePath?: string): Promise<Map<string, CsvRow>> {
  if (!filePath) {
    return new Map();
  }

  const content = await readFile(filePath, 'utf-8');
  const rows = parseCsv(content);
  const map = new Map<string, CsvRow>();

  for (const row of rows) {
    const connectorId = row.connector_id ?? row.connector ?? row.id ?? row.app ?? '';
    const normalized = normalizeConnectorId(connectorId);

    if (!normalized) {
      console.warn('⚠️  Skipping row without connector identifier in CSV.');
      continue;
    }

    map.set(normalized, row);
  }

  return map;
}

function parseNumericInput(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }

  const cleaned = value
    .replace(/[$,%]/g, '')
    .replace(/,/g, '')
    .trim();

  if (!cleaned) {
    return undefined;
  }

  const parsed = Number.parseFloat(cleaned);

  return Number.isFinite(parsed) ? parsed : undefined;
}

function createConnectorRecord(
  connectorId: string,
  manifest: ManifestFile,
  inventoryPair?: InventoryPair
): AggregatedConnector {
  const normalized = normalizeConnectorId(connectorId);
  const manifestVariants = manifest.connectors.filter(connector => {
    const id = normalizeConnectorId(connector.id);
    return id === normalized;
  });

  const manifestPaths = manifestVariants.map(entry => entry.manifestPath);
  const variants = manifestVariants.map(entry => entry.id);

  if (variants.length === 0) {
    variants.push(normalized);
  }
  const hasStandard =
    inventoryPair?.hasStandard ??
    manifestVariants.some(entry => entry.id === normalized || entry.id === `${normalized}-standard`);
  const hasEnhanced =
    inventoryPair?.hasEnhanced ??
    manifestVariants.some(entry => entry.id === `${normalized}-enhanced` || entry.id.endsWith('-enhanced'));

  return {
    connectorId: normalized,
    hasStandard,
    hasEnhanced,
    variants,
    manifestPaths,
    usage: {
      monthlyExecutions: 0,
      activeWorkflows: 0,
      activeOrganizations: 0,
      adoptionTrend: 'stable'
    },
    revenue: {
      annualRecurringRevenue: 0,
      pipelineInfluence: 0,
      expansionOpportunities: 0
    },
    support: {
      monthlyTickets: 0,
      escalations: 0,
      avgResolutionHours: 0
    },
    notes: [],
    sources: new Set<string>()
  };
}

function ensureConnector(
  connectors: Map<string, AggregatedConnector>,
  connectorId: string,
  manifest: ManifestFile,
  inventoryPair?: InventoryPair
): AggregatedConnector {
  const normalized = normalizeConnectorId(connectorId);
  const existing = connectors.get(normalized);
  if (existing) {
    if (inventoryPair) {
      existing.hasStandard = inventoryPair.hasStandard;
      existing.hasEnhanced = inventoryPair.hasEnhanced;
    }
    return existing;
  }

  const record = createConnectorRecord(normalized, manifest, inventoryPair);
  connectors.set(normalized, record);
  return record;
}

function mergeAnalytics(
  connectors: Map<string, AggregatedConnector>,
  analytics: ConnectorImpactMetric[],
  manifest: ManifestFile
): void {
  for (const metric of analytics) {
    const record = ensureConnector(connectors, metric.connectorId, manifest);

    record.usage.monthlyExecutions = metric.usage.monthlyExecutions;
    record.usage.activeWorkflows = metric.usage.activeWorkflows;
    record.usage.activeOrganizations = metric.usage.activeOrganizations;
    record.usage.adoptionTrend = metric.usage.adoptionTrend;

    record.revenue.annualRecurringRevenue = metric.revenue.annualRecurringRevenue;
    record.revenue.pipelineInfluence = metric.revenue.pipelineInfluence;
    record.revenue.expansionOpportunities = metric.revenue.expansionOpportunities;

    record.support.monthlyTickets = metric.support.monthlyTickets;
    record.support.escalations = metric.support.escalations;
    record.support.avgResolutionHours = metric.support.avgResolutionHours;

    if (metric.notes) {
      record.notes.push(`Analytics: ${metric.notes}`);
    }

    record.sources.add('analytics');
  }
}

function mergeUsageCsv(
  connectors: Map<string, AggregatedConnector>,
  usageRows: Map<string, CsvRow>,
  manifest: ManifestFile
): void {
  for (const [connectorId, row] of usageRows.entries()) {
    const record = ensureConnector(connectors, connectorId, manifest);
    const monthlyExecutions = parseNumericInput(row.monthly_executions ?? row.executions ?? row.runs);
    const activeWorkflows = parseNumericInput(row.active_workflows ?? row.workflows);
    const activeOrganizations = parseNumericInput(row.active_organizations ?? row.accounts ?? row.tenants);
    const adoptionTrend = (row.adoption_trend ?? row.trend ?? '').toLowerCase();

    if (monthlyExecutions !== undefined) {
      record.usage.monthlyExecutions = monthlyExecutions;
    }
    if (activeWorkflows !== undefined) {
      record.usage.activeWorkflows = activeWorkflows;
    }
    if (activeOrganizations !== undefined) {
      record.usage.activeOrganizations = activeOrganizations;
    }
    if (adoptionTrend === 'increasing' || adoptionTrend === 'stable' || adoptionTrend === 'decreasing') {
      record.usage.adoptionTrend = adoptionTrend;
    }

    record.sources.add('usage-csv');
  }
}

function mergeCrmCsv(
  connectors: Map<string, AggregatedConnector>,
  crmRows: Map<string, CsvRow>,
  manifest: ManifestFile
): void {
  for (const [connectorId, row] of crmRows.entries()) {
    const record = ensureConnector(connectors, connectorId, manifest);
    const arr = parseNumericInput(row.annual_recurring_revenue ?? row.arr ?? row.revenue);
    const pipeline = parseNumericInput(row.pipeline_influence ?? row.pipeline ?? row.pipe);
    const expansion = parseNumericInput(row.expansion_opportunities ?? row.expansion ?? row.xsell);

    if (arr !== undefined) {
      record.revenue.annualRecurringRevenue = arr;
    }
    if (pipeline !== undefined) {
      record.revenue.pipelineInfluence = pipeline;
    }
    if (expansion !== undefined) {
      record.revenue.expansionOpportunities = expansion;
    }

    record.sources.add('crm-csv');
  }
}

function mergeSupportCsv(
  connectors: Map<string, AggregatedConnector>,
  supportRows: Map<string, CsvRow>,
  manifest: ManifestFile
): void {
  for (const [connectorId, row] of supportRows.entries()) {
    const record = ensureConnector(connectors, connectorId, manifest);
    const tickets = parseNumericInput(row.monthly_tickets ?? row.tickets ?? row.cases);
    const escalations = parseNumericInput(row.escalations ?? row.high_priority ?? row.sev1);
    const resolution = parseNumericInput(row.avg_resolution_hours ?? row.resolution_hours ?? row.resolution);

    if (tickets !== undefined) {
      record.support.monthlyTickets = tickets;
    }
    if (escalations !== undefined) {
      record.support.escalations = escalations;
    }
    if (resolution !== undefined) {
      record.support.avgResolutionHours = resolution;
    }

    record.sources.add('support-csv');
  }
}

function computeScores(connectors: AggregatedConnector[], weights: ScoreWeights): ScoredConnector[] {
  const maxMonthlyExecutions = Math.max(0, ...connectors.map(record => record.usage.monthlyExecutions));
  const maxActiveOrganizations = Math.max(0, ...connectors.map(record => record.usage.activeOrganizations));
  const maxArr = Math.max(0, ...connectors.map(record => record.revenue.annualRecurringRevenue));
  const maxPipeline = Math.max(0, ...connectors.map(record => record.revenue.pipelineInfluence));
  const maxTickets = Math.max(0, ...connectors.map(record => record.support.monthlyTickets));
  const maxEscalations = Math.max(0, ...connectors.map(record => record.support.escalations));
  const maxResolution = Math.max(0, ...connectors.map(record => record.support.avgResolutionHours));

  const weightTotal = weights.usage + weights.revenue + weights.support;
  const normalizedWeights: ScoreWeights = weightTotal > 0
    ? {
        usage: weights.usage / weightTotal,
        revenue: weights.revenue / weightTotal,
        support: weights.support / weightTotal
      }
    : { usage: 1 / 3, revenue: 1 / 3, support: 1 / 3 };

  return connectors.map(record => {
    const usageScore = average([
      normalize(record.usage.monthlyExecutions, maxMonthlyExecutions),
      normalize(record.usage.activeOrganizations, maxActiveOrganizations)
    ]);

    const revenueScore = average([
      normalize(record.revenue.annualRecurringRevenue, maxArr),
      normalize(record.revenue.pipelineInfluence, maxPipeline)
    ]);

    const supportPenalty = average([
      normalize(record.support.monthlyTickets, maxTickets),
      normalize(record.support.escalations, maxEscalations),
      normalize(record.support.avgResolutionHours, maxResolution)
    ]);
    const supportScore = clamp(1 - supportPenalty, 0, 1);

    const composite =
      usageScore * normalizedWeights.usage +
      revenueScore * normalizedWeights.revenue +
      supportScore * normalizedWeights.support;

    const tier: 0 | 1 | 2 = composite >= 0.75 ? 0 : composite >= 0.5 ? 1 : 2;

    return {
      ...record,
      scores: {
        usage: usageScore,
        revenue: revenueScore,
        support: supportScore,
        composite
      },
      tier
    };
  });
}

function normalize(value: number, max: number): number {
  if (!Number.isFinite(value) || value <= 0 || max <= 0) {
    return 0;
  }
  return clamp(value / max, 0, 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sum = values.reduce((acc, value) => acc + value, 0);
  return sum / values.length;
}

function formatCurrency(value: number): string {
  if (!Number.isFinite(value) || value === 0) {
    return '$0';
  }
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value >= 1000 ? 0 : 2
  });
  return formatter.format(value);
}

function formatCsvValue(value: string | number | boolean): string {
  const stringValue = typeof value === 'string' ? value : typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value);

  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

function toCsv(records: ScoredConnector[]): string {
  const header = [
    'connector_id',
    'has_standard',
    'has_enhanced',
    'variants',
    'monthly_executions',
    'active_workflows',
    'active_organizations',
    'adoption_trend',
    'annual_recurring_revenue',
    'pipeline_influence',
    'expansion_opportunities',
    'support_tickets',
    'support_escalations',
    'avg_resolution_hours',
    'usage_score',
    'revenue_score',
    'support_score',
    'composite_score',
    'tier',
    'sources',
    'notes'
  ];

  const rows = records.map(record => [
    record.connectorId,
    record.hasStandard,
    record.hasEnhanced,
    record.variants.join('|'),
    record.usage.monthlyExecutions,
    record.usage.activeWorkflows,
    record.usage.activeOrganizations,
    record.usage.adoptionTrend,
    record.revenue.annualRecurringRevenue,
    record.revenue.pipelineInfluence,
    record.revenue.expansionOpportunities,
    record.support.monthlyTickets,
    record.support.escalations,
    record.support.avgResolutionHours,
    record.scores.usage.toFixed(3),
    record.scores.revenue.toFixed(3),
    record.scores.support.toFixed(3),
    record.scores.composite.toFixed(3),
    record.tier,
    Array.from(record.sources).join('|'),
    record.notes.join(' | ')
  ].map(formatCsvValue).join(','));

  return [header.join(','), ...rows].join('\n');
}

function printSummary(records: ScoredConnector[], weights: ScoreWeights): void {
  const total = records.length;
  const tiers = records.reduce(
    (acc, record) => {
      acc[record.tier].push(record);
      return acc;
    },
    {
      0: [] as ScoredConnector[],
      1: [] as ScoredConnector[],
      2: [] as ScoredConnector[]
    }
  );

  console.log('\n🧮 Apps Script Connector Prioritization');
  console.log('====================================');
  console.log(`Total connectors evaluated: ${total}`);
  console.log(
    `Weights — Usage: ${weights.usage.toFixed(2)}, Revenue: ${weights.revenue.toFixed(2)}, Support: ${weights.support.toFixed(2)}`
  );
  console.log('');

  (Object.keys(tiers) as Array<'0' | '1' | '2'>)
    .sort()
    .forEach(tierKey => {
      const tierNumber = Number.parseInt(tierKey, 10) as 0 | 1 | 2;
      const tierRecords = tiers[tierNumber].sort((a, b) => b.scores.composite - a.scores.composite);
      console.log(`Tier ${tierNumber} — ${tierRecords.length} connector${tierRecords.length === 1 ? '' : 's'}`);

      tierRecords.slice(0, 5).forEach(record => {
        console.log(
          `  • ${record.connectorId.padEnd(18)} score ${record.scores.composite.toFixed(3)} — ` +
            `${formatCurrency(record.revenue.annualRecurringRevenue)} ARR, ` +
            `${record.usage.monthlyExecutions.toLocaleString()} monthly runs, ` +
            `${record.support.monthlyTickets.toLocaleString()} support tickets`
        );
      });

      if (tierRecords.length > 5) {
        console.log(`    … ${tierRecords.length - 5} more`);
      }

      console.log('');
    });

  console.log(`📄 CSV written to ${OUTPUT_PATH}`);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  await mkdir(ANALYTICS_INPUTS_DIR, { recursive: true });

  const [crmPath, usagePath, supportPath] = await Promise.all([
    storeInputFile('crm', options.crmExport),
    storeInputFile('usage', options.usageExport),
    storeInputFile('support', options.supportExport)
  ]);

  const [inventoryRaw, manifestRaw] = await Promise.all([
    readFile(INVENTORY_PATH, 'utf-8'),
    readFile(MANIFEST_PATH, 'utf-8')
  ]);

  const inventory = JSON.parse(inventoryRaw) as InventoryFile;
  const manifest = JSON.parse(manifestRaw) as ManifestFile;

  const connectors = new Map<string, AggregatedConnector>();

  for (const pair of inventory.pairs ?? []) {
    ensureConnector(connectors, pair.base, manifest, pair);
  }

  mergeAnalytics(connectors, getConnectorImpactMetrics(), manifest);

  const [crmRows, usageRows, supportRows] = await Promise.all([
    loadCsvMap(crmPath),
    loadCsvMap(usagePath),
    loadCsvMap(supportPath)
  ]);

  mergeCrmCsv(connectors, crmRows, manifest);
  mergeUsageCsv(connectors, usageRows, manifest);
  mergeSupportCsv(connectors, supportRows, manifest);

  const aggregated = Array.from(connectors.values()).sort((a, b) => a.connectorId.localeCompare(b.connectorId));
  const scored = computeScores(aggregated, {
    usage: options.weightUsage,
    revenue: options.weightRevenue,
    support: options.weightSupport
  });

  const scoredSorted = scored.sort((a, b) => b.scores.composite - a.scores.composite);
  const csvContent = toCsv(scoredSorted);

  await writeFile(OUTPUT_PATH, csvContent, 'utf-8');
  printSummary(scoredSorted, {
    usage: options.weightUsage,
    revenue: options.weightRevenue,
    support: options.weightSupport
  });
}

main().catch(error => {
  console.error('❌ Failed to prioritize connectors.');
  console.error(error);
  process.exitCode = 1;
});
