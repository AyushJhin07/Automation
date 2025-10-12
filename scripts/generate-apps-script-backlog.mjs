import { readFile, writeFile, mkdir, access, readdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_OWNER = 'Apps Script Enablement';
const DEFAULT_SPRINT = 'Backlog';

const DEFAULT_OVERRIDES = new Map([
  ['gmail', { tier: '0', planned_squad_owner: 'Workspace Platform', target_sprint: '2025.05' }],
  ['google-sheets-enhanced', { tier: '0', planned_squad_owner: 'Workspace Platform', target_sprint: '2025.05' }],
  ['google-drive', { tier: '0', planned_squad_owner: 'Workspace Platform', target_sprint: '2025.06' }],
  ['google-calendar', { tier: '0', planned_squad_owner: 'Workspace Platform', target_sprint: '2025.06' }],
  ['google-docs', { tier: '0', planned_squad_owner: 'Workspace Platform', target_sprint: '2025.06' }],
  ['google-forms', { tier: '0', planned_squad_owner: 'Workspace Platform', target_sprint: '2025.07' }],
  ['slack', { tier: '0', planned_squad_owner: 'Collaboration Core', target_sprint: '2025.05' }],
  ['salesforce-enhanced', { tier: '0', planned_squad_owner: 'Revenue Automation', target_sprint: '2025.07' }],
  ['hubspot', { tier: '1', planned_squad_owner: 'Revenue Automation', target_sprint: '2025.08' }],
  ['microsoft-teams', { tier: '1', planned_squad_owner: 'Collaboration Core', target_sprint: '2025.08' }],
  ['outlook', { tier: '1', planned_squad_owner: 'Collaboration Core', target_sprint: '2025.08' }],
  ['onedrive', { tier: '1', planned_squad_owner: 'Collaboration Core', target_sprint: '2025.09' }],
  ['zendesk', { tier: '1', planned_squad_owner: 'Support Ops', target_sprint: '2025.09' }],
  ['trello', { tier: '1', planned_squad_owner: 'Productivity Enablement', target_sprint: '2025.09' }],
  ['notion', { tier: '1', planned_squad_owner: 'Knowledge Workflows', target_sprint: '2025.10' }],
  ['stripe', { tier: '1', planned_squad_owner: 'Finance Automations', target_sprint: '2025.10' }],
  ['stripe-enhanced', { tier: '1', planned_squad_owner: 'Finance Automations', target_sprint: '2025.10' }],
  ['shopify', { tier: '1', planned_squad_owner: 'Commerce Integrations', target_sprint: '2025.10' }],
  ['quickbooks', { tier: '1', planned_squad_owner: 'Finance Automations', target_sprint: '2025.09' }],
]);

const testRoots = [
  'server/routes/__tests__',
  'server/workflow/__tests__',
  'server/services/__tests__',
  'server/runtime/__tests__',
  'server/integrations/__tests__',
  'server/webhooks/__tests__',
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.resolve(ROOT_DIR, 'server/connector-manifest.json');
const BACKLOG_DIR = path.resolve(ROOT_DIR, 'docs/apps-script-rollout');
const BACKLOG_MD_PATH = path.resolve(BACKLOG_DIR, 'backlog.md');
const BACKLOG_JSON_PATH = path.resolve(BACKLOG_DIR, 'backlog.generated.json');
const PRIORITIZATION_CSV_PATH = path.resolve(BACKLOG_DIR, 'prioritization.csv');

async function fileExists(targetPath) {
  try {
    await access(targetPath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function parseCsv(input) {
  const sanitized = input.replace(/\r/g, '');
  const lines = sanitized
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) {
    return [];
  }
  const header = lines[0].split(',');
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const rawLine = lines[i];
    if (!rawLine || rawLine.startsWith('#')) {
      continue;
    }
    const parts = rawLine.split(',');
    if (parts.length < header.length) {
      continue;
    }
    rows.push({
      connector_id: parts[0].trim(),
      tier: (parts[1]?.trim() ?? '2'),
      planned_squad_owner: parts[2]?.trim() ?? DEFAULT_OWNER,
      target_sprint: parts[3]?.trim() ?? DEFAULT_SPRINT,
    });
  }
  return rows;
}

function serializeCsv(rows) {
  const header = 'connector_id,tier,planned_squad_owner,target_sprint';
  const body = rows
    .map((row) => [row.connector_id, row.tier, row.planned_squad_owner, row.target_sprint].join(','))
    .join('\n');
  return `${header}\n${body}\n`;
}

async function loadManifest() {
  const raw = await readFile(MANIFEST_PATH, 'utf-8');
  return JSON.parse(raw);
}

async function readDefinition(definitionPath) {
  try {
    const absolute = path.resolve(ROOT_DIR, definitionPath);
    const raw = await readFile(absolute, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function evaluateAppsScriptStatus(definition) {
  if (!definition) {
    return { totalOperations: 0, appsScriptOperations: 0, statusLabel: 'Definition missing' };
  }
  const actions = Array.isArray(definition.actions) ? definition.actions : [];
  const triggers = Array.isArray(definition.triggers) ? definition.triggers : [];
  const operations = [...actions, ...triggers];
  if (operations.length === 0) {
    return { totalOperations: 0, appsScriptOperations: 0, statusLabel: 'No operations declared' };
  }
  let appsScriptCount = 0;
  for (const operation of operations) {
    const runtimes = operation?.runtimes;
    if (Array.isArray(runtimes) && runtimes.includes('apps_script')) {
      appsScriptCount += 1;
    }
  }
  let statusLabel = 'Not declared';
  if (appsScriptCount === operations.length) {
    statusLabel = 'Full coverage';
  } else if (appsScriptCount > 0) {
    statusLabel = `Partial (${appsScriptCount}/${operations.length})`;
  }
  return { totalOperations: operations.length, appsScriptOperations: appsScriptCount, statusLabel };
}

async function ensurePrioritization(connectors, mode) {
  let existingRows = [];
  const csvExists = await fileExists(PRIORITIZATION_CSV_PATH);
  if (csvExists) {
    const raw = await readFile(PRIORITIZATION_CSV_PATH, 'utf-8');
    existingRows = parseCsv(raw);
  }
  const existingMap = new Map(existingRows.map((row) => [row.connector_id, row]));
  const missing = [];
  const nextRows = [];
  let changed = false;
  const sortedConnectors = [...connectors].sort((a, b) => a.id.localeCompare(b.id));
  for (const connector of sortedConnectors) {
    const current = existingMap.get(connector.id);
    if (!current) {
      if (mode === 'check') {
        missing.push(connector.id);
        continue;
      }
      const override = DEFAULT_OVERRIDES.get(connector.id) ?? {};
      nextRows.push({
        connector_id: connector.id,
        tier: override.tier ?? '2',
        planned_squad_owner: override.planned_squad_owner ?? DEFAULT_OWNER,
        target_sprint: override.target_sprint ?? DEFAULT_SPRINT,
      });
      changed = true;
    } else {
      const normalizedTier = ['0', '1', '2'].includes(current.tier) ? current.tier : '2';
      nextRows.push({
        connector_id: connector.id,
        tier: normalizedTier,
        planned_squad_owner: current.planned_squad_owner || DEFAULT_OWNER,
        target_sprint: current.target_sprint || DEFAULT_SPRINT,
      });
    }
  }
  if (mode === 'check') {
    if (missing.length > 0) {
      throw new Error(`Prioritization CSV is missing ${missing.length} connectors: ${missing.join(', ')}`);
    }
    const extras = [...existingMap.keys()].filter(
      (id) => !sortedConnectors.find((connector) => connector.id === id)
    );
    if (extras.length > 0) {
      throw new Error(`Prioritization CSV includes unknown connectors: ${extras.join(', ')}`);
    }
    return { map: new Map(nextRows.map((row) => [row.connector_id, row])), changed: false };
  }
  const extras = [...existingMap.keys()].filter(
    (id) => !sortedConnectors.find((connector) => connector.id === id)
  );
  if (extras.length > 0) {
    changed = true;
  }
  if (changed || !csvExists) {
    const csvContent = serializeCsv(nextRows);
    await mkdir(path.dirname(PRIORITIZATION_CSV_PATH), { recursive: true });
    await writeFile(PRIORITIZATION_CSV_PATH, csvContent, 'utf-8');
  }
  return { map: new Map(nextRows.map((row) => [row.connector_id, row])), changed };
}

async function collectTestFiles() {
  const files = [];
  for (const root of testRoots) {
    const absoluteRoot = path.resolve(ROOT_DIR, root);
    if (!(await fileExists(absoluteRoot))) {
      continue;
    }
    const stack = [absoluteRoot];
    while (stack.length > 0) {
      const currentDir = stack.pop();
      if (!currentDir) continue;
      const entries = await readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const entryPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          stack.push(entryPath);
        } else if (entry.isFile()) {
          if (entry.name.endsWith('.test.ts') || entry.name.endsWith('.test.tsx')) {
            files.push(path.relative(ROOT_DIR, entryPath));
          }
        }
      }
    }
  }
  return files;
}

function findTestPath(connectorId, testFiles) {
  const lowerId = connectorId.toLowerCase();
  const variants = new Set([
    lowerId,
    lowerId.replace(/-/g, '_'),
    lowerId.replace(/-/g, ''),
    lowerId.replace(/[-_]/g, ''),
  ]);
  for (const file of testFiles) {
    const lowerFile = file.toLowerCase();
    for (const variant of variants) {
      if (variant.length > 0 && lowerFile.includes(variant)) {
        return file;
      }
    }
  }
  return null;
}

function relativeFromBacklog(targetPath) {
  const absoluteTarget = path.resolve(ROOT_DIR, targetPath);
  const relativePath = path.relative(path.dirname(BACKLOG_MD_PATH), absoluteTarget);
  return relativePath.replace(/\\/g, '/');
}

function renderMarkdown(entries, metadata) {
  const tierGroups = { '0': [], '1': [], '2': [] };
  for (const entry of entries) {
    tierGroups[String(entry.tier)].push(entry);
  }
  for (const key of Object.keys(tierGroups)) {
    tierGroups[key].sort((a, b) => a.name.localeCompare(b.name));
  }
  const lines = [];
  lines.push('# Apps Script Rollout Backlog');
  lines.push('');
  lines.push(
    'This backlog is generated from `server/connector-manifest.json` and `docs/apps-script-rollout/prioritization.csv`. '
      + 'Run `node scripts/generate-apps-script-backlog.mjs --write` after updating either source.'
  );
  lines.push('');
  lines.push('<!-- BEGIN BACKLOG:JSON -->');
  lines.push('```json');
  lines.push(JSON.stringify(metadata, null, 2));
  lines.push('```');
  lines.push('<!-- END BACKLOG:JSON -->');
  lines.push('');
  const tierDescriptions = {
    '0': 'Tier 0 — launch blockers that must stay Apps Script-ready as the platform evolves.',
    '1': 'Tier 1 — high-usage connectors scheduled in the near-term enablement waves.',
    '2': 'Tier 2 — remaining catalog connectors tracked for long-tail enablement.',
  };
  for (const tierKey of ['0', '1', '2']) {
    lines.push(`## ${tierDescriptions[tierKey]}`);
    lines.push('');
    lines.push('| Connector | Total Ops | Apps Script status | Squad | Target Sprint | Manifest | Tests |');
    lines.push('| --- | --- | --- | --- | --- | --- | --- |');
    if (tierGroups[tierKey].length === 0) {
      lines.push('| _(none)_ |  |  |  |  |  |  |');
    } else {
      for (const entry of tierGroups[tierKey]) {
        const manifestLink = `[manifest](${relativeFromBacklog(entry.manifestPath)})`;
        const testLink = entry.testPath ? `[tests](${relativeFromBacklog(entry.testPath)})` : '—';
        lines.push(
          `| ${entry.name} (${entry.id}) | ${entry.totalOperations} | ${entry.appsScriptStatus} | ${entry.plannedSquadOwner} | ${entry.targetSprint} | ${manifestLink} | ${testLink} |`
        );
      }
    }
    lines.push('');
  }
  return lines.join('\n');
}

async function buildBacklog(mode) {
  const manifest = await loadManifest();
  const connectors = manifest.connectors;
  const { map: prioritizationMap } = await ensurePrioritization(connectors, mode);
  const testFiles = await collectTestFiles();
  const entries = [];
  for (const connector of connectors) {
    const definition = await readDefinition(connector.definitionPath);
    const status = evaluateAppsScriptStatus(definition);
    const prioritization = prioritizationMap.get(connector.id);
    if (!prioritization) {
      throw new Error(`Missing prioritization entry for ${connector.id}`);
    }
    const name = definition?.name ?? connector.id;
    const testPath = findTestPath(connector.id, testFiles);
    entries.push({
      id: connector.id,
      name,
      tier: Number(prioritization.tier),
      plannedSquadOwner: prioritization.planned_squad_owner,
      targetSprint: prioritization.target_sprint,
      manifestPath: connector.manifestPath,
      definitionPath: connector.definitionPath,
      testPath,
      totalOperations: status.totalOperations,
      appsScriptOperations: status.appsScriptOperations,
      appsScriptStatus: status.statusLabel,
    });
  }
  entries.sort((a, b) => {
    if (a.tier !== b.tier) {
      return a.tier - b.tier;
    }
    return a.name.localeCompare(b.name);
  });
  const manifestGeneratedAt = manifest.generatedAt ?? new Date().toISOString();
  const metadata = {
    generatedAt: manifestGeneratedAt,
    connectors: entries,
  };
  const markdown = renderMarkdown(entries, metadata);
  return { metadata, markdown, entries };
}

async function main() {
  const mode = process.argv.includes('--write') ? 'write' : process.argv.includes('--check') ? 'check' : 'write';
  const { metadata, markdown } = await buildBacklog(mode);
  if (mode === 'write') {
    await mkdir(BACKLOG_DIR, { recursive: true });
    await writeFile(BACKLOG_MD_PATH, `${markdown}\n`, 'utf-8');
    await writeFile(BACKLOG_JSON_PATH, `${JSON.stringify(metadata, null, 2)}\n`, 'utf-8');
    console.log('Backlog regenerated.');
    return;
  }
  const existingMarkdown = (await fileExists(BACKLOG_MD_PATH)) ? await readFile(BACKLOG_MD_PATH, 'utf-8') : '';
  const existingJson = (await fileExists(BACKLOG_JSON_PATH)) ? await readFile(BACKLOG_JSON_PATH, 'utf-8') : '';
  let ok = true;
  if (existingMarkdown.trim() !== markdown.trim()) {
    console.error('Backlog markdown is out of date. Run with --write to refresh.');
    ok = false;
  }
  if (existingJson.trim() !== JSON.stringify(metadata, null, 2).trim()) {
    console.error('Backlog metadata JSON is out of date. Run with --write to refresh.');
    ok = false;
  }
  if (!ok) {
    process.exit(1);
  }
  console.log('Backlog is up to date.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
