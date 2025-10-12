import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');

const MANIFEST_PATH = resolve(projectRoot, 'server', 'connector-manifest.json');
const INVENTORY_PATH = resolve(projectRoot, 'production', 'reports', 'connector-inventory.json');
const ANALYTICS_PATH = resolve(projectRoot, 'analytics', 'business-intelligence.ts');
const OUTPUT_PATH = resolve(projectRoot, 'production', 'reports', 'apps-script-prioritization.csv');

function normalizeConnectorId(raw) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/_/g, '-')
    .replace(/-enhanced$/, '')
    .replace(/-standard$/, '');
}

function createEmptyRecord(connectorId) {
  return {
    connectorId,
    variants: new Set(),
    manifestPaths: new Set(),
    hasStandard: false,
    hasEnhanced: false,
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
    sources: new Set(['manifest'])
  };
}

async function loadManifest() {
  const raw = await readFile(MANIFEST_PATH, 'utf-8');
  const parsed = JSON.parse(raw);
  const connectors = new Map();

  for (const entry of parsed.connectors ?? []) {
    const baseId = normalizeConnectorId(entry.id ?? '');
    if (!baseId) {
      continue;
    }
    let record = connectors.get(baseId);
    if (!record) {
      record = createEmptyRecord(baseId);
      connectors.set(baseId, record);
    }

    record.variants.add(entry.id);
    if (entry.manifestPath) {
      record.manifestPaths.add(entry.manifestPath);
    }

    if (entry.id?.endsWith('-enhanced')) {
      record.hasEnhanced = true;
    } else if (entry.id?.endsWith('-standard')) {
      record.hasStandard = true;
    } else {
      record.hasStandard = true;
    }
  }

  return connectors;
}

async function loadInventory(connectors) {
  try {
    const raw = await readFile(INVENTORY_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    for (const pair of parsed.pairs ?? []) {
      const baseId = normalizeConnectorId(pair.base ?? '');
      if (!baseId) continue;
      let record = connectors.get(baseId);
      if (!record) {
        record = createEmptyRecord(baseId);
        connectors.set(baseId, record);
      }
      if (typeof pair.hasStandard === 'boolean') {
        record.hasStandard = pair.hasStandard;
      }
      if (typeof pair.hasEnhanced === 'boolean') {
        record.hasEnhanced = pair.hasEnhanced;
      }
    }
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return;
    }
    throw error;
  }
}

async function loadConnectorImpactMetrics() {
  const source = await readFile(ANALYTICS_PATH, 'utf-8');
  const match = source.match(/export const connectorImpactMetrics: ConnectorImpactMetric\[] = (\[[\s\S]*?\]);/);
  if (!match) {
    throw new Error('Unable to locate connector impact metrics in analytics/business-intelligence.ts');
  }
  const context = { result: [] };
  vm.createContext(context);
  vm.runInContext(`result = ${match[1]}`, context);
  return Array.isArray(context.result) ? context.result : [];
}

function mergeAnalytics(connectors, metrics) {
  for (const metric of metrics) {
    if (!metric?.connectorId) continue;
    const baseId = normalizeConnectorId(metric.connectorId);
    if (!baseId) continue;
    let record = connectors.get(baseId);
    if (!record) {
      record = createEmptyRecord(baseId);
      connectors.set(baseId, record);
    }

    record.usage.monthlyExecutions = Number(metric.usage?.monthlyExecutions ?? 0);
    record.usage.activeWorkflows = Number(metric.usage?.activeWorkflows ?? 0);
    record.usage.activeOrganizations = Number(metric.usage?.activeOrganizations ?? 0);
    record.usage.adoptionTrend = metric.usage?.adoptionTrend ?? record.usage.adoptionTrend;

    record.revenue.annualRecurringRevenue = Number(metric.revenue?.annualRecurringRevenue ?? 0);
    record.revenue.pipelineInfluence = Number(metric.revenue?.pipelineInfluence ?? 0);
    record.revenue.expansionOpportunities = Number(metric.revenue?.expansionOpportunities ?? 0);

    record.support.monthlyTickets = Number(metric.support?.monthlyTickets ?? 0);
    record.support.escalations = Number(metric.support?.escalations ?? 0);
    record.support.avgResolutionHours = Number(metric.support?.avgResolutionHours ?? 0);

    if (metric.notes) {
      record.notes.push(`Analytics: ${metric.notes}`);
    }
    record.sources.add('analytics');
  }
}

