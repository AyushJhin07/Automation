import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

const ENV_FILE = resolve(process.cwd(), '.env.development');

const secrets = [
  { key: 'ENCRYPTION_MASTER_KEY', bytes: 32, description: 'AES-256 master encryption key' },
  { key: 'JWT_SECRET', bytes: 48, description: 'JWT signing secret' },
] as const;

type SecretDefinition = (typeof secrets)[number];

type SecretRecord = Record<string, string>;

function generateSecret(bytes: number): string {
  return randomBytes(bytes).toString('base64url');
}

function extractValue(content: string, key: string): string | undefined {
  const pattern = new RegExp(`^${key}=(.*)$`, 'm');
  const match = content.match(pattern);
  if (!match) {
    return undefined;
  }
  const value = match[1] ?? '';
  return value.trim();
}

function upsert(content: string, key: string, value: string): string {
  const assignment = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  if (pattern.test(content)) {
    return content.replace(pattern, assignment);
  }

  const needsNewline = content.length > 0 && !content.endsWith('\n');
  return `${content}${needsNewline ? '\n' : ''}${assignment}\n`;
}

function formatSecretOutput(secret: SecretDefinition, value: string): string {
  return `${secret.key}=${value}  # ${secret.description}`;
}

async function writeSecrets(content: string, updates: SecretRecord): Promise<void> {
  let next = content;
  for (const [key, value] of Object.entries(updates)) {
    next = upsert(next, key, value);
  }

  await writeFile(ENV_FILE, next, 'utf8');
}

async function bootstrap(): Promise<void> {
  const generated: SecretRecord = {};

  if (!existsSync(ENV_FILE)) {
    for (const secret of secrets) {
      generated[secret.key] = generateSecret(secret.bytes);
    }

    console.warn('⚠️  .env.development not found. Create it by copying .env.example:');
    console.warn('    cp .env.example .env.development');
    console.warn('Then add the generated secrets below and re-run the script if needed:\n');
    for (const secret of secrets) {
      console.log(formatSecretOutput(secret, generated[secret.key]));
    }
    return;
  }

  const currentContent = await readFile(ENV_FILE, 'utf8');

  for (const secret of secrets) {
    const existing = extractValue(currentContent, secret.key);
    if (!existing) {
      generated[secret.key] = generateSecret(secret.bytes);
    }
  }

  if (Object.keys(generated).length === 0) {
    console.log('✅ .env.development already contains the required secrets.');
    return;
  }

  await writeSecrets(currentContent, generated);

  console.log('🔐 Added missing secrets to .env.development:');
  for (const secret of secrets) {
    const value = generated[secret.key];
    if (value) {
      console.log(formatSecretOutput(secret, value));
    }
  }
}

bootstrap().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`❌ Failed to bootstrap secrets: ${message}`);
  process.exitCode = 1;
});
