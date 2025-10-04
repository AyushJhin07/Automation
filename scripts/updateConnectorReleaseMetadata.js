import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const CONNECTORS_DIR = path.resolve(process.cwd(), 'connectors');

const DEFAULT_SEMVER = '1.0.0';
const DEFAULT_STATUS = 'stable';

const normalizeStatus = (availability, requested, isBeta) => {
  if (requested) return requested;
  if (typeof isBeta === 'boolean') {
    return isBeta ? 'beta' : DEFAULT_STATUS;
  }
  if (!availability) return DEFAULT_STATUS;
  if (availability === 'experimental') return 'beta';
  if (availability === 'disabled') return 'deprecated';
  return DEFAULT_STATUS;
};

const updateDefinitionFile = async (filePath) => {
  const raw = await readFile(filePath, 'utf8');
  const definition = JSON.parse(raw);

  const version = typeof definition.version === 'string' && definition.version.trim()
    ? definition.version.trim()
    : DEFAULT_SEMVER;

  const release = definition.release ?? {};
  const semver = typeof release.semver === 'string' && release.semver.trim()
    ? release.semver.trim()
    : version;

  const status = normalizeStatus(definition.availability, release.status, release.isBeta);
  const isBeta = typeof release.isBeta === 'boolean' ? release.isBeta : status === 'beta';

  const window = release.deprecationWindow ?? {};
  const startDate = window.startDate ?? null;
  const sunsetDate = window.sunsetDate ?? null;

  const nextDefinition = {
    ...definition,
    version,
    release: {
      semver,
      status,
      isBeta,
      betaStartedAt: release.betaStartedAt ?? null,
      deprecationWindow: {
        startDate,
        sunsetDate,
      },
    },
  };

  const nextRaw = JSON.stringify(nextDefinition, null, 2) + '\n';
  if (nextRaw === raw) {
    return false;
  }
  await writeFile(filePath, nextRaw, 'utf8');
  return true;
};

const main = async () => {
  const entries = await readdir(CONNECTORS_DIR, { withFileTypes: true });
  let updated = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const filePath = path.join(CONNECTORS_DIR, entry.name, 'definition.json');
    try {
      const changed = await updateDefinitionFile(filePath);
      if (changed) updated += 1;
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      console.warn(`[updateConnectorReleaseMetadata] Failed to update ${filePath}:`, error);
    }
  }
  console.log(`[updateConnectorReleaseMetadata] Updated ${updated} connector definition(s).`);
};

main().catch((error) => {
  console.error('[updateConnectorReleaseMetadata] Fatal error', error);
  process.exitCode = 1;
});