function computeScores(records) {
  const maxMonthlyExecutions = Math.max(0, ...records.map(record => record.usage.monthlyExecutions));
  const maxActiveOrganizations = Math.max(0, ...records.map(record => record.usage.activeOrganizations));
  const maxArr = Math.max(0, ...records.map(record => record.revenue.annualRecurringRevenue));
  const maxPipeline = Math.max(0, ...records.map(record => record.revenue.pipelineInfluence));
  const maxTickets = Math.max(0, ...records.map(record => record.support.monthlyTickets));
  const maxEscalations = Math.max(0, ...records.map(record => record.support.escalations));
  const maxResolution = Math.max(0, ...records.map(record => record.support.avgResolutionHours));

  const weights = { usage: 1, revenue: 1, support: 1 };
  const weightTotal = weights.usage + weights.revenue + weights.support;
  const normalizedWeights = {
    usage: weights.usage / weightTotal,
    revenue: weights.revenue / weightTotal,
    support: weights.support / weightTotal
  };

  return records.map(record => {
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

    const tier = composite >= 0.75 ? 0 : composite >= 0.5 ? 1 : 2;

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

function normalize(value, max) {
  if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(max) || max <= 0) {
    return 0;
  }
  return clamp(value / max, 0, 1);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function average(values) {
  if (!values.length) return 0;
  const sum = values.reduce((acc, value) => acc + value, 0);
  return sum / values.length;
}

function formatCsvValue(value) {
  const stringValue = typeof value === 'string' ? value : typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function toCsv(records) {
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

  const rows = records.map(record => {
    const values = [
      record.connectorId,
      record.hasStandard,
      record.hasEnhanced,
      Array.from(record.variants).join('|'),
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
    ];
    return values.map(formatCsvValue).join(',');
  });

  return [header.join(','), ...rows].join('\n');
}

function printSummary(records) {
  const total = records.length;
  const tiers = records.reduce(
    (acc, record) => {
      acc[record.tier].push(record);
      return acc;
    },
    { 0: [], 1: [], 2: [] }
  );

  console.log('\n🧮 Apps Script Connector Prioritization');
  console.log('====================================');
  console.log(`Total connectors evaluated: ${total}`);
  console.log('');

  for (const tier of [0, 1, 2]) {
    const entries = tiers[tier];
    console.log(`Tier ${tier} — ${entries.length} connector${entries.length === 1 ? '' : 's'}`);
    const preview = entries
      .slice(0, 5)
      .map(record => {
        const arr = record.revenue.annualRecurringRevenue.toLocaleString('en-US', {
          style: 'currency',
          currency: 'USD',
          maximumFractionDigits: 0
        });
        const runs = record.usage.monthlyExecutions.toLocaleString('en-US');
        const tickets = record.support.monthlyTickets.toLocaleString('en-US');
        return `  • ${record.connectorId.padEnd(18)} score ${record.scores.composite.toFixed(3)} — ${arr} ARR, ${runs} monthly runs, ${tickets} support tickets`;
      });
    preview.forEach(line => console.log(line));
    if (entries.length > 5) {
      console.log(`    … ${entries.length - 5} more`);
    }
    console.log('');
  }
}

async function main() {
  const connectors = await loadManifest();
  await loadInventory(connectors);
  const metrics = await loadConnectorImpactMetrics();
  mergeAnalytics(connectors, metrics);

  const aggregated = Array.from(connectors.values()).sort((a, b) => a.connectorId.localeCompare(b.connectorId));
  const scored = computeScores(aggregated);
  const sorted = scored.sort((a, b) => b.scores.composite - a.scores.composite);
  const csv = toCsv(sorted);

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, csv, 'utf-8');
  printSummary(sorted);
  console.log(`📄 CSV written to ${OUTPUT_PATH}`);
}

main().catch(error => {
  console.error('❌ Failed to generate Apps Script prioritization report.');
  console.error(error);
  process.exitCode = 1;
});
