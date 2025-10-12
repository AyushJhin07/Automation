import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');

const MANIFEST_PATH = resolve(projectRoot, 'server', 'connector-manifest.json');
const PRIORITIZATION_CSV_PATH = resolve(projectRoot, 'production', 'reports', 'apps-script-prioritization.csv');
const BACKLOG_PATH = resolve(projectRoot, 'docs', 'apps-script-rollout', 'backlog.md');

function normalizeConnectorId(raw) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/_/g, '-')
    .replace(/-enhanced$/, '')
    .replace(/-standard$/, '');
}

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current);
  return values.map(value => value.trim());
}

async function loadPrioritizationTiers() {
  const raw = await readFile(PRIORITIZATION_CSV_PATH, 'utf-8');
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) {
    return new Map();
  }
  const header = parseCsvLine(lines[0]);
  const tierIndex = header.findIndex(cell => cell === 'tier');
  const idIndex = header.findIndex(cell => cell === 'connector_id');
  if (tierIndex === -1 || idIndex === -1) {
    return new Map();
  }
  const tiers = new Map();
  for (let i = 1; i < lines.length; i += 1) {
    const row = parseCsvLine(lines[i]);
    const connectorId = row[idIndex]?.replace(/^"|"$/g, '');
    const tierValue = row[tierIndex]?.replace(/^"|"$/g, '');
    if (!connectorId) continue;
    const parsedTier = Number.parseInt(tierValue, 10);
    if (Number.isNaN(parsedTier)) {
      continue;
    }
    tiers.set(normalizeConnectorId(connectorId), parsedTier);
  }
  return tiers;
}

async function loadManifestConnectors() {
  const raw = await readFile(MANIFEST_PATH, 'utf-8');
  const parsed = JSON.parse(raw);
  return parsed.connectors ?? [];
}

async function loadDefinition(definitionPath) {
  const fullPath = resolve(projectRoot, definitionPath);
  const raw = await readFile(fullPath, 'utf-8');
  return JSON.parse(raw);
}

function collectOperations(definition) {
  const actions = Array.isArray(definition.actions)
    ? definition.actions
    : Object.values(definition.actions ?? {});
  const triggers = Array.isArray(definition.triggers)
    ? definition.triggers
    : Object.values(definition.triggers ?? {});
  return [...actions, ...triggers].filter(Boolean);
}

function computeRuntimeStatus(operations) {
  const totalOps = operations.length;
  if (totalOps === 0) {
    return { label: '—', totalOps, appsSupported: 0 };
  }
  const appsSupported = operations.filter(op => Array.isArray(op.runtimes) && op.runtimes.includes('appsScript')).length;
  if (appsSupported === totalOps) {
    return { label: `✅ Full (${appsSupported}/${totalOps})`, totalOps, appsSupported };
  }
  if (appsSupported > 0) {
    return { label: `⚠️ Partial (${appsSupported}/${totalOps})`, totalOps, appsSupported };
  }
  return { label: `❌ None (${appsSupported}/${totalOps})`, totalOps, appsSupported };
}

function formatLinks(manifestPath, definitionPath) {
  const manifestLink = `[Manifest](../../${manifestPath})`;
  const definitionLink = `[Definition](../../${definitionPath})`;
  const runtimeTestLink = `[Runtime tests](../../server/routes/__tests__/registry-connectors.runtime-support.test.ts)`;
  return `${manifestLink} · ${definitionLink} · ${runtimeTestLink}`;
}

function renderTableRows(entries) {
  return entries
    .map(entry =>
      `| \`${entry.id}\` | ${entry.totalOperations} | ${entry.runtimeStatus} | ${entry.squadOwner} | ${entry.targetSprint} | ${entry.links} |`
    )
    .join('\n');
}

function renderTierSection(tier, entries) {
  const titleMap = {
    0: 'Tier 0 — Launch-critical connectors',
    1: 'Tier 1 — High-growth connectors',
    2: 'Tier 2 — Long-tail connectors'
  };
  if (entries.length === 0) {
    return `## ${titleMap[tier]}\n\n_No connectors in this tier yet._\n`;
  }
  return `## ${titleMap[tier]}\n\n| Connector | Total operations | Apps Script runtime | Squad owner | Target sprint | Links |\n|-----------|------------------|---------------------|-------------|---------------|-------|\n${renderTableRows(entries)}\n`;
}

async function main() {
  const tiers = await loadPrioritizationTiers();
  const manifestConnectors = await loadManifestConnectors();

  const tierBuckets = new Map([
    [0, []],
    [1, []],
    [2, []]
  ]);

  for (const connector of manifestConnectors) {
    const id = connector.id;
    if (!id) continue;
    const baseId = normalizeConnectorId(id);
    const tier = tiers.get(baseId) ?? 2;

    const definition = await loadDefinition(connector.definitionPath);
    const operations = collectOperations(definition);
    const runtime = computeRuntimeStatus(operations);

    const entry = {
      id,
      totalOperations: runtime.totalOps,
      runtimeStatus: runtime.label,
      squadOwner: 'Unassigned',
      targetSprint: 'TBD',
      links: formatLinks(connector.manifestPath, connector.definitionPath)
    };

    tierBuckets.get(tier)?.push(entry);
  }

  for (const [, entries] of tierBuckets) {
    entries.sort((a, b) => a.id.localeCompare(b.id));
  }

  const header = `# Apps Script Rollout Backlog\n\nThis backlog translates the [Apps Script prioritization report](../../production/reports/apps-script-prioritization.csv) into actionable rollout work. Each connector listed in \`server/connector-manifest.json\` inherits its tier from the prioritization CSV so Apps Script enablement stays aligned with the scoring model. Columns highlight total operation counts, runtime readiness, and planning placeholders for squad ownership and sprint targeting.\n\n`;

  const body = [
    renderTierSection(0, tierBuckets.get(0) ?? []),
    renderTierSection(1, tierBuckets.get(1) ?? []),
    renderTierSection(2, tierBuckets.get(2) ?? [])
  ].join('\n');

  const content = `${header}${body}`;
  await mkdir(dirname(BACKLOG_PATH), { recursive: true });
  await writeFile(BACKLOG_PATH, content.trim() + '\n', 'utf-8');
}

main().catch(error => {
  console.error('❌ Failed to update Apps Script backlog.');
  console.error(error);
  process.exitCode = 1;
});
