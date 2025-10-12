import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

interface ManifestConnectorEntry {
  id: string;
  normalizedId: string;
}

interface ManifestFile {
  connectors: ManifestConnectorEntry[];
}

interface CsvRow {
  [key: string]: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');

const MANIFEST_PATH = resolve(projectRoot, 'server', 'connector-manifest.json');
const TRACKER_PATH = resolve(projectRoot, 'docs', 'apps-script-rollout', 'apps-script-tracker.csv');

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

function parseCsv(content: string): { headers: string[]; rows: CsvRow[] } {
  const trimmed = content.trim();
  if (!trimmed) {
    return { headers: [], rows: [] };
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

  return { headers, rows };
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

async function loadManifest(): Promise<ManifestFile> {
  const content = await readFile(MANIFEST_PATH, 'utf8');
  return JSON.parse(content) as ManifestFile;
}

async function loadTracker(): Promise<{ headers: string[]; rows: CsvRow[] }> {
  const content = await readFile(TRACKER_PATH, 'utf8');
  return parseCsv(content);
}

async function main(): Promise<void> {
  try {
    const manifest = await loadManifest();
    const { headers, rows } = await loadTracker();

    const connectorHeader = headers.find(header => header === 'connector');
    if (!connectorHeader) {
      throw new Error('Unable to identify connector column in Apps Script tracker export.');
    }

    const trackerConnectors = new Map<string, string>();
    for (const row of rows) {
      const connectorId = row[connectorHeader];
      if (!connectorId) {
        continue;
      }
      const normalized = normalizeConnectorId(connectorId);
      trackerConnectors.set(normalized, connectorId);
    }

    const missing: string[] = [];
    for (const connector of manifest.connectors) {
      const normalizedId = normalizeConnectorId(connector.normalizedId ?? connector.id);
      if (!trackerConnectors.has(normalizedId)) {
        missing.push(connector.id);
      }
    }

    const extra: string[] = [];
    for (const [normalized, label] of trackerConnectors.entries()) {
      const exists = manifest.connectors.some(manifestConnector => normalizeConnectorId(manifestConnector.normalizedId ?? manifestConnector.id) === normalized);
      if (!exists) {
        extra.push(label);
      }
    }

    if (missing.length > 0) {
      console.error('❌ Apps Script tracker is missing manifest connectors:');
      missing.sort().forEach(connectorId => {
        console.error(`   • ${connectorId}`);
      });
      console.error('Please re-run scripts/init-apps-script-tracker.ts or add the connectors manually before merging.');
      process.exitCode = 1;
    }

    if (extra.length > 0) {
      console.warn('⚠️  Tracker includes connectors that are not present in the manifest:');
      extra.sort().forEach(connector => {
        console.warn(`   • ${connector}`);
      });
      console.warn('Verify whether these connectors should be removed from the tracker export.');
    }

    if (missing.length === 0) {
      console.log('✅ Apps Script tracker covers all manifest connectors.');
    }
  } catch (error) {
    console.error('❌ Failed to validate Apps Script tracker export.');
    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error(error);
    }
    process.exitCode = 1;
  }
}

await main();
