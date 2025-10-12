import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { EncryptionService } from '../server/services/EncryptionService.js';

interface CliOptions {
  inputPath: string | null;
  bundlePath: string;
  ttlSeconds: number | null;
  purposePrefix: string | null;
}

interface ConnectorSecretInput {
  [property: string]: string | number | boolean | null;
}

interface ConnectorSecretFile {
  [connectorId: string]: ConnectorSecretInput;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');

const DEFAULT_TTL_SECONDS = 15 * 60; // 15 minutes
const DEFAULT_BUNDLE_PATH = resolve(projectRoot, 'production', 'deployment-bundles', 'apps-script-sealed-credentials.json');

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    inputPath: null,
    bundlePath: DEFAULT_BUNDLE_PATH,
    ttlSeconds: null,
    purposePrefix: 'connector',
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
      case 'input':
        options.inputPath = value ?? null;
        break;
      case 'bundle':
        options.bundlePath = value ? resolve(process.cwd(), value) : options.bundlePath;
        break;
      case 'ttl':
      case 'ttl-seconds':
        if (value) {
          const parsed = Number.parseInt(value, 10);
          if (!Number.isNaN(parsed) && parsed > 0) {
            options.ttlSeconds = parsed;
          }
        }
        break;
      case 'purpose-prefix':
        options.purposePrefix = value ?? null;
        break;
      default:
        break;
    }
  }

  return options;
}

function normalizeTtlSeconds(ttlSeconds: number | null): number {
  if (!ttlSeconds || !Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
    return DEFAULT_TTL_SECONDS;
  }
  return Math.max(60, Math.floor(ttlSeconds));
}

async function loadConnectorSecrets(path: string): Promise<ConnectorSecretFile> {
  const raw = await readFile(path, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Connector credential input must be a JSON object mapping connector ids to property maps.');
  }
  return parsed as ConnectorSecretFile;
}

async function ensureDirectoryExists(path: string): Promise<void> {
  const targetDir = dirname(path);
  await mkdir(targetDir, { recursive: true });
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (!options.inputPath) {
    console.error('❌  Missing required --input <path> argument.');
    console.error('    Provide a JSON file mapping connector ids to Script Property payloads.');
    process.exitCode = 1;
    return;
  }

  const absoluteInputPath = resolve(process.cwd(), options.inputPath);
  const ttlSeconds = normalizeTtlSeconds(options.ttlSeconds);

  const input = await loadConnectorSecrets(absoluteInputPath);
  const connectorIds = Object.keys(input);

  if (connectorIds.length === 0) {
    console.warn('⚠️  Input file contains no connector entries; nothing to seal.');
    return;
  }

  await EncryptionService.init();

  const sealed: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    ttlSeconds,
    connectorCount: connectorIds.length,
    connectors: {},
  };

  for (const connectorId of connectorIds) {
    const payload = input[connectorId] ?? {};
    const normalizedConnectorId = connectorId.trim();
    const purpose = options.purposePrefix ? `${options.purposePrefix}:${normalizedConnectorId}` : normalizedConnectorId;

    const { token, metadata } = await EncryptionService.createAppsScriptSecretToken(
      {
        connector: normalizedConnectorId,
        secrets: payload,
      },
      {
        ttlSeconds,
        purpose,
        payloadHint: 'connector-secrets',
      }
    );

    const connectorEntry = {
      token,
      issuedAt: new Date(metadata.issuedAt).toISOString(),
      expiresAt: new Date(metadata.expiresAt).toISOString(),
      keyId: metadata.keyId,
      dataKeyCiphertext: metadata.dataKeyCiphertext,
      secretCount: Object.keys(payload ?? {}).length,
      propertyPrefix: `apps_script__${normalizedConnectorId}`,
      purpose,
    };

    (sealed.connectors as Record<string, unknown>)[normalizedConnectorId] = connectorEntry;
  }

  await ensureDirectoryExists(options.bundlePath);
  await writeFile(options.bundlePath, JSON.stringify(sealed, null, 2), 'utf8');

  console.log('✅  Generated sealed Apps Script credential bundle:');
  console.log(`    Input:  ${absoluteInputPath}`);
  console.log(`    Output: ${options.bundlePath}`);
  console.log(`    TTL:    ${ttlSeconds} seconds (${Math.round(ttlSeconds / 60)} minutes)`);
  console.log(`    Connectors sealed: ${connectorIds.length}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`❌  Failed to seal Apps Script credential bundle: ${message}`);
  process.exitCode = 1;
});

