import { promises as fs } from 'fs';
import { join, relative, resolve } from 'path';
import type { ConnectorDynamicOptionConfig } from '../common/connectorDynamicOptions.js';
import { extractDynamicOptionsFromConnector } from '../common/connectorDynamicOptions.js';

interface ConnectorManifestEntry {
  id: string;
  normalizedId: string;
  definitionPath: string;
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
  const files = await fs.readdir(connectorsDir);

  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const fullPath = join(connectorsDir, file);
    const contents = await fs.readFile(fullPath, 'utf8');
    let parsed: any;
    try {
      parsed = JSON.parse(contents);
    } catch (error) {
      throw new Error(`Failed to parse ${file}: ${(error as Error).message}`);
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new Error(`Connector definition ${file} must be an object`);
    }

    const rawId = parsed.id;
    if (typeof rawId !== 'string' || rawId.trim() === '') {
      throw new Error(`Connector definition ${file} is missing a valid "id" field`);
    }

    const normalizedId = normalizeId(rawId);
    if (rawId !== normalizedId) {
      console.warn(`Normalizing connector id from "${rawId}" to "${normalizedId}" for ${file}`);
    }

    const dynamicOptions = extractDynamicOptionsFromConnector(parsed);

    entries.push({
      id: parsed.id,
      normalizedId,
      definitionPath: relative(process.cwd(), fullPath).replace(/\\/g, '/'),
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

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
