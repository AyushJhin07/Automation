import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';

const ENV_FILENAME = '.env.development';
const SECRET_BYTE_LENGTH = 32; // matches EncryptionService.KEY_LENGTH in bytes
const MIN_SECRET_LENGTH = 32; // characters, enforced by EncryptionService

interface SecretDescriptor {
  key: string;
  description: string;
}

const SECRET_KEYS: SecretDescriptor[] = [
  { key: 'ENCRYPTION_MASTER_KEY', description: 'AES-256 encryption master key' },
  { key: 'JWT_SECRET', description: 'JWT signing secret' },
];

function isErrno(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

function generateSecret(): string {
  return randomBytes(SECRET_BYTE_LENGTH).toString('base64');
}

function meetsMinimumLength(value: string): boolean {
  return value.trim().length >= MIN_SECRET_LENGTH;
}

async function loadEnvFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (isErrno(error) && error.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

function applyUpdate(
  contents: string,
  key: string,
  value: string
): { contents: string; action: 'created' | 'updated' | 'skipped'; previous?: string } {
  const pattern = new RegExp(`^${key}=(.*)$`, 'm');
  const match = contents.match(pattern);

  if (!match) {
    const needsNewline = !contents.endsWith('\n');
    const nextContents = `${contents}${needsNewline ? '\n' : ''}${key}=${value}\n`;
    return { contents: nextContents, action: 'created' };
  }

  const current = match[1] ?? '';
  if (!meetsMinimumLength(current)) {
    const nextContents = contents.replace(pattern, `${key}=${value}`);
    return { contents: nextContents, action: 'updated', previous: current };
  }

  return { contents, action: 'skipped', previous: current };
}

async function main(): Promise<void> {
  const envPath = resolve(process.cwd(), ENV_FILENAME);
  const envContents = await loadEnvFile(envPath);

  const generated = new Map<string, string>();
  for (const descriptor of SECRET_KEYS) {
    generated.set(descriptor.key, generateSecret());
  }

  if (envContents === null) {
    console.log(`⚠️  ${ENV_FILENAME} not found at ${envPath}.`);
    console.log('Create it by copying the example file:');
    console.log('  cp .env.example .env.development');
    console.log('Then add the following secrets (or re-run this script after creating the file):');
    for (const descriptor of SECRET_KEYS) {
      const secret = generated.get(descriptor.key)!;
      console.log(`  ${descriptor.key}=${secret}  # ${descriptor.description}`);
    }
    return;
  }

  let nextContents = envContents;
  const updatedKeys: Array<{ key: string; value: string; action: 'created' | 'updated' | 'skipped' }> = [];

  for (const descriptor of SECRET_KEYS) {
    const secret = generated.get(descriptor.key)!;
    const { contents, action } = applyUpdate(nextContents, descriptor.key, secret);
    nextContents = contents;
    if (action !== 'skipped') {
      process.env[descriptor.key] = secret;
    }
    updatedKeys.push({ key: descriptor.key, value: secret, action });
  }

  const mutated = updatedKeys.some(({ action }) => action !== 'skipped');

  if (mutated) {
    await writeFile(envPath, nextContents, 'utf8');
    console.log(`✅ Updated ${ENV_FILENAME} with fresh secrets:`);
    for (const { key, value, action } of updatedKeys) {
      if (action === 'skipped') {
        continue;
      }
      const label = action === 'created' ? 'added' : 'rotated';
      const descriptor = SECRET_KEYS.find((item) => item.key === key);
      const note = descriptor ? ` – ${descriptor.description}` : '';
      console.log(`  • ${key} (${label}) -> ${value}${note}`);
    }
  } else {
    console.log(`✅ Existing secrets in ${ENV_FILENAME} already meet the minimum length (${MIN_SECRET_LENGTH} characters).`);
  }

  const skipped = updatedKeys.filter(({ action }) => action === 'skipped');
  if (skipped.length > 0) {
    console.log('ℹ️  The following keys already satisfied the requirements and were left unchanged:');
    for (const { key } of skipped) {
      console.log(`  • ${key}`);
    }
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`❌ Failed to bootstrap development secrets: ${message}`);
  process.exitCode = 1;
});
