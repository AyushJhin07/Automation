import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

interface CliOptions {
  outputPath: string;
}

interface CsvRow {
  [key: string]: string;
}

interface ManifestConnectorEntry {
  id: string;
  normalizedId: string;
}

interface ManifestFile {
  connectors: ManifestConnectorEntry[];
}

interface ConnectorStats {
  connectorId: string;
  normalizedId: string;
  totalOperations: number;
  implementedOperations: number;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');

const COVERAGE_PATH = resolve(projectRoot, 'production', 'reports', 'apps-script-runtime-coverage.csv');
const MANIFEST_PATH = resolve(projectRoot, 'server', 'connector-manifest.json');
const DEFAULT_OUTPUT_PATH = resolve(projectRoot, 'docs', 'apps-script-rollout', 'apps-script-tracker.csv');

function parseArgs(argv: string[]): CliOptions {
  let outputPath = DEFAULT_OUTPUT_PATH;

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      continue;
    }

    const [rawKey, rawValue] = token.split('=');
    const key = rawKey.slice(2);
    let value = rawValue;

    if (value === undefined) {
      const maybeValue = argv[i + 1];
      if (maybeValue && !maybeValue.startsWith('--')) {
        value = maybeValue;
        i += 1;
      }
    }

    if (key === 'output' && value) {
      outputPath = resolve(process.cwd(), value);
    }
  }

  return { outputPath };
}

function sanitizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '\"') {
      const next = line[i + 1];
      if (inQuotes && next === '\"') {
        current += '\"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      cells.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  cells.push(current);

  return cells.map(cell => cell.trim());
}

function parseCsv(content: string): { rows: CsvRow[]; headers: string[] } {
  const trimmed = content.trim();
  if (!trimmed) {
    return { rows: [], headers: [] };
  }

  const lines = trimmed.split(/\r?\n/);
  const rawHeaders = parseCsvLine(lines[0]);
  const headers = rawHeaders.map(sanitizeHeader);

  const rows: CsvRow[] = [];

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

  return { rows, headers };
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

function parseBoolean(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();

  if (!normalized) {
    return false;
  }

  const truthyValues = new Set([
    'true',
    'yes',
    'y',
    '1',
    'ready',
    'done',
    'complete',
    'completed',
    'shipped',
    'enabled',
    'available',
    'implemented',
    'launched',
    'released',
    'ga',
    'beta'
  ]);

  if (truthyValues.has(normalized)) {
    return true;
  }

  const numeric = Number.parseFloat(normalized);
  if (!Number.isNaN(numeric)) {
    return numeric > 0;
  }

  return false;
}

function selectAppsScriptKey(headers: string[]): string | undefined {
  const candidates = headers.filter(header => header.includes('apps_script') || header.includes('appsscript'));
  if (candidates.length === 0) {
    return undefined;
  }

  const preferredOrder = ['apps_script_implemented', 'apps_script_complete', 'apps_script_status', 'apps_script'];

  for (const preferred of preferredOrder) {
    const match = candidates.find(candidate => candidate === preferred);
    if (match) {
      return match;
    }
  }

  return candidates[0];
}

async function loadCoverage(): Promise<{ stats: Map<string, ConnectorStats>; headers: string[] }> {
  const content = await readFile(COVERAGE_PATH, 'utf8');
  const { rows, headers } = parseCsv(content);

  const connectorKey = headers.find(header => ['connector', 'connector_id', 'connectorid', 'app', 'app_id', 'integration'].includes(header));
  if (!connectorKey) {
    throw new Error('Unable to determine connector column in coverage report.');
  }

  const appsScriptKey = selectAppsScriptKey(headers);
  if (!appsScriptKey) {
    console.warn('⚠️  Coverage report missing Apps Script status column; defaulting implemented counts to 0.');
  }

  const stats = new Map<string, ConnectorStats>();

  for (const row of rows) {
    const connectorId = row[connectorKey];
    if (!connectorId) {
      continue;
    }

    const normalizedId = normalizeConnectorId(connectorId);
    const current = stats.get(normalizedId) ?? {
      connectorId,
      normalizedId,
      totalOperations: 0,
      implementedOperations: 0
    };

    current.totalOperations += 1;

    if (appsScriptKey && parseBoolean(row[appsScriptKey])) {
      current.implementedOperations += 1;
    }

    stats.set(normalizedId, current);
  }

  return { stats, headers };
}

async function loadManifest(): Promise<ManifestFile> {
  const content = await readFile(MANIFEST_PATH, 'utf8');
  return JSON.parse(content) as ManifestFile;
}

function createOutputRow(stats: ConnectorStats, placeholders: { owner: string; squad: string; status: string; pr: string; test: string }): string[] {
  return [
    stats.connectorId,
    String(stats.totalOperations),
    String(stats.implementedOperations),
    placeholders.owner,
    placeholders.squad,
    placeholders.status,
    placeholders.pr,
    placeholders.test
  ];
}

async function generateTracker(options: CliOptions): Promise<void> {
  const manifest = await loadManifest();
  const { stats: coverageStats } = await loadCoverage();

  const placeholders = {
    owner: 'TBD',
    squad: 'TBD',
    status: 'TBD',
    pr: '',
    test: ''
  };

  const manifestRows: ConnectorStats[] = manifest.connectors.map(connector => {
    const normalizedId = normalizeConnectorId(connector.normalizedId ?? connector.id);
    const coverage = coverageStats.get(normalizedId);

    if (coverage) {
      return {
        connectorId: connector.id,
        normalizedId,
        totalOperations: coverage.totalOperations,
        implementedOperations: coverage.implementedOperations
      };
    }

    return {
      connectorId: connector.id,
      normalizedId,
      totalOperations: 0,
      implementedOperations: 0
    };
  });

  const manifestRowMap = new Map<string, ConnectorStats>();
  for (const row of manifestRows) {
    manifestRowMap.set(row.normalizedId, row);
  }

  const extraCoverage = Array.from(coverageStats.values()).filter(stat => !manifestRowMap.has(stat.normalizedId));
  if (extraCoverage.length > 0) {
    console.warn(`⚠️  ${extraCoverage.length} connector(s) present in coverage report but missing from connector manifest.`);
  }

  const rows: string[][] = manifestRows
    .sort((a, b) => a.connectorId.localeCompare(b.connectorId))
    .map(stat => createOutputRow(stat, placeholders));

  for (const stat of extraCoverage.sort((a, b) => a.connectorId.localeCompare(b.connectorId))) {
    rows.push(createOutputRow(stat, placeholders));
  }

  const header = ['connector', 'total ops', 'Apps Script implemented ops', 'owner', 'squad', 'status', 'PR link', 'test link'];
  const csvContent = [header.join(','), ...rows.map(row => row.join(','))].join('\n');

  await mkdir(dirname(options.outputPath), { recursive: true });
  await writeFile(options.outputPath, `${csvContent}\n`, 'utf8');

  console.log(`✅ Apps Script tracker initialized at ${options.outputPath}`);
}

(async () => {
  try {
    const options = parseArgs(process.argv.slice(2));
    await generateTracker(options);
  } catch (error) {
    console.error('❌ Failed to initialize Apps Script tracker.');
    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error(error);
    }
    process.exitCode = 1;
  }
})();
