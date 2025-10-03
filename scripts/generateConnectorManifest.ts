import { promises as fs } from 'fs';
import { join, relative, resolve } from 'path';
import type { ConnectorDynamicOptionConfig } from '../common/connectorDynamicOptions.js';
import { extractDynamicOptionsFromConnector } from '../common/connectorDynamicOptions.js';

interface ConnectorManifestEntry {
  id: string;
  normalizedId: string;
  definitionPath: string;
  manifestPath?: string;
  dynamicOptions?: ConnectorDynamicOptionConfig[];
}

interface ConnectorManifest {
  generatedAt: string;
  connectors: ConnectorManifestEntry[];
}

function normalizeId(rawId: string): string {
  return rawId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function main(): Promise<void> {
  const connectorsDir = resolve(process.cwd(), 'connectors');
  const manifestPath = resolve(process.cwd(), 'server', 'connector-manifest.json');

  const entries: ConnectorManifestEntry[] = [];
  const entriesInDir = await fs.readdir(connectorsDir, { withFileTypes: true });

  for (const entry of entriesInDir) {
    if (!entry.isDirectory()) {
      continue;
    }

    const connectorDir = join(connectorsDir, entry.name);
    const definitionPath = join(connectorDir, 'definition.json');

    let contents: string;
    try {
      contents = await fs.readFile(definitionPath, 'utf8');
    } catch (error) {
      console.warn(`Skipping ${entry.name}; missing definition.json (${(error as Error).message})`);
      continue;
    }
    let parsed: any;
    try {
      parsed = JSON.parse(contents);
    } catch (error) {
      throw new Error(`Failed to parse ${file}: ${(error as Error).message}`);
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new Error(`Connector definition ${file} must be an object`);
    }

    const rawId = parsed.id ?? entry.name;
    if (typeof rawId !== 'string' || rawId.trim() === '') {
      throw new Error(`Connector definition ${file} is missing a valid "id" field`);
    }

    const normalizedId = normalizeId(rawId);
    if (rawId !== normalizedId) {
      console.warn(`Normalizing connector id from "${rawId}" to "${normalizedId}" for ${file}`);
    }

    const dynamicOptions = extractDynamicOptionsFromConnector(parsed);

    const manifestPath = join(connectorDir, 'manifest.json');
    const relativeDefinitionPath = relative(process.cwd(), definitionPath).replace(/\\/g, '/');
    const relativeManifestPath = (await fileExists(manifestPath))
      ? relative(process.cwd(), manifestPath).replace(/\\/g, '/')
      : undefined;

    entries.push({
      id: parsed.id ?? normalizedId,
      normalizedId,
      definitionPath: relativeDefinitionPath,
      manifestPath: relativeManifestPath,
      dynamicOptions: dynamicOptions.length > 0 ? dynamicOptions : undefined,
    });
  }

  entries.sort((a, b) => a.normalizedId.localeCompare(b.normalizedId));

  const manifest: ConnectorManifest = {
    generatedAt: new Date().toISOString(),
    connectors: entries,
  };

  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log(`Connector manifest written to ${manifestPath}`);
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
