import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const originalCwd = process.cwd();
const envModuleUrl = pathToFileURL(resolve(originalCwd, 'server/env.ts')).href;

const keysToRestore = ['NODE_ENV', 'DATABASE_URL', 'ENCRYPTION_MASTER_KEY', 'JWT_SECRET'] as const;
const originalEnv: Record<string, string | undefined> = {};
for (const key of keysToRestore) {
  originalEnv[key] = process.env[key];
}

const tempDir = await mkdtemp(join(tmpdir(), 'env-loader-'));

try {
  process.chdir(tempDir);

  for (const key of keysToRestore) {
    delete process.env[key];
  }

  process.env.NODE_ENV = 'test';

  await assert.rejects(
    async () => {
      await import(`${envModuleUrl}?t=${Date.now()}`);
    },
    (error: unknown) => {
      assert.ok(error instanceof Error, 'expected an error instance');
      assert.match(
        error.message,
        /Missing required environment variables: DATABASE_URL/,
        'loader should refuse to start without DATABASE_URL'
      );
      return true;
    },
    'env loader should throw when DATABASE_URL is missing'
  );

  const envLocalPath = resolve(tempDir, '.env.local');
  const envLocalContents = await readFile(envLocalPath, 'utf8');
  assert.match(envLocalContents, /^ENCRYPTION_MASTER_KEY=/m, 'generated file includes encryption key');
  assert.match(envLocalContents, /^JWT_SECRET=/m, 'generated file includes JWT secret');
  assert.ok(process.env.ENCRYPTION_MASTER_KEY, 'encryption key should be populated in process.env');
  assert.ok(process.env.JWT_SECRET, 'jwt secret should be populated in process.env');
} finally {
  process.chdir(originalCwd);
  await rm(tempDir, { recursive: true, force: true });
  for (const key of keysToRestore) {
    const value = originalEnv[key];
    if (typeof value === 'undefined') {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}
