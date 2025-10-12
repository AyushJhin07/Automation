import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');

const MANIFEST_PATH = resolve(projectRoot, 'server', 'connector-manifest.json');
const BACKLOG_PATH = resolve(projectRoot, 'docs', 'apps-script-rollout', 'backlog.md');

function parseBacklogConnectors(markdown) {
  const connectors = [];
  const lines = markdown.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) {
      continue;
    }
    if (/^\|\s*-+\s*\|/u.test(trimmed)) {
      continue;
    }
    const cells = trimmed.split('|').map(cell => cell.trim());
    if (cells.length < 3) {
      continue;
    }
    const connectorCell = cells[1];
    if (!connectorCell || connectorCell.toLowerCase() === 'connector') {
      continue;
    }
    const connectorId = connectorCell.replace(/`/g, '').replace(/\*\*/g, '').split(/\s+/)[0];
    if (connectorId) {
      connectors.push(connectorId);
    }
  }
  return connectors;
}

async function main() {
  const [manifestRaw, backlogRaw] = await Promise.all([
    readFile(MANIFEST_PATH, 'utf-8'),
    readFile(BACKLOG_PATH, 'utf-8')
  ]);

  const manifest = JSON.parse(manifestRaw);
  const manifestIds = (manifest.connectors ?? []).map(connector => connector.id).filter(Boolean).sort();
  const backlogIds = parseBacklogConnectors(backlogRaw).sort();

  const manifestJson = JSON.stringify(manifestIds);
  const backlogJson = JSON.stringify(backlogIds);

  if (manifestJson !== backlogJson) {
    console.error('❌ Apps Script backlog is out of sync with server/connector-manifest.json.');
    console.error('Manifest IDs:', manifestJson);
    console.error('Backlog IDs:', backlogJson);
    process.exitCode = 1;
    return;
  }

  console.log('✅ Apps Script backlog matches connector manifest entries.');
}

main().catch(error => {
  console.error('❌ Failed to validate Apps Script backlog.');
  console.error(error);
  process.exitCode = 1;
});
