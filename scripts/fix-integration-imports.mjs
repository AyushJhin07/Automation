import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const DIST_INTEGRATIONS_DIR = join(ROOT, 'dist', 'integrations');

const VALID_EXTENSIONS = ['.js', '.json', '.node', '.mjs', '.cjs'];

const importRe = /(from\s+['"])(\.\.?\/[^'"]+?)(['"])/g;
const exportRe = /(export\s+(?:\*\s+from|\{[^}]*\}\s+from)\s+['"])(\.\.?\/[^'"]+?)(['"])/g;

const needsExtension = (specifier) => {
  return !VALID_EXTENSIONS.some((ext) => specifier.endsWith(ext));
};

const patchContent = (content) =>
  content
    .replace(importRe, (match, prefix, specifier, suffix) =>
      needsExtension(specifier) ? `${prefix}${specifier}.js${suffix}` : match,
    )
    .replace(exportRe, (match, prefix, specifier, suffix) =>
      needsExtension(specifier) ? `${prefix}${specifier}.js${suffix}` : match,
    );

const walk = (dir) => {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      const original = readFileSync(fullPath, 'utf8');
      const patched = patchContent(original);
      if (patched !== original) {
        writeFileSync(fullPath, patched, 'utf8');
      }
    }
  }
};

walk(DIST_INTEGRATIONS_DIR);
