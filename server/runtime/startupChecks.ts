import fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { env } from '../env';
import { EncryptionService } from '../services/EncryptionService';
import { getErrorMessage } from '../types/common';
import { connectorDefinitions, db } from '../database/schema';
import { count } from 'drizzle-orm';

async function ensureEncryptionReady(): Promise<void> {
  await EncryptionService.init();
  const healthy = await EncryptionService.selfTest();
  if (!healthy) {
    throw new Error('Encryption self-test failed. Check ENCRYPTION_MASTER_KEY configuration.');
  }
}

async function ensureConnectorCatalog(): Promise<void> {
  const connectorDir = path.resolve(process.cwd(), 'connectors');
  let entries: Dirent[];
  try {
    entries = await fs.readdir(connectorDir, { withFileTypes: true });
  } catch (error) {
    throw new Error(`Failed to read connectors directory (${connectorDir}): ${getErrorMessage(error)}`);
  }

  const connectorDirs = entries.filter((entry) => entry.isDirectory());
  if (connectorDirs.length === 0) {
    throw new Error(`No connector definitions found in ${connectorDir}`);
  }

  let parsed = 0;
  for (const dir of connectorDirs) {
    const definitionPath = path.join(connectorDir, dir.name, 'definition.json');
    try {
      const raw = await fs.readFile(definitionPath, 'utf8');
      JSON.parse(raw);
      parsed++;
    } catch (error) {
      throw new Error(`Invalid connector definition ${dir.name}: ${getErrorMessage(error)}`);
    }
  }

  console.log(`✅ Startup check: parsed ${parsed} connector definitions from ${connectorDir}`);

  if (db) {
    try {
      const [{ value: storedCount }] = await db.select({ value: count() }).from(connectorDefinitions);
      if (storedCount === 0) {
        console.warn('⚠️ Connector catalog database table is empty. Run scripts/seed-all-connectors.ts to sync definitions.');
      } else if (storedCount !== parsed) {
        console.warn(
          `⚠️ Connector catalog mismatch: ${storedCount} stored vs ${parsed} files. Ensure seed script ran successfully.`
        );
      }
    } catch (error) {
      throw new Error(`Failed to validate connector catalog in database: ${getErrorMessage(error)}`);
    }
  }
}

function ensureServerUrl(): void {
  if (env.NODE_ENV === 'production' && !env.SERVER_PUBLIC_URL) {
    throw new Error('SERVER_PUBLIC_URL must be set in production to guarantee OAuth callback URLs.');
  }
}

export async function runStartupChecks(): Promise<void> {
  await ensureEncryptionReady();
  await ensureConnectorCatalog();
  ensureServerUrl();
}
