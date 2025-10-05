import { execSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';

function listTrackedFiles(): string[] {
  const output = execSync('git ls-files', { encoding: 'utf8' });
  return output
    .split('\n')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function isIgnoredExample(filePath: string): boolean {
  return /\.env\.example$/i.test(filePath) || filePath.endsWith('docs/.env');
}

function hasSensitiveName(filePath: string): boolean {
  const base = path.basename(filePath).toLowerCase();
  if (isIgnoredExample(filePath)) {
    return false;
  }

  if (base === '.env') {
    return true;
  }

  if (base.startsWith('.env.') || base.endsWith('.env')) {
    return true;
  }

  if (base.includes('secrets') && (base.endsWith('.json') || base.endsWith('.txt'))) {
    return true;
  }

  return false;
}

const secretPatterns: Array<{ pattern: RegExp; description: string }> = [
  { pattern: /AWS_SECRET_ACCESS_KEY\s*=\s*['\"][A-Za-z0-9/+]{20,}['\"]?/i, description: 'AWS secret access key assignment' },
  { pattern: /AIza[0-9A-Za-z\-_]{35}/, description: 'Google API key format (AIza...)' },
  { pattern: /sk-[a-zA-Z0-9]{20,}/, description: 'OpenAI-style API key (sk-...)' },
  { pattern: /-----BEGIN (RSA|EC|DSA) PRIVATE KEY-----/, description: 'PEM private key block' },
];

const trackedFiles = listTrackedFiles();
const flaggedByName = trackedFiles.filter(hasSensitiveName);

const flaggedByContent: Array<{ file: string; description: string }> = [];

for (const filePath of trackedFiles) {
  try {
    const stats = statSync(filePath);
    if (stats.size === 0 || stats.size > 1024 * 1024) {
      continue;
    }

    const content = readFileSync(filePath, 'utf8');
    for (const { pattern, description } of secretPatterns) {
      if (pattern.test(content)) {
        flaggedByContent.push({ file: filePath, description });
        break;
      }
    }
  } catch {
    // Ignore binary files or permission issues
  }
}

if (flaggedByName.length > 0 || flaggedByContent.length > 0) {
  console.error('❌ Potential secrets detected in tracked files:');
  if (flaggedByName.length > 0) {
    for (const file of flaggedByName) {
      console.error(` - ${file}`);
    }
  }
  if (flaggedByContent.length > 0) {
    for (const { file, description } of flaggedByContent) {
      console.error(` - ${file} (${description})`);
    }
  }
  console.error('\nRemove the files or scrub the sensitive values before committing.');
  process.exit(1);
}

console.log('✅ Secret audit passed: no tracked credentials detected.');
