#!/usr/bin/env tsx
import { execSync } from 'child_process';
import { readFileSync } from 'fs';

const patterns: Array<{ name: string; regex: RegExp }> = [
  { name: 'OpenAI API key', regex: /sk-[a-zA-Z0-9]{40,}/g },
  { name: 'Google API key', regex: /AIza[0-9A-Za-z\-_]{35}/g },
  { name: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/g },
  { name: 'Private key block', regex: /-----BEGIN (RSA|DSA|EC|OPENSSH) PRIVATE KEY-----/g },
];

function getTrackedFiles(): string[] {
  try {
    const output = execSync('git ls-files', { encoding: 'utf8' });
    return output.split('\n').filter(Boolean);
  } catch (error) {
    console.error('Failed to list git files:', (error as any)?.message || error);
    process.exit(1);
  }
}

function scanFile(file: string): Array<{ pattern: string; match: string }> {
  try {
    const contents = readFileSync(file, 'utf8');
    const findings: Array<{ pattern: string; match: string }> = [];
    for (const pattern of patterns) {
      const matches = contents.match(pattern.regex);
      if (matches) {
        matches.forEach((match) => findings.push({ pattern: pattern.name, match }));
      }
    }
    return findings;
  } catch (error: any) {
    if (error?.code === 'EISDIR') return [];
    if (error?.code === 'ENOENT') return [];
    console.warn(`Skipping ${file}: ${(error as any)?.message || error}`);
    return [];
  }
}

const files = getTrackedFiles();
const results: Array<{ file: string; pattern: string; match: string }> = [];

files.forEach((file) => {
  if (file.startsWith('node_modules') || file.startsWith('dist')) return;
  const findings = scanFile(file);
  findings.forEach((finding) => {
    results.push({ file, pattern: finding.pattern, match: finding.match });
  });
});

if (results.length > 0) {
  console.error('❌ Potential secrets detected:');
  results.forEach((result) => {
    console.error(` - [${result.pattern}] ${result.file}: ${result.match.substring(0, 6)}***`);
  });
  process.exit(1);
}

console.log('✅ No high-risk secrets detected.');
